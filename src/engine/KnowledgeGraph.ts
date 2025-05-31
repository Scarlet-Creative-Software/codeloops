import fs from 'node:fs/promises';
import { lock, unlock } from 'proper-lockfile';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import readline from 'node:readline';
import { dataDir } from '../config.ts';
import { CodeLoopsLogger } from '../logger.ts';
import { ActorThinkInput } from './ActorCriticEngine.ts';
import { TagEnum, Tag } from './tags.ts';
import { KnowledgeGraphIndexSystem } from './IndexSystem.ts';
import { SemanticCacheManager, createSemanticCacheManager, SemanticQuery } from './SemanticCacheManager.ts';
import { PerformanceConfig } from '../config/schema.ts';

// -----------------------------------------------------------------------------
// Interfaces & Schemas --------------------------------------------------------
// -----------------------------------------------------------------------------

export interface WithProjectContext {
  project: string;
  projectContext: string;
}

export const FILE_REF = z.object({
  name: z.string(), // human label ("UML‑AuthSeq")
  uri: z.string().optional(), // optional external link or S3 key
  /** Absolute or repo‑relative path, e.g. "QuickRecorder/CameraOverlay.swift" */
  path: z.string(),
  /** Optional hash to lock content for provenance */
  hash: z.string().optional(),
  /** Optional MIME, e.g. "text/x-swift" */
  contentType: z.string().optional(),
});
export type ArtifactRef = z.infer<typeof FILE_REF>;

export interface DagNode extends ActorThinkInput, WithProjectContext {
  id: string;
  thought: string;
  role: 'actor' | 'critic' | 'summary';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string; // nodeId this criticises
  /** Optional git-style diff summarizing code changes. */
  diff?: string;
  parents: string[];
  children: string[];
  createdAt: string; // ISO timestamp
  summarizedSegment?: string[]; // IDs of nodes summarized (for summary nodes)
  metadata?: Record<string, unknown>; // Additional metadata for specialized nodes
}

export interface SummaryNode extends DagNode {
  role: 'summary';
  summarizedSegment: string[]; // IDs of nodes summarized
}

// -----------------------------------------------------------------------------
// KnowledgeGraphManager -------------------------------------------------------
// -----------------------------------------------------------------------------

export class KnowledgeGraphManager {
  private logFilePath: string = path.resolve(dataDir, 'knowledge_graph.ndjson');
  private logger: CodeLoopsLogger;
  private hasLoggedParseError = false;
  private nodeCache = new Map<string, DagNode | null>();
  private cacheTimeout = 30000; // 30 seconds
  private indexSystem: KnowledgeGraphIndexSystem;
  private isIndexInitialized = false;
  private semanticCacheManager?: SemanticCacheManager;
  private semanticCacheConfig?: PerformanceConfig['semanticCache'];
  
  // Size monitoring properties
  private readonly MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit
  private lastSizeCheck = 0;
  private sizeCheckInterval = 10000; // Check every 10 seconds

  // Schema for validating DagNode entries
  private static DagNodeSchema = z.object({
    id: z.string(),
    project: z.string(),
    projectContext: z.string(),
    thought: z.string(),
    role: z.enum(['actor', 'critic', 'summary']),
    createdAt: z.string().datetime(),
    parents: z.array(z.string()),
    children: z.array(z.string()),
    verdict: z.enum(['approved', 'needs_revision', 'reject']).optional(),
    verdictReason: z.string().optional(),
    verdictReferences: z.array(z.string()).optional(),
    target: z.string().optional(),
    summarizedSegment: z.array(z.string()).optional(),
    diff: z.string().optional(),
    tags: z.array(TagEnum).optional(),
    artifacts: z.array(FILE_REF).optional(),
    metadata: z.record(z.any()).optional(),
  });

