import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HNSWVectorIndex, type VectorIndex } from './VectorIndex.ts';
import { CodeLoopsLogger } from '../logger.ts';
import { PerformanceConfig } from '../config/schema.ts';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

describe('VectorIndex', () => {
  let vectorIndex: VectorIndex;
  let logger: CodeLoopsLogger;
  let config: PerformanceConfig['semanticCache']['hnsw'];
  let tempDir: string;
  let persistPath: string;

  beforeEach(async () => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as CodeLoopsLogger;

    config = {
      efConstruction: 200,
      efSearch: 50,
      maxConnections: 16,
      similarityMetric: 'cosine' as const
    };

    // Create temporary directory for persistence tests
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'vector-index-test-'));
    persistPath = path.join(tempDir, 'index.json');

    vectorIndex = new HNSWVectorIndex(config, logger, persistPath);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    vi.clearAllMocks();
  });

  describe('addVector', () => {
    it('should add vector successfully', async () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const metadata = { type: 'test' };

      await vectorIndex.addVector('test1', embedding, metadata);

      const stats = vectorIndex.getStats();
      expect(stats.totalVectors).toBe(1);
      expect(stats.dimensions).toBe(4);
    });

    it('should handle multiple vectors with same dimensions', async () => {
      const embeddings = [
        new Float32Array([0.1, 0.2, 0.3, 0.4]),
        new Float32Array([0.5, 0.6, 0.7, 0.8]),
        new Float32Array([0.9, 1.0, 1.1, 1.2])
      ];

      for (let i = 0; i < embeddings.length; i++) {
        await vectorIndex.addVector(`test${i}`, embeddings[i], { index: i });
      }

      const stats = vectorIndex.getStats();
      expect(stats.totalVectors).toBe(3);
      expect(stats.dimensions).toBe(4);
    });

    it('should reject vectors with mismatched dimensions', async () => {
      // Add first vector with 4 dimensions
      await vectorIndex.addVector('test1', new Float32Array([0.1, 0.2, 0.3, 0.4]), {});

      // Try to add vector with 3 dimensions
      await expect(
        vectorIndex.addVector('test2', new Float32Array([0.1, 0.2, 0.3]), {})
      ).rejects.toThrow('Embedding dimension mismatch');
    });

    it('should update existing vector', async () => {
      const originalEmbedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const updatedEmbedding = new Float32Array([0.5, 0.6, 0.7, 0.8]);

      await vectorIndex.addVector('test1', originalEmbedding, { version: 1 });
      await vectorIndex.addVector('test1', updatedEmbedding, { version: 2 });

      const stats = vectorIndex.getStats();
      expect(stats.totalVectors).toBe(1); // Still only one vector
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // Add test vectors
      const testVectors = [
        { id: 'vec1', embedding: [1.0, 0.0, 0.0, 0.0], metadata: { type: 'A' } },
        { id: 'vec2', embedding: [0.0, 1.0, 0.0, 0.0], metadata: { type: 'B' } },
        { id: 'vec3', embedding: [0.0, 0.0, 1.0, 0.0], metadata: { type: 'C' } },
        { id: 'vec4', embedding: [0.9, 0.1, 0.0, 0.0], metadata: { type: 'A' } }, // Similar to vec1
      ];

      for (const vec of testVectors) {
        await vectorIndex.addVector(vec.id, new Float32Array(vec.embedding), vec.metadata);
      }
    });

    it('should find exact matches', async () => {
      const queryEmbedding = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const results = await vectorIndex.search(queryEmbedding, 5, 0.0);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('vec1');
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
    });

    it('should find similar vectors', async () => {
      const queryEmbedding = new Float32Array([0.95, 0.05, 0.0, 0.0]); // Similar to vec1 and vec4
      const results = await vectorIndex.search(queryEmbedding, 5, 0.8);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // Should find vec1 and possibly vec4
      const foundIds = results.map(r => r.id);
      expect(foundIds).toContain('vec1');
    });

    it('should respect similarity threshold', async () => {
      const queryEmbedding = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const results = await vectorIndex.search(queryEmbedding, 5, 0.99); // High threshold

      // Should only find exact or very close matches
      expect(results.every(r => r.similarity >= 0.99)).toBe(true);
    });

    it('should limit results by k parameter', async () => {
      const queryEmbedding = new Float32Array([0.5, 0.5, 0.0, 0.0]);
      const results = await vectorIndex.search(queryEmbedding, 2, 0.0);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty results for empty index', async () => {
      const emptyIndex = new HNSWVectorIndex(config, logger, persistPath + '_empty');
      const queryEmbedding = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const results = await emptyIndex.search(queryEmbedding, 5, 0.0);

      expect(results).toEqual([]);
    });

    it('should handle query dimension mismatch', async () => {
      const wrongDimensionQuery = new Float32Array([1.0, 0.0]); // 2D instead of 4D
      
      await expect(
        vectorIndex.search(wrongDimensionQuery, 5, 0.0)
      ).rejects.toThrow('Query dimension mismatch');
    });
  });

  describe('removeVector', () => {
    beforeEach(async () => {
      // Add test vectors
      await vectorIndex.addVector('vec1', new Float32Array([1.0, 0.0, 0.0, 0.0]), {});
      await vectorIndex.addVector('vec2', new Float32Array([0.0, 1.0, 0.0, 0.0]), {});
    });

    it('should remove vector successfully', async () => {
      await vectorIndex.removeVector('vec1');

      const stats = vectorIndex.getStats();
      expect(stats.totalVectors).toBe(1);

      // Should not find removed vector in search
      const queryEmbedding = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const results = await vectorIndex.search(queryEmbedding, 5, 0.0);
      
      const foundIds = results.map(r => r.id);
      expect(foundIds).not.toContain('vec1');
    });

    it('should handle removal of non-existent vector', async () => {
      await vectorIndex.removeVector('non-existent');

      const stats = vectorIndex.getStats();
      expect(stats.totalVectors).toBe(2); // No change
    });
  });

  describe('updateVector', () => {
    it('should update vector successfully', async () => {
      const originalEmbedding = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const updatedEmbedding = new Float32Array([0.0, 1.0, 0.0, 0.0]);

      await vectorIndex.addVector('vec1', originalEmbedding, { version: 1 });
      await vectorIndex.updateVector('vec1', updatedEmbedding, { version: 2 });

      // Search for updated embedding
      const results = await vectorIndex.search(updatedEmbedding, 5, 0.99);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('vec1');
      expect((results[0].metadata as { version: number }).version).toBe(2);
    });
  });

  describe('persistence', () => {
    beforeEach(async () => {
      // Add test data
      await vectorIndex.addVector('vec1', new Float32Array([1.0, 0.0, 0.0, 0.0]), { type: 'A' });
      await vectorIndex.addVector('vec2', new Float32Array([0.0, 1.0, 0.0, 0.0]), { type: 'B' });
    });

    it('should save and load index', async () => {
      // Save index
      await vectorIndex.save();

      // Create new index and load
      const newIndex = new HNSWVectorIndex(config, logger, persistPath);
      await newIndex.load();

      // Verify loaded data
      const stats = newIndex.getStats();
      expect(stats.totalVectors).toBe(2);
      expect(stats.dimensions).toBe(4);

      // Test search on loaded index
      const queryEmbedding = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const results = await newIndex.search(queryEmbedding, 5, 0.0);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe('vec1');
    });

    it('should handle loading non-existent index file', async () => {
      const newIndex = new HNSWVectorIndex(config, logger, persistPath + '_nonexistent');
      
      // Should not throw, just log info
      await expect(newIndex.load()).resolves.not.toThrow();
      
      const stats = newIndex.getStats();
      expect(stats.totalVectors).toBe(0);
    });

    it('should handle corrupted index file', async () => {
      // Create corrupted file
      await fs.writeFile(persistPath, 'invalid json');
      
      const newIndex = new HNSWVectorIndex(config, logger, persistPath);
      
      await expect(newIndex.load()).rejects.toThrow();
    });

    it('should handle version incompatibility', async () => {
      // Create index with future version
      const futureVersionData = {
        version: '2.0',
        dimensions: 4,
        maxLevel: 0,
        entryPoint: null,
        config,
        nodes: []
      };
      
      await fs.writeFile(persistPath, JSON.stringify(futureVersionData));
      
      const newIndex = new HNSWVectorIndex(config, logger, persistPath);
      
      await expect(newIndex.load()).rejects.toThrow('Incompatible index version');
    });
  });

  describe('clear', () => {
    it('should clear all vectors', async () => {
      // Add vectors
      await vectorIndex.addVector('vec1', new Float32Array([1.0, 0.0, 0.0, 0.0]), {});
      await vectorIndex.addVector('vec2', new Float32Array([0.0, 1.0, 0.0, 0.0]), {});

      // Clear
      await vectorIndex.clear();

      const stats = vectorIndex.getStats();
      expect(stats.totalVectors).toBe(0);
      expect(stats.dimensions).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', async () => {
      const stats = vectorIndex.getStats();
      
      expect(stats.totalVectors).toBe(0);
      expect(stats.dimensions).toBe(0);
      expect(stats.layers).toBe(0);
      expect(stats.memoryUsage).toBe(0);
      expect(stats.averageConnections).toBe(0);
    });

    it('should calculate statistics after adding vectors', async () => {
      await vectorIndex.addVector('vec1', new Float32Array([1.0, 0.0, 0.0, 0.0]), {});
      await vectorIndex.addVector('vec2', new Float32Array([0.0, 1.0, 0.0, 0.0]), {});

      const stats = vectorIndex.getStats();
      
      expect(stats.totalVectors).toBe(2);
      expect(stats.dimensions).toBe(4);
      expect(stats.layers).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });
  });

  describe('similarity metrics', () => {
    it('should use cosine similarity by default', async () => {
      const vec1 = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const vec2 = new Float32Array([0.0, 1.0, 0.0, 0.0]); // Orthogonal vector

      await vectorIndex.addVector('vec1', vec1, {});
      await vectorIndex.addVector('vec2', vec2, {});

      // Query with vec1 - should get similarity close to 1.0 for vec1 and 0.0 for vec2
      const results = await vectorIndex.search(vec1, 2, 0.0);
      
      expect(results.length).toBe(2);
      expect(results[0].id).toBe('vec1');
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
      expect(results[1].similarity).toBeCloseTo(0.0, 5);
    });

    it('should handle different similarity metrics', async () => {
      // Test with euclidean distance
      const euclideanConfig = { ...config, similarityMetric: 'euclidean' as const };
      const euclideanIndex = new HNSWVectorIndex(euclideanConfig, logger, persistPath + '_euclidean');

      const vec1 = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const vec2 = new Float32Array([1.0, 0.0, 0.0, 0.0]); // Identical

      await euclideanIndex.addVector('vec1', vec1, {});
      await euclideanIndex.addVector('vec2', vec2, {});

      const results = await euclideanIndex.search(vec1, 2, 0.0);
      
      expect(results.length).toBe(2);
      // Both should have high similarity (low distance -> high similarity)
      expect(results[0].similarity).toBeGreaterThan(0.9);
      expect(results[1].similarity).toBeGreaterThan(0.9);
    });
  });
});