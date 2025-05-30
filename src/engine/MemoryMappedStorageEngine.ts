/**
 * Memory-Mapped Storage Engine for Large Knowledge Graphs
 * 
 * This engine provides efficient storage and retrieval of knowledge graph nodes
 * using memory-mapped files to handle datasets that exceed available RAM.
 * 
 * Features:
 * - Memory-mapped file access for O(1) to O(log n) operations
 * - Adaptive memory management with LRU eviction
 * - Cross-platform compatibility (macOS, Linux, Windows)
 * - Backward compatibility with NDJSON format
 * - Integrated compression and integrity validation
 */

import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
// Note: z import will be used for future validation schemas
import { CodeLoopsLogger } from '../logger.ts';
import { DagNode } from './KnowledgeGraph.ts';

// -----------------------------------------------------------------------------
// Configuration & Types -------------------------------------------------------
// -----------------------------------------------------------------------------

export interface MemoryMappedStorageConfig {
  filePath: string;
  maxMemoryUsage: number;    // Maximum RAM usage in bytes (default: 512MB)
  blockSize: number;         // Block size for memory alignment (default: 4KB)
  enableCompression: boolean; // Enable block compression (default: true)
  legacyCompatibility: boolean; // Support NDJSON migration (default: true)
  backgroundFlushInterval: number; // Auto-flush interval in ms (default: 30s)
}

export interface FileHeader {
  magic: number;           // Magic number 0x434C4F4F ("CLOO")
  version: number;         // File format version
  nodeCount: number;       // Total nodes in file
  indexOffset: number;     // Byte offset to index section
  dataOffset: number;      // Byte offset to data section  
  blockSize: number;       // Block size for alignment
  compressionType: number; // Compression algorithm (0=none, 1=gzip)
  checksum: number;        // File integrity checksum
}

export interface BlockHandle {
  offset: number;          // File offset
  size: number;           // Block size in bytes
  compressed: boolean;    // Whether block is compressed
  checksum: number;       // Block integrity checksum
}

export interface NodeMetadata {
  id: string;
  blockHandle: BlockHandle;
  lastAccessed: number;   // Timestamp for LRU tracking
  accessCount: number;    // Access frequency for hot data detection
}

export interface MemoryStats {
  totalAllocated: number;
  activeBlocks: number;
  cachedNodes: number;
  hitRate: number;
  evictionCount: number;
  memoryPressure: 'low' | 'medium' | 'high' | 'critical';
}

// -----------------------------------------------------------------------------
// Memory-Mapped Storage Engine -----------------------------------------------
// -----------------------------------------------------------------------------

export class MemoryMappedStorageEngine {
  private config: MemoryMappedStorageConfig;
  private logger: CodeLoopsLogger;
  private fileHandle?: fs.FileHandle;
  private fileHeader?: FileHeader;
  private isInitialized = false;
  
  // Memory management
  private nodeCache = new Map<string, DagNode>();
  private nodeMetadata = new Map<string, NodeMetadata>();
  private accessQueue: string[] = []; // LRU queue
  private currentMemoryUsage = 0;
  private backgroundFlushTimer?: NodeJS.Timeout;
  