  constructor(logger: CodeLoopsLogger, semanticCacheConfig?: PerformanceConfig['semanticCache']) {
    this.logger = logger;
    this.indexSystem = new KnowledgeGraphIndexSystem();
    this.semanticCacheConfig = semanticCacheConfig;
    
    // Initialize semantic cache if enabled
    if (semanticCacheConfig?.enabled) {
      this.semanticCacheManager = createSemanticCacheManager(semanticCacheConfig, logger);
    }
  }

  async init() {
    this.logger.info(`[KnowledgeGraphManager] Initializing from ${this.logFilePath}`);
    await this.loadLog();
    await this.initializeIndex();
    
    // Initialize semantic cache if enabled
    if (this.semanticCacheManager) {
      await this.semanticCacheManager.initialize();
    }
  }

  private async loadLog() {
    if (!(await fs.stat(this.logFilePath).catch(() => null))) {
      this.logger.info(`[KnowledgeGraphManager] Creating new log file at ${this.logFilePath}`);
      await fs.mkdir(path.dirname(this.logFilePath), { recursive: true });
      await fs.writeFile(this.logFilePath, '');
      return;
    }
  }

  /**
   * Initialize the B-tree index system by reading all existing nodes
   * Uses streaming parser to handle large files without memory issues
   * This provides O(log n) performance for subsequent operations
   */
  private async initializeIndex() {
    if (this.isIndexInitialized) return;
    
    const startTime = Date.now();
    
    // Check file size first
    let fileSize = 0;
    try {
      const stats = await fs.stat(this.logFilePath);
      fileSize = stats.size;
      const sizeInMB = fileSize / (1024 * 1024);
      
      if (sizeInMB > 20) {
        this.logger.warn({ 
          fileSize: `${sizeInMB.toFixed(2)}MB`,
          estimatedNodes: Math.floor(fileSize / 500) // Rough estimate
        }, '[KnowledgeGraphManager] Large file detected - using streaming parser with progress tracking');
      } else {
        this.logger.info('[KnowledgeGraphManager] Building B-tree indices...');
      }
    } catch (error) {
      this.logger.warn({ error }, 'Could not check file size, proceeding with index build');
    }
    
    const fileStream = fsSync.createReadStream(this.logFilePath, { 
      encoding: 'utf8',
      highWaterMark: 64 * 1024 // 64KB chunks for better memory management
    });
    const rl = readline.createInterface({ 
      input: fileStream, 
      crlfDelay: Infinity,
      // Increase buffer size for large files
      ...(fileSize > 10 * 1024 * 1024 && { historySize: 0 }) // Disable history for large files
    });
    
    let nodeCount = 0;
    let errorCount = 0;
    let lastProgressReport = Date.now();
    const progressInterval = 5000; // Report progress every 5 seconds
    
    try {
      for await (const line of rl) {
        const node = this.parseDagNode(line);
        if (node) {
          this.indexSystem.indexNode(node);
          nodeCount++;
          
          // Progress reporting for large files
          const now = Date.now();
          if (fileSize > 10 * 1024 * 1024 && now - lastProgressReport > progressInterval) {
            this.logger.info({ 
              processed: nodeCount, 
              errors: errorCount,
              timeElapsed: `${((now - startTime) / 1000).toFixed(1)}s`
            }, '[KnowledgeGraphManager] Indexing progress...');
            lastProgressReport = now;
          }
        } else {
          errorCount++;
        }
        
        // Memory management: periodically clean up node cache for very large files
        if (nodeCount % 10000 === 0 && this.nodeCache.size > 1000) {
          this.nodeCache.clear();
        }
      }
    } catch (error) {
      this.logger.error({ error, nodeCount, errorCount }, 'Error during index initialization');
      throw error;
    } finally {
      rl.close();
      fileStream.close();
    }
    
    const duration = Date.now() - startTime;
    const stats = this.indexSystem.getStats();
    
    this.logger.info(
      `[KnowledgeGraphManager] Index built successfully: ${nodeCount} nodes, ` +
      `${stats.totalProjects} projects, ${stats.totalTags} tags, ` +
      `${stats.totalContentTerms} content terms in ${duration}ms` +
      (errorCount > 0 ? ` (${errorCount} parse errors)` : '')
    );
    
    this.isIndexInitialized = true;
  }

