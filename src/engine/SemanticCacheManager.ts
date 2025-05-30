/**
 * SemanticCacheManager - Orchestrates semantic query caching with KnowledgeGraph integration
 * 
 * This manager implements the three-tier cache lookup workflow:
 * 1. Exact match cache lookup (fastest)
 * 2. Semantic similarity search (HNSW + embeddings)  
 * 3. API call with result caching (slowest, but cached for future use)
 * 
 * Features:
 * - Seamless integration with KnowledgeGraph.search()
 * - Confidence-based cache hit determination
 * - Adaptive cache invalidation
 * - Comprehensive metrics and monitoring
 * - Memory pressure handling
 */

import path from 'node:path';
import { CodeLoopsLogger } from '../logger.ts';
import { PerformanceConfig } from '../config/schema.ts';
import { dataDir } from '../config.ts';
import { DagNode } from './KnowledgeGraph.ts';
import { EmbeddingService, createEmbeddingService } from './EmbeddingService.ts';
import { VectorIndex, createVectorIndex } from './VectorIndex.ts';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SearchResult } from './VectorIndex.ts';

export interface SemanticCacheManager {
  // Main cache lookup workflow
  searchWithCache(
    query: SemanticQuery,
    fallbackFn: () => Promise<DagNode[]>
  ): Promise<CacheSearchResult>;
  
  // Manual cache operations
  cacheResult(query: SemanticQuery, results: DagNode[]): Promise<void>;
  invalidateQuery(query: string): Promise<void>;
  invalidateByTags(tags: string[]): Promise<void>;
  
  // Cache management
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  getMetrics(): SemanticCacheMetrics;
  clear(): Promise<void>;
}

export interface SemanticQuery {
  project: string;
  query?: string;
  tags?: string[];
  limit?: number;
  contextHash?: string; // Hash of current project context
}

export interface CacheSearchResult {
  results: DagNode[];
  source: 'exact' | 'semantic' | 'api';
  confidence: number;
  similarity?: number; // For semantic matches
  cacheKey: string;
  metrics: {
    searchTime: number;
    embeddingTime?: number;
    apiTime?: number;
  };
}

export interface SemanticCacheMetrics {
  exactHits: number;
  semanticHits: number;
  apiCalls: number;
  totalQueries: number;
  averageConfidence: number;
  cacheSize: number;
  embeddingCacheStats: unknown;
  vectorIndexStats: unknown;
  hitRates: {
    exact: number;
    semantic: number;
    overall: number;
  };
}

interface CachedQueryResult {
  query: SemanticQuery;
  results: DagNode[];
  embedding: Float32Array;
  confidence: number;
  timestamp: number;
  hitCount: number;
  contextHash: string;
}

export class DefaultSemanticCacheManager implements SemanticCacheManager {
  private embeddingService: EmbeddingService;
  private vectorIndex: VectorIndex;
  private exactCache: Map<string, CachedQueryResult>;
  private config: PerformanceConfig['semanticCache'];
  private logger: CodeLoopsLogger;
  private isInitialized = false;
  
  // Metrics
  private exactHits = 0;
  private semanticHits = 0;
  private apiCalls = 0;
  private totalQueries = 0;
  private confidenceSum = 0;
  