  // Statistics
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    evictions: 0,
    totalAccesses: 0,
  };

  constructor(config: MemoryMappedStorageConfig, logger: CodeLoopsLogger) {
    this.config = config;
    this.logger = logger;
    
    // Validate configuration
    this.validateConfig();
  }

  // ---------------------------------------------------------------------------
  // Core Lifecycle Methods ---------------------------------------------------
  // ---------------------------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('[MemoryMappedStorageEngine] Already initialized, skipping');
      return;
    }

    this.logger.info('[MemoryMappedStorageEngine] Initializing storage engine', {
      filePath: this.config.filePath,
      maxMemoryUsage: this.formatBytes(this.config.maxMemoryUsage),
      blockSize: this.formatBytes(this.config.blockSize),
      compression: this.config.enableCompression
    });

    try {
      // Check if file exists and validate format
      const fileExists = await this.fileExists(this.config.filePath);
      
      if (fileExists) {
        await this.openExistingFile();
      } else {
        await this.createNewFile();
      }

      // Setup background maintenance
      this.setupBackgroundTasks();
      
      this.isInitialized = true;
      this.logger.info('[MemoryMappedStorageEngine] Initialization complete');
      
    } catch (error) {
      this.logger.error('[MemoryMappedStorageEngine] Initialization failed', { error });
      throw new Error(`Failed to initialize storage engine: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async shutdown(): Promise<void> {
    this.logger.info('[MemoryMappedStorageEngine] Shutting down storage engine');
    
    try {
      // Clear background tasks
      if (this.backgroundFlushTimer) {
        clearInterval(this.backgroundFlushTimer);
        this.backgroundFlushTimer = undefined;
      }
      
      // Flush any pending data (only if initialized)
      if (this.isInitialized) {
        await this.flushToDisk();
      }
      
      // Close file handle
      if (this.fileHandle) {
        await this.fileHandle.close();
        this.fileHandle = undefined;
      }
      
      // Clear caches
      this.nodeCache.clear();
      this.nodeMetadata.clear();
      this.accessQueue.length = 0;
      this.currentMemoryUsage = 0;
      
      this.isInitialized = false;
      this.logger.info('[MemoryMappedStorageEngine] Shutdown complete');
      
    } catch (error) {
      this.logger.error('[MemoryMappedStorageEngine] Shutdown failed', { error });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Node Operations -----------------------------------------------------------
  // ---------------------------------------------------------------------------

  async getNode(nodeId: string): Promise<DagNode | undefined> {
    this.ensureInitialized();
    this.stats.totalAccesses++;
    
    // Check cache first
    const cached = this.nodeCache.get(nodeId);
    if (cached) {
      this.stats.cacheHits++;
      this.updateAccessTracking(nodeId);
      return cached;
    }
    
    this.stats.cacheMisses++;
    
    // Load from disk
    const metadata = this.nodeMetadata.get(nodeId);
    if (!metadata) {
      return undefined;
    }
    
    try {
      const node = await this.loadNodeFromDisk(metadata);
      
      // Cache the node
      await this.cacheNode(nodeId, node);
      this.updateAccessTracking(nodeId);
      
      return node;
      
    } catch (error) {
      this.logger.error('[MemoryMappedStorageEngine] Failed to load node', { 
        nodeId, 
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  async insertNode(node: DagNode): Promise<void> {
    this.ensureInitialized();
    
    try {
      // TODO: Implement node insertion logic
      // This will involve:
      // 1. Serializing the node
      // 2. Allocating a block for storage
      // 3. Writing the block to disk
      // 4. Updating metadata and indices
      // 5. Caching the node
      
      this.logger.debug('[MemoryMappedStorageEngine] Node insertion not yet implemented', { nodeId: node.id });
      throw new Error('Node insertion not yet implemented');
      
    } catch (error) {
      this.logger.error('[MemoryMappedStorageEngine] Failed to insert node', { 
        nodeId: node.id, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async bulkInsert(nodes: DagNode[]): Promise<void> {
    this.ensureInitialized();
    
    // TODO: Implement bulk insertion with batching
    // This should be more efficient than individual inserts
    
    this.logger.debug('[MemoryMappedStorageEngine] Bulk insertion not yet implemented', { 
      nodeCount: nodes.length 
    });
    throw new Error('Bulk insertion not yet implemented');
  }

  async deleteNode(nodeId: string): Promise<boolean> {
    this.ensureInitialized();
    
    // TODO: Implement node deletion
    // This involves:
    // 1. Removing from cache
    // 2. Marking block as free
    // 3. Updating metadata
    // 4. Updating indices
    
    this.logger.debug('[MemoryMappedStorageEngine] Node deletion not yet implemented', { nodeId });
    return false;
  }

  // ---------------------------------------------------------------------------
  // Memory Management ---------------------------------------------------------
  // ---------------------------------------------------------------------------

  async flushToDisk(): Promise<void> {
    this.ensureInitialized();
    
    try {
      // TODO: Implement flushing of dirty data to disk
      // For now, just sync the file handle
      if (this.fileHandle) {
        await this.fileHandle.sync();
      }
      
      this.logger.debug('[MemoryMappedStorageEngine] Flush completed');
      
    } catch (error) {
      this.logger.error('[MemoryMappedStorageEngine] Flush failed', { error });
      throw error;
    }
  }

  getMemoryStats(): MemoryStats {
    const hitRate = this.stats.totalAccesses > 0 
      ? this.stats.cacheHits / this.stats.totalAccesses 
      : 0;
      
    const memoryPressure = this.calculateMemoryPressure();

    return {
      totalAllocated: this.currentMemoryUsage,
      activeBlocks: this.nodeMetadata.size,
      cachedNodes: this.nodeCache.size,
      hitRate,
      evictionCount: this.stats.evictions,
      memoryPressure
    };
  }

  // ---------------------------------------------------------------------------
  // Private Implementation ----------------------------------------------------
  // ---------------------------------------------------------------------------

  private validateConfig(): void {
    if (this.config.maxMemoryUsage < 1024 * 1024) { // 1MB minimum
      throw new Error('maxMemoryUsage must be at least 1MB');
    }
    
    if (this.config.blockSize < 1024 || this.config.blockSize > 64 * 1024) {
      throw new Error('blockSize must be between 1KB and 64KB');
    }
    
    if (this.config.backgroundFlushInterval < 1000) {
      throw new Error('backgroundFlushInterval must be at least 1 second');
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async createNewFile(): Promise<void> {
    this.logger.info('[MemoryMappedStorageEngine] Creating new storage file', {
      filePath: this.config.filePath
    });
    
    // Ensure directory exists
    const dir = path.dirname(this.config.filePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Create file header
    this.fileHeader = {
      magic: 0x434C4F4F, // "CLOO"
      version: 1,
      nodeCount: 0,
      indexOffset: 1024, // Reserve 1KB for header
      dataOffset: 1024 + 64 * 1024, // 64KB for index
      blockSize: this.config.blockSize,
      compressionType: this.config.enableCompression ? 1 : 0,
      checksum: 0 // Will be calculated later
    };
    
    // Open file for read/write
    this.fileHandle = await fs.open(this.config.filePath, 'w+');
    
    // Write header
    await this.writeFileHeader();
    
    this.logger.info('[MemoryMappedStorageEngine] New file created successfully');
  }

  private async openExistingFile(): Promise<void> {
    this.logger.info('[MemoryMappedStorageEngine] Opening existing storage file', {
      filePath: this.config.filePath
    });
    
    // Open file for read/write
    this.fileHandle = await fs.open(this.config.filePath, 'r+');
    
    // Read and validate header
    await this.readFileHeader();
    
    // TODO: Load metadata index
    
    this.logger.info('[MemoryMappedStorageEngine] Existing file opened successfully', {
      version: this.fileHeader?.version,
      nodeCount: this.fileHeader?.nodeCount
    });
  }

  private async writeFileHeader(): Promise<void> {
    if (!this.fileHandle || !this.fileHeader) {
      throw new Error('File handle or header not initialized');
    }
    
    const headerBuffer = Buffer.alloc(1024);
    let offset = 0;
    
    // Write header fields
    headerBuffer.writeUInt32LE(this.fileHeader.magic, offset); offset += 4;
    headerBuffer.writeUInt32LE(this.fileHeader.version, offset); offset += 4;
    headerBuffer.writeUInt32LE(this.fileHeader.nodeCount, offset); offset += 4;
    headerBuffer.writeUInt32LE(this.fileHeader.indexOffset, offset); offset += 4;
    headerBuffer.writeUInt32LE(this.fileHeader.dataOffset, offset); offset += 4;
    headerBuffer.writeUInt32LE(this.fileHeader.blockSize, offset); offset += 4;
    headerBuffer.writeUInt32LE(this.fileHeader.compressionType, offset); offset += 4;
    headerBuffer.writeUInt32LE(this.fileHeader.checksum, offset); offset += 4;
    
    await this.fileHandle.write(headerBuffer, 0, headerBuffer.length, 0);
  }

  private async readFileHeader(): Promise<void> {
    if (!this.fileHandle) {
      throw new Error('File handle not initialized');
    }
    
    const headerBuffer = Buffer.alloc(1024);
    const { bytesRead } = await this.fileHandle.read(headerBuffer, 0, headerBuffer.length, 0);
    
    if (bytesRead < 32) { // Minimum header size
      throw new Error('Invalid file: header too small');
    }
    
    let offset = 0;
    const magic = headerBuffer.readUInt32LE(offset); offset += 4;
    
    if (magic !== 0x434C4F4F) {
      throw new Error('Invalid file: magic number mismatch');
    }
    
    this.fileHeader = {
      magic,
      version: headerBuffer.readUInt32LE(offset += 4),
      nodeCount: headerBuffer.readUInt32LE(offset += 4),
      indexOffset: headerBuffer.readUInt32LE(offset += 4),
      dataOffset: headerBuffer.readUInt32LE(offset += 4),
      blockSize: headerBuffer.readUInt32LE(offset += 4),
      compressionType: headerBuffer.readUInt32LE(offset += 4),
      checksum: headerBuffer.readUInt32LE(offset += 4)
    };
    
    // Validate version compatibility
    if (this.fileHeader.version > 1) {
      throw new Error(`Unsupported file version: ${this.fileHeader.version}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async loadNodeFromDisk(_metadata: NodeMetadata): Promise<DagNode> {
    // TODO: Implement actual disk loading using metadata.blockHandle
    // For now, return a placeholder
    throw new Error('Disk loading not yet implemented');
  }

  private async cacheNode(nodeId: string, node: DagNode): Promise<void> {
    // Calculate node memory usage (rough estimate)
    const nodeSize = JSON.stringify(node).length * 2; // Unicode overhead
    
    // Ensure we have memory available
    await this.ensureMemoryAvailable(nodeSize);
    
    // Cache the node
    this.nodeCache.set(nodeId, node);
    this.currentMemoryUsage += nodeSize;
    
    // Update LRU queue
    this.moveToFrontOfQueue(nodeId);
  }

  private async ensureMemoryAvailable(requiredBytes: number): Promise<void> {
    while (this.currentMemoryUsage + requiredBytes > this.config.maxMemoryUsage) {
      const evicted = await this.evictLeastRecentlyUsed();
      if (!evicted) {
        break; // No more nodes to evict
      }
    }
  }

  private async evictLeastRecentlyUsed(): Promise<boolean> {
    if (this.accessQueue.length === 0) {
      return false;
    }
    
    const nodeId = this.accessQueue.pop();
    if (!nodeId) {
      return false;
    }
    
    const node = this.nodeCache.get(nodeId);
    if (node) {
      const nodeSize = JSON.stringify(node).length * 2;
      this.nodeCache.delete(nodeId);
      this.currentMemoryUsage -= nodeSize;
      this.stats.evictions++;
      
      this.logger.debug('[MemoryMappedStorageEngine] Evicted node from cache', { 
        nodeId, 
        size: this.formatBytes(nodeSize) 
      });
    }
    
    return true;
  }

  private updateAccessTracking(nodeId: string): void {
    const metadata = this.nodeMetadata.get(nodeId);
    if (metadata) {
      metadata.lastAccessed = Date.now();
      metadata.accessCount++;
    }
    
    this.moveToFrontOfQueue(nodeId);
  }

  private moveToFrontOfQueue(nodeId: string): void {
    // Remove from current position
    const index = this.accessQueue.indexOf(nodeId);
    if (index >= 0) {
      this.accessQueue.splice(index, 1);
    }
    
    // Add to front
    this.accessQueue.unshift(nodeId);
    
    // Limit queue size to prevent memory leaks
    if (this.accessQueue.length > this.config.maxMemoryUsage / 1024) {
      this.accessQueue.length = Math.floor(this.config.maxMemoryUsage / 1024);
    }
  }

  private calculateMemoryPressure(): 'low' | 'medium' | 'high' | 'critical' {
    const usage = this.currentMemoryUsage / this.config.maxMemoryUsage;
    
    if (usage < 0.6) return 'low';
    if (usage < 0.8) return 'medium';
    if (usage < 0.95) return 'high';
    return 'critical';
  }

  private setupBackgroundTasks(): void {
    this.backgroundFlushTimer = setInterval(async () => {
      try {
        await this.flushToDisk();
      } catch (error) {
        this.logger.error('[MemoryMappedStorageEngine] Background flush failed', { error });
      }
    }, this.config.backgroundFlushInterval);
  }

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('Storage engine not initialized. Call initialize() first.');
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)}${units[unitIndex]}`;
  }
}

// Export default configuration factory
export function createMemoryMappedStorageConfig(overrides?: Partial<MemoryMappedStorageConfig>): MemoryMappedStorageConfig {
  return {
    filePath: './data/knowledge_graph.cldb',
    maxMemoryUsage: 512 * 1024 * 1024, // 512MB
    blockSize: 4096, // 4KB
    enableCompression: true,
    legacyCompatibility: true,
    backgroundFlushInterval: 30000, // 30 seconds
    ...overrides
  };
}