  private parseDagNode(line: string): DagNode | null {
    try {
      const parsed = JSON.parse(line);
      
      // Handle legacy nodes with invalid tag enums gracefully
      if (parsed.tags && Array.isArray(parsed.tags)) {
        const validTags = ['requirement', 'task', 'design', 'risk', 'task-complete', 'summary'];
        parsed.tags = parsed.tags.filter((tag: string) => validTags.includes(tag));
        
        // If no valid tags remain, assign a default tag
        if (parsed.tags.length === 0) {
          parsed.tags = ['task']; // Default fallback
        }
      }
      
      const validated = KnowledgeGraphManager.DagNodeSchema.parse(parsed);
      return validated as DagNode;
    } catch (err) {
      // Only log parsing errors once per session to prevent log spam
      if (!this.hasLoggedParseError) {
        this.logger.error({ err, line: line.slice(0, 200) + '...' }, 'Invalid DagNode entry (subsequent errors suppressed)');
        this.hasLoggedParseError = true;
      }
      return null;
    }
  }

  /**
   * Check if knowledge graph file is approaching size limits
   * Returns true if size is acceptable, false if action needed
   */
  private async checkFileSize(): Promise<boolean> {
    const now = Date.now();
    
    // Only check periodically to avoid frequent file system calls
    if (now - this.lastSizeCheck < this.sizeCheckInterval) {
      return true; // Assume OK if we checked recently
    }
    
    this.lastSizeCheck = now;
    
    try {
      const stats = await fs.stat(this.logFilePath);
      const sizeInMB = stats.size / (1024 * 1024);
      
      if (stats.size > this.MAX_FILE_SIZE_BYTES) {
        this.logger.error({ 
          currentSize: `${sizeInMB.toFixed(2)}MB`,
          maxSize: `${this.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
          filePath: this.logFilePath 
        }, '🚨 CRITICAL: Knowledge graph file exceeds size limit!');
        
        // Archive the current file and start fresh
        await this.archiveOversizedFile();
        return true; // Continue after archival
      }
      
      // Warn at 80% of limit
      if (stats.size > this.MAX_FILE_SIZE_BYTES * 0.8) {
        this.logger.warn({ 
          currentSize: `${sizeInMB.toFixed(2)}MB`,
          maxSize: `${this.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
          percentFull: `${(stats.size / this.MAX_FILE_SIZE_BYTES * 100).toFixed(1)}%`
        }, '⚠️  Knowledge graph file approaching size limit');
      }
      
      return true;
    } catch (error) {
      this.logger.warn({ error }, 'Failed to check knowledge graph file size');
      return true; // Continue on error
    }
  }

  /**
   * Archive oversized knowledge graph file and start fresh
   */
  private async archiveOversizedFile(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = `${this.logFilePath}.archive-${timestamp}`;
    
    try {
      this.logger.info({ archivePath }, 'Archiving oversized knowledge graph file');
      
      // Move current file to archive
      await fs.rename(this.logFilePath, archivePath);
      
      // Create new empty file
      await fs.writeFile(this.logFilePath, '');
      
      // Clear caches and reinitialize
      this.nodeCache.clear();
      this.indexSystem = new KnowledgeGraphIndexSystem();
      this.isIndexInitialized = false;
      
      this.logger.info({ 
        archivedFile: archivePath,
        newFile: this.logFilePath 
      }, '✅ Knowledge graph archived and reset');
      
    } catch (error) {
      this.logger.error({ error, archivePath }, 'Failed to archive oversized knowledge graph file');
      throw error;
    }
  }

  async appendEntity(entity: DagNode, retries = 3) {
    // Check file size before appending to prevent oversized files
    await this.checkFileSize();
    
    // Temporarily disable cycle detection to fix performance issues
    // TODO: Re-enable with optimized algorithm once performance is stable
    // if (await this.wouldCreateCycle(entity)) {
    //   throw new Error(`Appending node ${entity.id} would create a cycle`);
    // }

    entity.createdAt = new Date().toISOString();
    const line = JSON.stringify(entity) + '\n';
    let err: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await lock(this.logFilePath, { retries: 0 });
        await fs.appendFile(this.logFilePath, line, 'utf8');
        
        // Update index system after successful write
        if (this.isIndexInitialized) {
          this.indexSystem.indexNode(entity);
        }
        
        // Invalidate semantic cache for related queries
        if (this.semanticCacheManager && entity.tags) {
          await this.semanticCacheManager.invalidateByTags(entity.tags.map(t => t.toString()));
        }
        
        return;
      } catch (e: unknown) {
        err = e as Error;
        this.logger.warn({ err, attempt }, `Retry ${attempt} failed appending entity`);
        if (attempt === retries) break;
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      } finally {
        try {
          await unlock(this.logFilePath);
        } catch (unlockErr) {
          this.logger.error({ err: unlockErr, stack: (unlockErr as Error).stack }, 'Failed to unlock file');
        }
      }
    }

