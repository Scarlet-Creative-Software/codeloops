/**
 * EmbeddingService - Generates vector embeddings for queries using Gemini's embedding API
 * 
 * Features:
 * - Integration with existing GeminiConnectionManager for reliability
 * - Local embedding cache with configurable TTL
 * - Batch processing for multiple queries
 * - Rate limiting to respect API quotas
 * - Error handling and retry logic
 */

import { getConnectionManager, RequestPriority } from '../utils/GeminiConnectionManager.ts';
import { CodeLoopsLogger } from '../logger.ts';
import { PerformanceConfig } from '../config/schema.ts';

export interface EmbeddingService {
  // Generate embedding for a single query
  generateEmbedding(query: string): Promise<Float32Array>;
  
  // Batch processing for efficiency  
  generateEmbeddings(queries: string[]): Promise<Float32Array[]>;
  
  // Check if embedding exists in cache
  getCachedEmbedding(query: string): Promise<Float32Array | null>;
  
  // Cache embedding result
  cacheEmbedding(query: string, embedding: Float32Array): Promise<void>;
  
  // Clear expired cache entries
  cleanupCache(): Promise<number>;
  
  // Get cache statistics
  getCacheStats(): EmbeddingCacheStats;
}

export interface EmbeddingCacheStats {
  totalEntries: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry?: number;
  newestEntry?: number;
}

interface CachedEmbedding {
  embedding: Float32Array;
  timestamp: number;
  hitCount: number;
}

export class GeminiEmbeddingService implements EmbeddingService {
  private connectionManager;
  private embeddingCache: Map<string, CachedEmbedding>;
  private config: PerformanceConfig['semanticCache'];
  private logger: CodeLoopsLogger;
  private requestCount = 0;
  private hitCount = 0;
  private lastCleanup = Date.now();

  constructor(config: PerformanceConfig['semanticCache'], logger: CodeLoopsLogger) {
    this.connectionManager = getConnectionManager();
    this.embeddingCache = new Map();
    this.config = config;
    this.logger = logger;
  }

  async generateEmbedding(query: string): Promise<Float32Array> {
    this.requestCount++;
    
    // Check local cache first
    const cached = await this.getCachedEmbedding(query);
    if (cached) {
      this.hitCount++;
      this.logger.debug(`[EmbeddingService] Cache hit for query: ${query.substring(0, 50)}...`);
      return cached;
    }

    // Generate using Gemini API with rate limiting
    await this.enforceRateLimit();
    
    try {
      const response = await this.connectionManager.execute(
        async (client) => {
          return await client.models.embedContent({
            model: this.config.embeddingModel,
            contents: [{ parts: [{ text: query }] }]
          });
        },
        { priority: RequestPriority.NORMAL }
      );

      if (!response.embeddings?.[0]?.values) {
        throw new Error('Invalid embedding response: missing values');
      }

      const embedding = new Float32Array(response.embeddings[0].values);
      
      // Cache the result
      await this.cacheEmbedding(query, embedding);
      
      this.logger.debug(`[EmbeddingService] Generated embedding for query: ${query.substring(0, 50)}...`);
      return embedding;
      
    } catch (error) {
      this.logger.error(`[EmbeddingService] Failed to generate embedding`, { 
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });
      throw error;
    }
  }

  async generateEmbeddings(queries: string[]): Promise<Float32Array[]> {
    if (queries.length === 0) return [];
    
    // Process in batches to avoid overwhelming the API
    const batchSize = Math.min(10, queries.length); // Conservative batch size
    const results: Float32Array[] = [];
    
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchPromises = batch.map(query => this.generateEmbedding(query));
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Add delay between batches to respect rate limits
        if (i + batchSize < queries.length) {
          await this.sleep(100); // 100ms delay between batches
        }
      } catch (error) {
        this.logger.error(`[EmbeddingService] Batch processing failed`, {
          error: error instanceof Error ? error.message : String(error),
          batchStart: i,
          batchSize: batch.length
        });
        throw error;
      }
    }
    
    return results;
  }

  async getCachedEmbedding(query: string): Promise<Float32Array | null> {
    this.requestCount++;
    
    const cached = this.embeddingCache.get(query);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache entry has expired
    const age = Date.now() - cached.timestamp;
    if (age > this.config.ttl) {
      this.embeddingCache.delete(query);
      return null;
    }
    
    // Update hit count and access time
    this.hitCount++;
    cached.hitCount++;
    cached.timestamp = Date.now();
    
    return cached.embedding;
  }

  async cacheEmbedding(query: string, embedding: Float32Array): Promise<void> {
    // Check cache size limit
    if (this.embeddingCache.size >= this.config.cacheSize) {
      await this.evictOldestEntries();
    }
    
    const cacheEntry: CachedEmbedding = {
      embedding,
      timestamp: Date.now(),
      hitCount: 1
    };
    
    this.embeddingCache.set(query, cacheEntry);
  }

  async cleanupCache(): Promise<number> {
    const now = Date.now();
    const maxAge = this.config.cleanup.maxAge;
    let cleanedCount = 0;
    
    for (const [query, cached] of this.embeddingCache.entries()) {
      const age = now - cached.timestamp;
      if (age > maxAge) {
        this.embeddingCache.delete(query);
        cleanedCount++;
      }
    }
    
    this.lastCleanup = now;
    
    if (cleanedCount > 0) {
      this.logger.info(`[EmbeddingService] Cleaned up ${cleanedCount} expired cache entries`);
    }
    
    return cleanedCount;
  }

  getCacheStats(): EmbeddingCacheStats {
    const entries = Array.from(this.embeddingCache.values());
    const hitRate = this.requestCount > 0 ? this.hitCount / this.requestCount : 0;
    
    // Calculate memory usage (rough estimate)
    const memoryPerEntry = 768 * 4 + 100; // 768 floats * 4 bytes + overhead
    const memoryUsage = this.embeddingCache.size * memoryPerEntry;
    
    const timestamps = entries.map(e => e.timestamp);
    const oldestEntry = timestamps.length > 0 ? Math.min(...timestamps) : undefined;
    const newestEntry = timestamps.length > 0 ? Math.max(...timestamps) : undefined;
    
    return {
      totalEntries: this.embeddingCache.size,
      hitRate,
      memoryUsage,
      oldestEntry,
      newestEntry
    };
  }

  private async enforceRateLimit(): Promise<void> {
    // Simple rate limiting - could be enhanced with token bucket algorithm
    const delay = 50; // 50ms between requests
    await this.sleep(delay);
  }

  private async evictOldestEntries(): Promise<void> {
    // Evict 20% of cache when full, starting with least recently used
    const evictCount = Math.floor(this.config.cacheSize * 0.2);
    
    // Sort by last access time (oldest first)
    const entries = Array.from(this.embeddingCache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);
    
    for (let i = 0; i < evictCount && i < entries.length; i++) {
      const [query] = entries[i];
      this.embeddingCache.delete(query);
    }
    
    this.logger.debug(`[EmbeddingService] Evicted ${evictCount} cache entries`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create configured EmbeddingService
 */
export function createEmbeddingService(
  config: PerformanceConfig['semanticCache'], 
  logger: CodeLoopsLogger
): EmbeddingService {
  return new GeminiEmbeddingService(config, logger);
}