  constructor(config: PerformanceConfig['semanticCache'], logger: CodeLoopsLogger) {
    this.config = config;
    this.logger = logger;
    this.exactCache = new Map();
    
    // Initialize services
    this.embeddingService = createEmbeddingService(config, logger);
    const persistPath = path.join(dataDir, 'semantic_cache', 'vector_index.json');
    this.vectorIndex = createVectorIndex(config.hnsw, logger, persistPath);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    this.logger.info('[SemanticCacheManager] Initializing semantic cache system');
    
    try {
      // Load vector index from disk
      await this.vectorIndex.load();
      
      // Start cleanup interval
      if (this.config.cleanup.enabled) {
        this.startCleanupInterval();
      }
      
      this.isInitialized = true;
      this.logger.info('[SemanticCacheManager] Initialization complete');
      
    } catch (error) {
      this.logger.error('[SemanticCacheManager] Initialization failed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  async searchWithCache(
    query: SemanticQuery,
    fallbackFn: () => Promise<DagNode[]>
  ): Promise<CacheSearchResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    this.totalQueries++;
    
    const cacheKey = this.generateCacheKey(query);
    
    try {
      // Step 1: Try exact cache lookup
      const exactResult = await this.tryExactCache(query, cacheKey);
      if (exactResult) {
        this.exactHits++;
        const searchTime = Date.now() - startTime;
        this.logger.debug(`[SemanticCacheManager] Exact cache hit for query: ${this.truncateQuery(query.query)}`);
        
        return {
          results: exactResult.results,
          source: 'exact',
          confidence: exactResult.confidence,
          cacheKey,
          metrics: { searchTime }
        };
      }
      
      // Step 2: Try semantic similarity search
      const semanticResult = await this.trySemanticCache(query, cacheKey, startTime);
      if (semanticResult) {
        this.semanticHits++;
        this.confidenceSum += semanticResult.confidence;
        this.logger.debug(`[SemanticCacheManager] Semantic cache hit for query: ${this.truncateQuery(query.query)} (similarity: ${semanticResult.similarity})`);
        
        return semanticResult;
      }
      
      // Step 3: Fall back to API call and cache result
      const apiStartTime = Date.now();
      const results = await fallbackFn();
      const apiTime = Date.now() - apiStartTime;
      const searchTime = Date.now() - startTime;
      
      this.apiCalls++;
      this.logger.debug(`[SemanticCacheManager] API fallback for query: ${this.truncateQuery(query.query)} (${results.length} results)`);
      
      // Cache the result for future use
      await this.cacheResult(query, results);
      
      return {
        results,
        source: 'api',
        confidence: 1.0, // API results are always confident
        cacheKey,
        metrics: { searchTime, apiTime }
      };
      
    } catch (error) {
      this.logger.error('[SemanticCacheManager] Search failed', {
        error: error instanceof Error ? error.message : String(error),
        query: this.truncateQuery(query.query)
      });
      throw error;
    }
  }

  async cacheResult(query: SemanticQuery, results: DagNode[]): Promise<void> {
    if (!this.config.enabled || !query.query) return;
    
    try {
      // Generate embedding for the query
      const embeddingStartTime = Date.now();
      const embedding = await this.embeddingService.generateEmbedding(query.query);
      const embeddingTime = Date.now() - embeddingStartTime;
      
      const cacheKey = this.generateCacheKey(query);
      const cachedResult: CachedQueryResult = {
        query,
        results,
        embedding,
        confidence: 1.0,
        timestamp: Date.now(),
        hitCount: 0,
        contextHash: query.contextHash || 'default'
      };
      
      // Store in exact cache
      if (this.exactCache.size >= this.config.cacheSize) {
        await this.evictOldestExactCacheEntries();
      }
      this.exactCache.set(cacheKey, cachedResult);
      
      // Store in vector index for semantic search
      const metadata = {
        cacheKey,
        query: query.query,
        project: query.project,
        tags: query.tags || [],
        timestamp: cachedResult.timestamp,
        resultCount: results.length
      };
      
      await this.vectorIndex.addVector(cacheKey, embedding, metadata);
      
      this.logger.debug(`[SemanticCacheManager] Cached result for query: ${this.truncateQuery(query.query)} (embedding: ${embeddingTime}ms)`);
      
    } catch (error) {
      this.logger.error('[SemanticCacheManager] Failed to cache result', {
        error: error instanceof Error ? error.message : String(error),
        query: this.truncateQuery(query.query)
      });
      // Don't throw - caching failures shouldn't break the main flow
    }
  }

  async invalidateQuery(query: string): Promise<void> {
    try {
      // Remove from exact cache
      const keysToRemove: string[] = [];
      for (const [key, cached] of this.exactCache.entries()) {
        if (cached.query.query === query) {
          keysToRemove.push(key);
        }
      }
      
      for (const key of keysToRemove) {
        this.exactCache.delete(key);
        await this.vectorIndex.removeVector(key);
      }
      
      this.logger.debug(`[SemanticCacheManager] Invalidated ${keysToRemove.length} cache entries for query: ${this.truncateQuery(query)}`);
      
    } catch (error) {
      this.logger.error('[SemanticCacheManager] Failed to invalidate query', {
        error: error instanceof Error ? error.message : String(error),
        query: this.truncateQuery(query)
      });
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      const keysToRemove: string[] = [];
      
      for (const [key, cached] of this.exactCache.entries()) {
        const cachedTags = cached.query.tags || [];
        if (tags.some(tag => cachedTags.includes(tag))) {
          keysToRemove.push(key);
        }
      }
      
      for (const key of keysToRemove) {
        this.exactCache.delete(key);
        await this.vectorIndex.removeVector(key);
      }
      
      this.logger.debug(`[SemanticCacheManager] Invalidated ${keysToRemove.length} cache entries for tags: ${tags.join(', ')}`);
      
    } catch (error) {
      this.logger.error('[SemanticCacheManager] Failed to invalidate by tags', {
        error: error instanceof Error ? error.message : String(error),
        tags
      });
    }
  }

  async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      const maxAge = this.config.cleanup.maxAge;
      let exactCacheCleanedCount = 0;
      let vectorIndexCleanedCount = 0;
      
      // Clean exact cache
      const keysToRemove: string[] = [];
      for (const [key, cached] of this.exactCache.entries()) {
        const age = now - cached.timestamp;
        if (age > maxAge) {
          keysToRemove.push(key);
        }
      }
      
      for (const key of keysToRemove) {
        this.exactCache.delete(key);
        await this.vectorIndex.removeVector(key);
        exactCacheCleanedCount++;
        vectorIndexCleanedCount++;
      }
      
      // Clean embedding service cache
      const embeddingCleanedCount = await this.embeddingService.cleanupCache();
      
      // Save vector index state
      await this.vectorIndex.save();
      
      this.logger.info('[SemanticCacheManager] Cache cleanup completed', {
        exactCacheCleanedCount,
        vectorIndexCleanedCount,
        embeddingCleanedCount,
        remainingExactEntries: this.exactCache.size
      });
      
    } catch (error) {
      this.logger.error('[SemanticCacheManager] Cleanup failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async clear(): Promise<void> {
    try {
      this.exactCache.clear();
      await this.vectorIndex.clear();
      
      // Reset metrics
      this.exactHits = 0;
      this.semanticHits = 0;
      this.apiCalls = 0;
      this.totalQueries = 0;
      this.confidenceSum = 0;
      
      this.logger.info('[SemanticCacheManager] Cache cleared');
      
    } catch (error) {
      this.logger.error('[SemanticCacheManager] Failed to clear cache', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  getMetrics(): SemanticCacheMetrics {
    const exactHitRate = this.totalQueries > 0 ? this.exactHits / this.totalQueries : 0;
    const semanticHitRate = this.totalQueries > 0 ? this.semanticHits / this.totalQueries : 0;
    const overallHitRate = this.totalQueries > 0 ? (this.exactHits + this.semanticHits) / this.totalQueries : 0;
    const averageConfidence = this.semanticHits > 0 ? this.confidenceSum / this.semanticHits : 0;
    
    return {
      exactHits: this.exactHits,
      semanticHits: this.semanticHits,
      apiCalls: this.apiCalls,
      totalQueries: this.totalQueries,
      averageConfidence,
      cacheSize: this.exactCache.size,
      embeddingCacheStats: this.embeddingService.getCacheStats(),
      vectorIndexStats: this.vectorIndex.getStats(),
      hitRates: {
        exact: exactHitRate,
        semantic: semanticHitRate,
        overall: overallHitRate
      }
    };
  }

  // Private helper methods

  private async tryExactCache(query: SemanticQuery, cacheKey: string): Promise<CachedQueryResult | null> {
    const cached = this.exactCache.get(cacheKey);
    if (!cached) return null;
    
    // Check if cache entry has expired
    const age = Date.now() - cached.timestamp;
    if (age > this.config.ttl) {
      this.exactCache.delete(cacheKey);
      await this.vectorIndex.removeVector(cacheKey);
      return null;
    }
    
    // Update hit count and access time
    cached.hitCount++;
    cached.timestamp = Date.now();
    
    return cached;
  }

  private async trySemanticCache(
    query: SemanticQuery, 
    cacheKey: string, 
    startTime: number
  ): Promise<CacheSearchResult | null> {
    if (!query.query) return null;
    
    try {
      // Generate embedding for query
      const embeddingStartTime = Date.now();
      const queryEmbedding = await this.embeddingService.generateEmbedding(query.query);
      const embeddingTime = Date.now() - embeddingStartTime;
      
      // Search for similar queries in vector index
      const searchResults = await this.vectorIndex.search(
        queryEmbedding,
        this.config.maxCandidates,
        this.config.similarityThreshold
      );
      
      if (searchResults.length === 0) return null;
      
      // Find best match above confidence threshold
      const bestMatch = searchResults[0];
      if (bestMatch.similarity < this.config.confidenceThreshold) return null;
      
      // Retrieve cached result
      const cachedResult = this.exactCache.get(bestMatch.id);
      if (!cachedResult) {
        // Vector index out of sync, remove stale entry
        await this.vectorIndex.removeVector(bestMatch.id);
        return null;
      }
      
      // Check if cache entry has expired
      const age = Date.now() - cachedResult.timestamp;
      if (age > this.config.ttl) {
        this.exactCache.delete(bestMatch.id);
        await this.vectorIndex.removeVector(bestMatch.id);
        return null;
      }
      
      // Update hit count
      cachedResult.hitCount++;
      cachedResult.timestamp = Date.now();
      
      const searchTime = Date.now() - startTime;
      
      return {
        results: cachedResult.results,
        source: 'semantic',
        confidence: bestMatch.similarity,
        similarity: bestMatch.similarity,
        cacheKey: bestMatch.id,
        metrics: { searchTime, embeddingTime }
      };
      
    } catch (error) {
      this.logger.warn('[SemanticCacheManager] Semantic search failed, falling back to API', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  private generateCacheKey(query: SemanticQuery): string {
    // Create deterministic cache key from query components
    const keyParts = [
      query.project,
      query.query || '',
      JSON.stringify(query.tags?.sort() || []),
      query.limit?.toString() || '',
      query.contextHash || 'default'
    ];
    
    return Buffer.from(keyParts.join('|')).toString('base64');
  }

  private async evictOldestExactCacheEntries(): Promise<void> {
    // Evict 20% of cache when full, starting with least recently used
    const evictCount = Math.floor(this.config.cacheSize * 0.2);
    
    // Sort by last access time (oldest first)
    const entries = Array.from(this.exactCache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);
    
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      const [key] = entries[i];
      this.exactCache.delete(key);
      await this.vectorIndex.removeVector(key);
    }
    
    this.logger.debug(`[SemanticCacheManager] Evicted ${evictCount} exact cache entries`);
  }

  private startCleanupInterval(): void {
    setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        this.logger.error('[SemanticCacheManager] Scheduled cleanup failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.config.cleanup.intervalMs);
    
    this.logger.debug(`[SemanticCacheManager] Started cleanup interval: ${this.config.cleanup.intervalMs}ms`);
  }

  private truncateQuery(query?: string): string {
    if (!query) return '';
    return query.length > 50 ? query.substring(0, 50) + '...' : query;
  }
}

/**
 * Factory function to create configured SemanticCacheManager
 */
export function createSemanticCacheManager(
  config: PerformanceConfig['semanticCache'],
  logger: CodeLoopsLogger
): SemanticCacheManager {
  return new DefaultSemanticCacheManager(config, logger);
}