import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiEmbeddingService, type EmbeddingService } from './EmbeddingService.ts';
import { CodeLoopsLogger } from '../logger.ts';
import { PerformanceConfig } from '../config/schema.ts';

// Mock the GeminiConnectionManager
const mockExecute = vi.fn();
vi.mock('../utils/GeminiConnectionManager.ts', () => ({
  getConnectionManager: () => ({
    execute: mockExecute
  }),
  RequestPriority: {
    MEDIUM: 'MEDIUM'
  }
}));

describe('EmbeddingService', () => {
  let embeddingService: EmbeddingService;
  let logger: CodeLoopsLogger;
  let config: PerformanceConfig['semanticCache'];

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as CodeLoopsLogger;

    config = {
      enabled: true,
      embeddingModel: 'text-embedding-004',
      similarityThreshold: 0.85,
      confidenceThreshold: 0.90,
      maxCandidates: 10,
      cacheSize: 100,
      ttl: 86400000, // 24 hours
      cleanup: {
        enabled: true,
        intervalMs: 3600000,
        maxAge: 604800000
      },
      hnsw: {
        efConstruction: 200,
        efSearch: 50,
        maxConnections: 16,
        similarityMetric: 'cosine' as const
      }
    };

    embeddingService = new GeminiEmbeddingService(config, logger);
    
    // Reset mocks
    mockExecute.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding using Gemini API', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      mockExecute.mockResolvedValue({
        embedding: {
          values: mockEmbedding
        }
      });

      const result = await embeddingService.generateEmbedding('test query');

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.any(Function),
        { priority: 'MEDIUM' }
      );
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(mockEmbedding.length);
      // Check values with appropriate precision for Float32Array
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeCloseTo(mockEmbedding[i], 5);
      }
    });

    it('should return cached embedding if available', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      mockExecute.mockResolvedValue({
        embedding: { values: mockEmbedding }
      });

      // First call should hit API
      const result1 = await embeddingService.generateEmbedding('test query');
      expect(mockExecute).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = await embeddingService.generateEmbedding('test query');
      expect(mockExecute).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(Array.from(result2)).toEqual(Array.from(result1));
    });

    it('should handle API errors gracefully', async () => {
      mockExecute.mockRejectedValue(new Error('API Error'));

      await expect(embeddingService.generateEmbedding('test query'))
        .rejects.toThrow('API Error');
      
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle invalid API response', async () => {
      mockExecute.mockResolvedValue({
        embedding: null // Invalid response
      });

      await expect(embeddingService.generateEmbedding('test query'))
        .rejects.toThrow('Invalid embedding response: missing values');
    });
  });

  describe('generateEmbeddings', () => {
    it('should process multiple queries in batches', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      mockExecute.mockResolvedValue({
        embedding: { values: mockEmbedding }
      });

      const queries = ['query1', 'query2', 'query3'];
      const results = await embeddingService.generateEmbeddings(queries);

      expect(results).toHaveLength(3);
      expect(mockExecute).toHaveBeenCalledTimes(3);
      results.forEach(result => {
        expect(result.length).toBe(mockEmbedding.length);
        for (let i = 0; i < result.length; i++) {
          expect(result[i]).toBeCloseTo(mockEmbedding[i], 5);
        }
      });
    });

    it('should return empty array for empty input', async () => {
      const results = await embeddingService.generateEmbeddings([]);
      expect(results).toEqual([]);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should handle batch processing errors', async () => {
      mockExecute.mockRejectedValue(new Error('Batch Error'));

      await expect(embeddingService.generateEmbeddings(['query1', 'query2']))
        .rejects.toThrow('Batch Error');
    });
  });

  describe('cacheEmbedding', () => {
    it('should cache embedding successfully', async () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      await embeddingService.cacheEmbedding('test query', embedding);

      const cached = await embeddingService.getCachedEmbedding('test query');
      expect(cached).not.toBeNull();
      expect(Array.from(cached!)).toEqual(Array.from(embedding));
    });

    it('should evict old entries when cache is full', async () => {
      // Fill cache to capacity
      for (let i = 0; i < config.cacheSize; i++) {
        const embedding = new Float32Array([i, i + 1, i + 2]);
        await embeddingService.cacheEmbedding(`query${i}`, embedding);
      }

      // Add one more to trigger eviction
      const newEmbedding = new Float32Array([999, 999, 999]);
      await embeddingService.cacheEmbedding('new query', newEmbedding);

      const stats = embeddingService.getCacheStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(config.cacheSize);
    });
  });

  describe('getCachedEmbedding', () => {
    it('should return null for non-existent cache entry', async () => {
      const result = await embeddingService.getCachedEmbedding('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for expired cache entry', async () => {
      // Create service with very short TTL
      const shortTtlConfig = { ...config, ttl: 1 }; // 1ms TTL
      const shortTtlService = new GeminiEmbeddingService(shortTtlConfig, logger);
      
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      await shortTtlService.cacheEmbedding('test query', embedding);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const cached = await shortTtlService.getCachedEmbedding('test query');
      expect(cached).toBeNull();
    });

    it('should update hit count on cache access', async () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      await embeddingService.cacheEmbedding('test query', embedding);

      // Access multiple times
      await embeddingService.getCachedEmbedding('test query');
      await embeddingService.getCachedEmbedding('test query');

      const stats = embeddingService.getCacheStats();
      expect(stats.hitRate).toBeGreaterThan(0);
    });
  });

  describe('cleanupCache', () => {
    it('should remove expired entries', async () => {
      // Create service with short max age
      const shortAgeConfig = { 
        ...config, 
        cleanup: { ...config.cleanup, maxAge: 1 } 
      };
      const shortAgeService = new GeminiEmbeddingService(shortAgeConfig, logger);

      // Add some entries
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      await shortAgeService.cacheEmbedding('query1', embedding);
      await shortAgeService.cacheEmbedding('query2', embedding);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      const cleanedCount = await shortAgeService.cleanupCache();
      expect(cleanedCount).toBe(2);

      const stats = shortAgeService.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should not remove fresh entries', async () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      await embeddingService.cacheEmbedding('fresh query', embedding);

      const cleanedCount = await embeddingService.cleanupCache();
      expect(cleanedCount).toBe(0);

      const stats = embeddingService.getCacheStats();
      expect(stats.totalEntries).toBe(1);
    });
  });

  describe('getCacheStats', () => {
    it('should return accurate cache statistics', async () => {
      const stats = embeddingService.getCacheStats();
      
      expect(stats.totalEntries).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.memoryUsage).toBe(0);
      expect(stats.oldestEntry).toBeUndefined();
      expect(stats.newestEntry).toBeUndefined();
    });

    it('should calculate hit rate correctly', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
      mockExecute.mockResolvedValue({
        embedding: { values: mockEmbedding }
      });

      // Generate embedding (miss)
      await embeddingService.generateEmbedding('test query');
      
      // Generate same embedding again (should be cache hit)
      await embeddingService.generateEmbedding('test query');

      const stats = embeddingService.getCacheStats();
      expect(stats.hitRate).toBe(0.5); // 1 hit out of 2 requests
    });

    it('should calculate memory usage', async () => {
      const embedding = new Float32Array(768); // Standard embedding size
      await embeddingService.cacheEmbedding('test query', embedding);

      const stats = embeddingService.getCacheStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.totalEntries).toBe(1);
    });
  });
});