    this.logger.error({ err }, 'Error appending entity after retries');
    throw err;
  }

  /**
   * Data cleanup utility to remove stale or old knowledge graph entries
   * This helps prevent oversized files and maintains performance
   */
  async cleanupStaleEntries(options: {
    olderThanDays?: number;
    maxNodes?: number;
    dryRun?: boolean;
  } = {}): Promise<{ removed: number; kept: number; sizeBefore: number; sizeAfter: number }> {
    const { olderThanDays = 30, maxNodes = 50000, dryRun = false } = options;
    
    this.logger.info({ olderThanDays, maxNodes, dryRun }, 'Starting knowledge graph cleanup');
    
    // Get file size before cleanup
    const statsBefore = await fs.stat(this.logFilePath);
    const sizeBefore = statsBefore.size;
    
    if (sizeBefore === 0) {
      return { removed: 0, kept: 0, sizeBefore: 0, sizeAfter: 0 };
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    
    const keptNodes: string[] = [];
    let removedCount = 0;
    let keptCount = 0;
    let totalProcessed = 0;
    
    try {
      for await (const line of rl) {
        totalProcessed++;
        const node = this.parseDagNode(line);
        
        if (!node) {
          removedCount++; // Count invalid entries as removed
          continue;
        }
        
        const nodeDate = new Date(node.createdAt);
        const shouldKeep = nodeDate > cutoffDate && keptCount < maxNodes;
        
        if (shouldKeep) {
          keptNodes.push(line);
          keptCount++;
        } else {
          removedCount++;
        }
        
        // Log progress for large cleanups
        if (totalProcessed % 10000 === 0) {
          this.logger.info({ 
            processed: totalProcessed, 
            kept: keptCount, 
            removed: removedCount 
          }, 'Cleanup progress...');
        }
      }
    } finally {
      rl.close();
      fileStream.close();
    }
    
    let sizeAfter = sizeBefore;
    
    if (!dryRun && removedCount > 0) {
      // Create backup of original file
      const backupPath = `${this.logFilePath}.cleanup-backup-${Date.now()}`;
      await fs.rename(this.logFilePath, backupPath);
      
      // Write cleaned data
      await fs.writeFile(this.logFilePath, keptNodes.join('\n') + (keptNodes.length > 0 ? '\n' : ''));
      
      // Get new file size
      const statsAfter = await fs.stat(this.logFilePath);
      sizeAfter = statsAfter.size;
      
      // Clear caches and reinitialize index
      this.nodeCache.clear();
      this.indexSystem = new KnowledgeGraphIndexSystem();
      this.isIndexInitialized = false;
      await this.initializeIndex();
      
      this.logger.info({ 
        backupPath,
        sizeBefore: `${(sizeBefore / 1024 / 1024).toFixed(2)}MB`,
        sizeAfter: `${(sizeAfter / 1024 / 1024).toFixed(2)}MB`,
        spaceFreed: `${((sizeBefore - sizeAfter) / 1024 / 1024).toFixed(2)}MB`
      }, '✅ Knowledge graph cleanup completed');
    }
    
    return { 
      removed: removedCount, 
      kept: keptCount, 
      sizeBefore, 
      sizeAfter 
    };
  }

  /**
   * Health monitoring for data directory sizes and growth rates
   */
  async getDataHealthMetrics(): Promise<{
    knowledgeGraph: { size: number; sizeFormatted: string; nodeCount: number };
    dataDirectory: { totalSize: number; totalSizeFormatted: string; fileCount: number };
    semanticCache: { size: number; sizeFormatted: string; fileCount: number };
    recommendations: string[];
  }> {
    const recommendations: string[] = [];
    
    // Check knowledge graph file
    const kgStats = await fs.stat(this.logFilePath).catch(() => null);
    const kgSize = kgStats?.size || 0;
    const kgSizeMB = kgSize / (1024 * 1024);
    
    // Estimate node count from current index or file size
    const nodeCount = this.isIndexInitialized 
      ? this.indexSystem.getStats().totalNodes 
      : Math.floor(kgSize / 500); // Rough estimate
    
    // Check entire data directory
    let totalDataSize = 0;
    let totalFileCount = 0;
    try {
      const dataFiles = await fs.readdir(dataDir);
      for (const file of dataFiles) {
        const filePath = path.join(dataDir, file);
        const stat = await fs.stat(filePath).catch(() => null);
        if (stat?.isFile()) {
          totalDataSize += stat.size;
          totalFileCount++;
        }
      }
    } catch (error) {
      this.logger.warn({ error }, 'Could not read data directory for health check');
    }
    
    // Check semantic cache directory
    let cacheSize = 0;
    let cacheFileCount = 0;
    const cacheDir = path.join(dataDir, 'semantic_cache');
    try {
      const cacheFiles = await fs.readdir(cacheDir);
      for (const file of cacheFiles) {
        const filePath = path.join(cacheDir, file);
        const stat = await fs.stat(filePath).catch(() => null);
        if (stat?.isFile()) {
          cacheSize += stat.size;
          cacheFileCount++;
        }
      }
    } catch {
      // Cache directory might not exist yet
    }
    
    // Generate recommendations
    if (kgSizeMB > 8) {
      recommendations.push(`🚨 Knowledge graph file is ${kgSizeMB.toFixed(1)}MB (>8MB). Consider cleanup.`);
    } else if (kgSizeMB > 5) {
      recommendations.push(`⚠️ Knowledge graph file is ${kgSizeMB.toFixed(1)}MB. Monitor for growth.`);
    }
    
    if (nodeCount > 40000) {
      recommendations.push(`📊 High node count (${nodeCount.toLocaleString()}). Consider archiving old entries.`);
    }
    
    const totalDataSizeMB = totalDataSize / (1024 * 1024);
    if (totalDataSizeMB > 50) {
      recommendations.push(`💽 Total data directory is ${totalDataSizeMB.toFixed(1)}MB. Review for cleanup opportunities.`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('✅ All data sizes are within healthy limits.');
    }
    
    return {
      knowledgeGraph: {
        size: kgSize,
        sizeFormatted: `${kgSizeMB.toFixed(2)}MB`,
        nodeCount
      },
      dataDirectory: {
        totalSize: totalDataSize,
        totalSizeFormatted: `${totalDataSizeMB.toFixed(2)}MB`,
        fileCount: totalFileCount
      },
      semanticCache: {
        size: cacheSize,
        sizeFormatted: `${(cacheSize / 1024 / 1024).toFixed(2)}MB`,
        fileCount: cacheFileCount
      },
      recommendations
    };
  }

  private async getCachedNode(id: string): Promise<DagNode | undefined> {
    // Check cache first
    if (this.nodeCache.has(id)) {
      const cached = this.nodeCache.get(id);
      return cached || undefined;
    }

    // If not in cache, fetch from file
    const node = await this.getNode(id);
    
    // Cache the result (including null for non-existent nodes)
    this.nodeCache.set(id, node || null);
    
    // Clear cache after timeout to prevent memory leaks
    setTimeout(() => {
      this.nodeCache.delete(id);
    }, this.cacheTimeout);
    
    return node;
  }

  private async wouldCreateCycle(entity: DagNode): Promise<boolean> {
    // Simplified cycle detection - only check direct parent-child relationships
    // In most cases, cycles are created by direct circular references
    
    const visited = new Set<string>();
    const checkPath = async (currentId: string, targetId: string, depth: number): Promise<boolean> => {
      // Limit recursion depth to prevent infinite loops and improve performance
      if (depth > 10) return false;
      
      if (currentId === targetId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);

      const node = await this.getCachedNode(currentId);
      if (!node) return false;

      // Only check immediate children to limit scan scope
      for (const childId of node.children.slice(0, 5)) { // Limit to 5 children max
        if (await checkPath(childId, targetId, depth + 1)) return true;
      }
      return false;
    };

    // Only check the first few parents to avoid exponential complexity
    for (const parentId of entity.parents.slice(0, 3)) { // Limit to 3 parents max
      if (await checkPath(entity.id, parentId, 0)) {
        return true;
      }
    }
    return false;
  }

  async getNode(id: string): Promise<DagNode | undefined> {
    // Use index system if available for O(log n) lookup
    if (this.isIndexInitialized) {
      return this.indexSystem.getNode(id);
    }
    
    // Fallback to linear scan for backward compatibility
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let found: DagNode | undefined;
    try {
      for await (const line of rl) {
        const entry = this.parseDagNode(line);
        if (entry?.id === id) {
          found = entry; // keep scanning for the latest entry
        }
      }
      return found;
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  async getNeighbors(id: string, depth = 1): Promise<DagNode[]> {
    if (depth < 0) depth = 0;
    const start = await this.getNode(id);
    if (!start) return [];
    const result = new Map<string, DagNode>();
    result.set(start.id, start);

    const traverse = async (node: DagNode, currentDepth: number) => {
      if (currentDepth >= depth) return;
      const neighborIds = [...node.parents, ...node.children];
      for (const nid of neighborIds) {
        if (result.has(nid)) continue;
        const neighbor = await this.getNode(nid);
        if (neighbor) {
          result.set(nid, neighbor);
          await traverse(neighbor, currentDepth + 1);
        }
      }
    };

    await traverse(start, 0);
    return Array.from(result.values());
  }

  async *streamDagNodes(project: string): AsyncGenerator<DagNode, void, unknown> {
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const node = this.parseDagNode(line);
        if (node?.project === project) {
          yield node;
        }
      }
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  async allDagNodes(project: string): Promise<DagNode[]> {
    // Use index system if available for O(log n + k) lookup
    if (this.isIndexInitialized) {
      return this.indexSystem.getNodesByProject(project);
    }
    
    // Fallback to streaming for backward compatibility
    const nodes: DagNode[] = [];
    for await (const node of this.streamDagNodes(project)) {
      nodes.push(node);
    }
    return nodes;
  }

  async resume({ project, limit = 5 }: { project: string; limit?: number }): Promise<DagNode[]> {
    return this.export({ project, limit });
  }

  async export({
    project,
    filterFn,
    limit,
  }: {
    project: string;
    filterFn?: (node: DagNode) => boolean;
    limit?: number;
  }): Promise<DagNode[]> {
    // Use index system for simple cases
    if (this.isIndexInitialized) {
      // If we have a limit and no complex filter, use efficient indexed lookup
      if (limit && !filterFn) {
        return this.indexSystem.getRecentNodes(project, limit);
      }
      
      // For simple project-based queries, use indexed lookup then filter
      if (!filterFn || limit) {
        let nodes = this.indexSystem.getNodesByProject(project);
        if (filterFn) {
          nodes = nodes.filter(filterFn);
        }
        if (limit) {
          // Sort by creation date (oldest first to maintain insertion order)
          nodes.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          nodes = nodes.slice(-limit); // Take the last N nodes (most recent in chronological order)
        }
        return nodes;
      }
    }

    // Fallback to file scanning for complex queries or when index not ready
    const nodes: DagNode[] = [];
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const node = this.parseDagNode(line);
        if (!node || node.project !== project) continue;
        if (filterFn && !filterFn(node)) continue;
        nodes.push(node);
        if (limit && nodes.length > limit) nodes.shift();
      }
      return nodes;
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  // New efficient method to get recent nodes by reading file in reverse
  private async getRecentNodes(project: string, limit: number): Promise<DagNode[]> {
    const nodes: DagNode[] = [];
    const fileSize = (await fs.stat(this.logFilePath)).size;
    
    if (fileSize === 0) return nodes;
    
    // Read file in chunks from the end
    const chunkSize = Math.min(8192, fileSize); // 8KB chunks
    let position = fileSize;
    let buffer = '';
    let foundNodes = 0;
    
    while (position > 0 && foundNodes < limit) {
      const readSize = Math.min(chunkSize, position);
      position -= readSize;
      
      const fileHandle = await fs.open(this.logFilePath, 'r');
      const { buffer: chunk } = await fileHandle.read({
        buffer: Buffer.alloc(readSize),
        offset: 0,
        length: readSize,
        position,
      });
      await fileHandle.close();
      
      // Prepend chunk to buffer
      buffer = chunk.toString('utf8') + buffer;
      
      // Process complete lines from the end
      const lines = buffer.split('\n');
      buffer = lines.shift() || ''; // Keep incomplete line at start for next iteration
      
      // Process lines in reverse order (most recent first)
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const node = this.parseDagNode(line);
        if (node && node.project === project) {
          nodes.unshift(node); // Add to beginning to maintain chronological order
          foundNodes++;
          if (foundNodes >= limit) break;
        }
      }
    }
    
    return nodes;
  }

  async search({
    project,
    tags,
    query,
    limit,
  }: {
    project: string;
    tags?: Tag[];
    query?: string;
    limit?: number;
  }): Promise<DagNode[]> {
    // Use semantic cache if available and query has text content
    if (this.semanticCacheManager && query) {
      const semanticQuery: SemanticQuery = {
        project,
        query,
        tags: tags?.map(t => t.toString()),
        limit
      };
      
      // Define fallback function for cache miss
      const fallbackFn = async (): Promise<DagNode[]> => {
        return this.performDirectSearch(project, tags, query, limit);
      };
      
      try {
        const cacheResult = await this.semanticCacheManager.searchWithCache(semanticQuery, fallbackFn);
        
        // Log cache performance for monitoring
        this.logger.debug(`[KnowledgeGraphManager] Search completed`, {
          source: cacheResult.source,
          confidence: cacheResult.confidence,
          similarity: cacheResult.similarity,
          resultCount: cacheResult.results.length,
          searchTime: cacheResult.metrics.searchTime,
          embeddingTime: cacheResult.metrics.embeddingTime,
          apiTime: cacheResult.metrics.apiTime
        });
        
        return cacheResult.results;
        
      } catch (error) {
        this.logger.warn('[KnowledgeGraphManager] Semantic cache failed, falling back to direct search', {
          error: error instanceof Error ? error.message : String(error)
        });
        // Fall back to direct search on cache failure
        return this.performDirectSearch(project, tags, query, limit);
      }
    }
    
    // Direct search without semantic caching
    return this.performDirectSearch(project, tags, query, limit);
  }

  private async performDirectSearch(
    project: string,
    tags?: Tag[],
    query?: string,
    limit?: number
  ): Promise<DagNode[]> {
    // Use index system for optimized search
    if (this.isIndexInitialized) {
      let results: DagNode[] = [];
      
      // Start with project nodes
      const projectNodes = this.indexSystem.getNodesByProject(project);
      
      // Apply tag filter if specified
      if (tags && tags.length > 0) {
        const taggedNodes = this.indexSystem.getNodesByTags(tags);
        // Intersection of project and tagged nodes
        const projectNodeIds = new Set(projectNodes.map(n => n.id));
        results = taggedNodes.filter(node => projectNodeIds.has(node.id));
      } else {
        results = projectNodes;
      }
      
      // Apply content search if specified
      if (query) {
        const contentNodes = this.indexSystem.searchContent(query);
        const currentNodeIds = new Set(results.map(n => n.id));
        results = contentNodes.filter(node => 
          currentNodeIds.has(node.id) && node.project === project
        );
      }
      
      // Apply limit
      if (limit) {
        // Sort by creation date (most recent first)
        results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        results = results.slice(0, limit);
      }
      
      return results;
    }
    
    // Fallback to linear search
    const q = query?.toLowerCase();
    return this.export({
      project,
      limit,
      filterFn: (node) => {
        if (tags && (!node.tags || !tags.every((t) => node.tags!.includes(t)))) {
          return false;
        }
        if (q && !node.thought.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      },
    });
  }

  async getArtifactHistory(project: string, path: string, limit?: number): Promise<DagNode[]> {
    return this.export({
      project,
      limit,
      filterFn: (node) => !!node.artifacts?.some((a) => a.path === path),
    });
  }

  async listOpenTasks(project: string): Promise<DagNode[]> {
    // Use export with filter to find all open tasks
    return this.export({
      project,
      filterFn: (node) => 
        node.role === 'actor' && 
        node.tags?.includes(Tag.Task) &&
        !node.tags?.includes(Tag.TaskComplete)
    });
  }

  async getHeads(project: string): Promise<DagNode[]> {
    // Use export to get all nodes and filter for heads (nodes with no children)
    return this.export({
      project,
      filterFn: (node) => node.children.length === 0
    });
  }

  async listProjects(): Promise<string[]> {
    // Use index system for O(log n) lookup
    if (this.isIndexInitialized) {
      return this.indexSystem.getAllProjects();
    }
    
    // Fallback to linear scan
    const projects = new Set<string>();
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const entry = this.parseDagNode(line);
        if (entry?.project && !projects.has(entry.project)) {
          projects.add(entry.project);
        }
      }
      return Array.from(projects);
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  /**
   * Get index system statistics for monitoring and debugging
   */
  getIndexStats() {
    if (!this.isIndexInitialized) {
      return { indexed: false, message: 'Index not initialized' };
    }
    
    return {
      indexed: true,
      ...this.indexSystem.getStats()
    };
  }

  /**
   * Get semantic cache statistics for monitoring and debugging
   */
  getSemanticCacheStats() {
    if (!this.semanticCacheManager) {
      return { enabled: false, message: 'Semantic cache not enabled' };
    }
    
    return {
      enabled: true,
      ...this.semanticCacheManager.getMetrics()
    };
  }

  /**
   * Force rebuild of the index system
   * Useful for recovery or after manual file modifications
   */
  async rebuildIndex() {
    this.logger.info('[KnowledgeGraphManager] Rebuilding index...');
    this.indexSystem.clear();
    this.isIndexInitialized = false;
    await this.initializeIndex();
  }

  /**
   * Cleanup expired cache entries and optimize storage
   */
  async cleanup() {
    this.logger.info('[KnowledgeGraphManager] Running cleanup...');
    
    if (this.semanticCacheManager) {
      await this.semanticCacheManager.cleanup();
    }
    
    this.logger.info('[KnowledgeGraphManager] Cleanup completed');
  }

  /**
   * Clear all caches and reset state
   */
  async clearCaches() {
    this.logger.info('[KnowledgeGraphManager] Clearing caches...');
    
    // Clear node cache
    this.nodeCache.clear();
    
    // Clear semantic cache if available
    if (this.semanticCacheManager) {
      await this.semanticCacheManager.clear();
    }
    
    this.logger.info('[KnowledgeGraphManager] All caches cleared');
  }
}
