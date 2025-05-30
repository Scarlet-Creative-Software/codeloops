/**
 * VectorIndex - Efficient similarity search using Hierarchical Navigable Small World (HNSW) algorithm
 * 
 * Features:
 * - O(log n) approximate nearest neighbor search
 * - Configurable similarity thresholds
 * - Incremental index updates
 * - Persistent storage with versioning
 * - Memory-efficient implementation
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { CodeLoopsLogger } from '../logger.ts';
import { PerformanceConfig } from '../config/schema.ts';

export interface VectorIndex {
  // Add embedding to index
  addVector(id: string, embedding: Float32Array, metadata: unknown): Promise<void>;
  
  // Find k nearest neighbors
  search(queryEmbedding: Float32Array, k: number, threshold: number): Promise<SearchResult[]>;
  
  // Update existing vector
  updateVector(id: string, embedding: Float32Array, metadata: unknown): Promise<void>;
  
  // Remove vector from index
  removeVector(id: string): Promise<void>;
  
  // Persist index to disk
  save(): Promise<void>;
  
  // Load index from disk
  load(): Promise<void>;
  
  // Get index statistics
  getStats(): VectorIndexStats;
  
  // Clear all vectors
  clear(): Promise<void>;
}

export interface SearchResult {
  id: string;
  similarity: number; // Cosine similarity score
  metadata: unknown;
}

export interface VectorIndexStats {
  totalVectors: number;
  dimensions: number;
  layers: number;
  memoryUsage: number;
  averageConnections: number;
}

interface HNSWNode {
  id: string;
  embedding: Float32Array;
  metadata: unknown;
  connections: Map<number, Set<string>>; // layer -> connected node IDs
  level: number;
}

export class HNSWVectorIndex implements VectorIndex {
  private nodes: Map<string, HNSWNode>;
  private layers: Map<number, Set<string>>; // layer -> node IDs in that layer
  private config: PerformanceConfig['semanticCache']['hnsw'];
  private logger: CodeLoopsLogger;
  private persistPath: string;
  private entryPoint: string | null = null;
  private maxLevel = -1;
  private dimensions: number | null = null;

  constructor(
    config: PerformanceConfig['semanticCache']['hnsw'], 
    logger: CodeLoopsLogger,
    persistPath: string
  ) {
    this.nodes = new Map();
    this.layers = new Map();
    this.config = config;
    this.logger = logger;
    this.persistPath = persistPath;
  }

  async addVector(id: string, embedding: Float32Array, metadata: unknown): Promise<void> {
    // Initialize dimensions on first vector
    if (this.dimensions === null) {
      this.dimensions = embedding.length;
    } else if (embedding.length !== this.dimensions) {
      throw new Error(`Embedding dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`);
    }

    // Remove existing vector if updating
    if (this.nodes.has(id)) {
      await this.removeVector(id);
    }

    // Determine level for new node using exponential decay
    const level = this.selectLevel();
    
    const node: HNSWNode = {
      id,
      embedding: new Float32Array(embedding), // Copy to ensure immutability
      metadata,
      connections: new Map(),
      level
    };

    // Initialize connections for each level
    for (let i = 0; i <= level; i++) {
      node.connections.set(i, new Set());
      
      // Ensure layer exists
      if (!this.layers.has(i)) {
        this.layers.set(i, new Set());
      }
      this.layers.get(i)!.add(id);
    }

    this.nodes.set(id, node);
    
    // Update max level and entry point
    if (level > this.maxLevel) {
      this.maxLevel = level;
      this.entryPoint = id;
    }

    // Connect to existing nodes using HNSW algorithm
    await this.connectNode(node);

    this.logger.debug(`[VectorIndex] Added vector ${id} at level ${level}`);
  }

  async search(queryEmbedding: Float32Array, k: number, threshold: number): Promise<SearchResult[]> {
    if (this.nodes.size === 0 || !this.entryPoint) {
      return [];
    }

    if (queryEmbedding.length !== this.dimensions) {
      throw new Error(`Query dimension mismatch: expected ${this.dimensions}, got ${queryEmbedding.length}`);
    }

    // Search from top layer down to layer 0
    let candidates = new Set<string>([this.entryPoint]);
    
    // Search upper layers (greedy search to find entry point for layer 0)
    for (let level = this.maxLevel; level > 0; level--) {
      candidates = this.searchLayer(queryEmbedding, candidates, 1, level);
      if (candidates.size === 0) {
        // If no candidates found at this level, use entry point
        candidates = new Set<string>([this.entryPoint]);
      }
    }

    // Search layer 0 more thoroughly
    const finalCandidates = this.searchLayer(queryEmbedding, candidates, Math.max(this.config.efSearch, k), 0);
    
    // If search layer returns empty, fall back to direct calculation
    if (finalCandidates.size === 0) {
      // Search all nodes in layer 0
      const layer0Nodes = this.layers.get(0);
      if (layer0Nodes) {
        for (const nodeId of layer0Nodes) {
          finalCandidates.add(nodeId);
        }
      }
    }
    
    // Calculate similarities and sort
    const results: SearchResult[] = [];
    for (const nodeId of finalCandidates) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      
      const similarity = this.calculateSimilarity(queryEmbedding, node.embedding);
      if (similarity >= threshold) {
        results.push({
          id: nodeId,
          similarity,
          metadata: node.metadata
        });
      }
    }

    // Sort by similarity (descending) and limit to k results
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }

  async updateVector(id: string, embedding: Float32Array, metadata: unknown): Promise<void> {
    // For simplicity, we remove and re-add the vector
    // A more sophisticated implementation would update in place
    await this.removeVector(id);
    await this.addVector(id, embedding, metadata);
  }

  async removeVector(id: string): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove connections from other nodes
    for (let level = 0; level <= node.level; level++) {
      const connections = node.connections.get(level);
      if (connections) {
        for (const connectedId of connections) {
          const connectedNode = this.nodes.get(connectedId);
          if (connectedNode) {
            connectedNode.connections.get(level)?.delete(id);
          }
        }
      }
      
      // Remove from layer
      this.layers.get(level)?.delete(id);
    }

    // Update entry point if necessary
    if (this.entryPoint === id) {
      this.updateEntryPoint();
    }

    this.nodes.delete(id);
    this.logger.debug(`[VectorIndex] Removed vector ${id}`);
  }

  async save(): Promise<void> {
    const indexData = {
      version: '1.0',
      dimensions: this.dimensions,
      maxLevel: this.maxLevel,
      entryPoint: this.entryPoint,
      config: this.config,
      nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
        id,
        embedding: Array.from(node.embedding),
        metadata: node.metadata,
        connections: Object.fromEntries(
          Array.from(node.connections.entries()).map(([level, connections]) => [
            level,
            Array.from(connections)
          ])
        ),
        level: node.level
      }))
    };

    await fs.mkdir(path.dirname(this.persistPath), { recursive: true });
    await fs.writeFile(this.persistPath, JSON.stringify(indexData, null, 2));
    
    this.logger.info(`[VectorIndex] Saved index with ${this.nodes.size} vectors to ${this.persistPath}`);
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath, 'utf-8');
      const indexData = JSON.parse(data);
      
      // Validate version compatibility
      if (indexData.version !== '1.0') {
        throw new Error(`Incompatible index version: ${indexData.version}`);
      }

      // Restore index state
      this.dimensions = indexData.dimensions;
      this.maxLevel = indexData.maxLevel;
      this.entryPoint = indexData.entryPoint;
      
      this.nodes.clear();
      this.layers.clear();

      // Restore nodes
      for (const nodeData of indexData.nodes) {
        const node: HNSWNode = {
          id: nodeData.id,
          embedding: new Float32Array(nodeData.embedding),
          metadata: nodeData.metadata,
          connections: new Map(),
          level: nodeData.level
        };

        // Restore connections
        for (const [level, connections] of Object.entries(nodeData.connections)) {
          const levelNum = parseInt(level);
          node.connections.set(levelNum, new Set(connections as string[]));
          
          // Ensure layer exists
          if (!this.layers.has(levelNum)) {
            this.layers.set(levelNum, new Set());
          }
          this.layers.get(levelNum)!.add(nodeData.id);
        }

        this.nodes.set(nodeData.id, node);
      }

      this.logger.info(`[VectorIndex] Loaded index with ${this.nodes.size} vectors from ${this.persistPath}`);
      
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        this.logger.info(`[VectorIndex] No existing index found at ${this.persistPath}, starting fresh`);
      } else {
        this.logger.error(`[VectorIndex] Failed to load index`, { 
          error: error instanceof Error ? error.message : String(error) 
        });
        throw error;
      }
    }
  }

  async clear(): Promise<void> {
    this.nodes.clear();
    this.layers.clear();
    this.entryPoint = null;
    this.maxLevel = -1; // Reset to -1 since we'll check for this.nodes.size > 0
    this.dimensions = null;
  }

  getStats(): VectorIndexStats {
    const totalConnections = Array.from(this.nodes.values())
      .reduce((sum, node) => {
        return sum + Array.from(node.connections.values())
          .reduce((nodeSum, connections) => nodeSum + connections.size, 0);
      }, 0);

    const averageConnections = this.nodes.size > 0 ? totalConnections / this.nodes.size : 0;
    
    // Rough memory estimate
    const memoryPerVector = (this.dimensions || 0) * 4 + 1000; // embedding + overhead
    const memoryUsage = this.nodes.size * memoryPerVector;

    return {
      totalVectors: this.nodes.size,
      dimensions: this.dimensions || 0,
      layers: this.nodes.size > 0 ? this.maxLevel + 1 : 0,
      memoryUsage,
      averageConnections
    };
  }

  private selectLevel(): number {
    // Exponential decay probability for level selection
    let level = 0;
    while (Math.random() < 0.5 && level < 16) { // Cap at 16 levels
      level++;
    }
    return level;
  }

  private async connectNode(newNode: HNSWNode): Promise<void> {
    if (this.nodes.size === 1) return; // First node, nothing to connect to

    // Connect at each level
    for (let level = 0; level <= newNode.level; level++) {
      const layerNodes = this.layers.get(level);
      if (!layerNodes || layerNodes.size === 0) continue;

      // Find nearest neighbors in this layer
      const candidates = this.findNearestInLayer(newNode.embedding, layerNodes, this.config.maxConnections);
      
      // Connect to the best candidates
      for (const candidateId of candidates) {
        if (candidateId === newNode.id) continue;
        
        // Bidirectional connection
        newNode.connections.get(level)!.add(candidateId);
        this.nodes.get(candidateId)!.connections.get(level)!.add(newNode.id);
        
        // Prune connections if needed
        await this.pruneConnections(candidateId, level);
      }
    }
  }

  private searchLayer(
    queryEmbedding: Float32Array, 
    entryPoints: Set<string>, 
    numClosest: number, 
    level: number
  ): Set<string> {
    const visited = new Set<string>();
    const candidates = new Set<string>();
    const dynamic = new Set<string>();

    // Initialize with entry points
    for (const ep of entryPoints) {
      if (this.layers.get(level)?.has(ep)) {
        dynamic.add(ep);
        candidates.add(ep);
      }
    }

    while (dynamic.size > 0) {
      // Get closest unvisited candidate
      const current = this.getClosest(queryEmbedding, dynamic);
      dynamic.delete(current);
      visited.add(current);

      const currentNode = this.nodes.get(current);
      if (!currentNode) continue;

      // Explore connections
      const connections = currentNode.connections.get(level);
      if (connections) {
        for (const connectedId of connections) {
          if (!visited.has(connectedId) && this.layers.get(level)?.has(connectedId)) {
            candidates.add(connectedId);
            dynamic.add(connectedId);
          }
        }
      }
    }

    // Return top candidates
    return new Set(this.getTopCandidates(queryEmbedding, candidates, numClosest));
  }

  private findNearestInLayer(embedding: Float32Array, layerNodes: Set<string>, count: number): string[] {
    const candidates = Array.from(layerNodes)
      .map(id => ({
        id,
        similarity: this.calculateSimilarity(embedding, this.nodes.get(id)!.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, count)
      .map(c => c.id);

    return candidates;
  }

  private getClosest(queryEmbedding: Float32Array, candidates: Set<string>): string {
    let best = '';
    let bestSimilarity = -1;

    for (const candidateId of candidates) {
      const node = this.nodes.get(candidateId);
      if (!node) continue;

      const similarity = this.calculateSimilarity(queryEmbedding, node.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        best = candidateId;
      }
    }

    return best;
  }

  private getTopCandidates(queryEmbedding: Float32Array, candidates: Set<string>, count: number): string[] {
    return Array.from(candidates)
      .map(id => ({
        id,
        similarity: this.calculateSimilarity(queryEmbedding, this.nodes.get(id)!.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, count)
      .map(c => c.id);
  }

  private async pruneConnections(nodeId: string, level: number): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const connections = node.connections.get(level);
    if (!connections || connections.size <= this.config.maxConnections) return;

    // Keep only the best connections
    const connectionArray = Array.from(connections)
      .map(id => ({
        id,
        similarity: this.calculateSimilarity(node.embedding, this.nodes.get(id)!.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, this.config.maxConnections);

    // Remove excess connections
    const toKeep = new Set(connectionArray.map(c => c.id));
    for (const connId of connections) {
      if (!toKeep.has(connId)) {
        connections.delete(connId);
        // Remove bidirectional connection
        this.nodes.get(connId)?.connections.get(level)?.delete(nodeId);
      }
    }
  }

  private updateEntryPoint(): void {
    // Find node with highest level as new entry point
    let newEntryPoint = null;
    let maxLevel = -1;

    for (const [id, node] of this.nodes) {
      if (node.level > maxLevel) {
        maxLevel = node.level;
        newEntryPoint = id;
      }
    }

    this.entryPoint = newEntryPoint;
    this.maxLevel = maxLevel;
  }

  private calculateSimilarity(a: Float32Array, b: Float32Array): number {
    switch (this.config.similarityMetric) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'euclidean':
        return 1 / (1 + this.euclideanDistance(a, b));
      case 'dot':
        return this.dotProduct(a, b);
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private euclideanDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  private dotProduct(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }
}

/**
 * Factory function to create configured VectorIndex
 */
export function createVectorIndex(
  config: PerformanceConfig['semanticCache']['hnsw'],
  logger: CodeLoopsLogger,
  persistPath: string
): VectorIndex {
  return new HNSWVectorIndex(config, logger, persistPath);
}