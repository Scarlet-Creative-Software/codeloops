/**
 * Integration tests for MemoryMappedStorageEngine node operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryMappedStorageEngine, createMemoryMappedStorageConfig } from './MemoryMappedStorageEngine.js';
import { type CodeLoopsLogger, createLogger } from '../logger.js';
import { DagNode } from './KnowledgeGraph.js';
import { Tag } from './tags.js';

describe('MemoryMappedStorageEngine Operations', () => {
  let tempDir: string;
  let storageEngine: MemoryMappedStorageEngine;
  let logger: CodeLoopsLogger;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'mmap-ops-test-'));
    
    // Create logger with minimal output for tests
    logger = createLogger({ level: 'error' });
    
    // Create storage engine with test configuration
    const config = createMemoryMappedStorageConfig({
      filePath: path.join(tempDir, 'test_storage.cldb'),
      maxMemoryUsage: 10 * 1024 * 1024, // 10MB for tests
      backgroundFlushInterval: 1000, // 1 second for faster tests
      enableCompression: false, // Disable for simpler testing
    });
    
    storageEngine = new MemoryMappedStorageEngine(config, logger);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await storageEngine.shutdown();
    } catch {
      // Ignore shutdown errors in tests
    }
    
    // Remove temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Operations', () => {
    it('should insert and retrieve a node', async () => {
      await storageEngine.initialize();
      
      const testNode: DagNode = {
        id: 'test-node-1',
        project: 'test-project',
        projectContext: 'test-context',
        thought: 'This is a test thought',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [Tag.Task],
        artifacts: [{
          name: 'test.ts',
          path: 'src/test.ts',
        }],
      };
      
      // Insert node
      await storageEngine.insertNode(testNode);
      
      // Retrieve node
      const retrieved = await storageEngine.getNode(testNode.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(testNode.id);
      expect(retrieved?.thought).toBe(testNode.thought);
      expect(retrieved?.tags).toEqual(testNode.tags);
    });

    it('should handle multiple nodes', async () => {
      await storageEngine.initialize();
      
      const nodes: DagNode[] = [];
      for (let i = 0; i < 10; i++) {
        nodes.push({
          id: `node-${i}`,
          project: 'test-project',
          projectContext: 'test-context',
          thought: `Thought number ${i}`,
          role: 'actor',
          parents: i > 0 ? [`node-${i - 1}`] : [],
          children: [],
          createdAt: new Date().toISOString(),
          tags: i % 2 === 0 ? [Tag.Task] : [Tag.Design],
          artifacts: [],
        });
      }
      
      // Insert all nodes
      for (const node of nodes) {
        await storageEngine.insertNode(node);
      }
      
      // Verify all can be retrieved
      for (const node of nodes) {
        const retrieved = await storageEngine.getNode(node.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(node.id);
      }
    });

    it('should return undefined for non-existent nodes', async () => {
      await storageEngine.initialize();
      
      const result = await storageEngine.getNode('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('Memory Management', () => {
    it('should track memory usage', async () => {
      await storageEngine.initialize();
      
      const initialStats = storageEngine.getMemoryStats();
      expect(initialStats.cachedNodes).toBe(0);
      expect(initialStats.totalAllocated).toBe(0);
      
      // Insert a node
      const testNode: DagNode = {
        id: 'mem-test-1',
        project: 'test-project',
        projectContext: 'test-context',
        thought: 'x'.repeat(1000), // Large thought
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [],
        artifacts: [],
      };
      
      await storageEngine.insertNode(testNode);
      
      const afterInsertStats = storageEngine.getMemoryStats();
      expect(afterInsertStats.cachedNodes).toBe(1);
      expect(afterInsertStats.totalAllocated).toBeGreaterThan(0);
    });

    it('should handle cache hits and misses', async () => {
      await storageEngine.initialize();
      
      const testNode: DagNode = {
        id: 'cache-test-1',
        project: 'test-project',
        projectContext: 'test-context',
        thought: 'Cache test node',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [],
        artifacts: [],
      };
      
      await storageEngine.insertNode(testNode);
      
      // First access - should be a cache hit since it was just inserted
      const stats1 = storageEngine.getMemoryStats();
      const initialHitRate = stats1.hitRate;
      
      // Access the same node again - should be a cache hit
      await storageEngine.getNode(testNode.id);
      
      const stats2 = storageEngine.getMemoryStats();
      expect(stats2.hitRate).toBeGreaterThanOrEqual(initialHitRate);
    });
  });

  describe('Persistence', () => {
    it('should persist data across instances', async () => {
      const filePath = path.join(tempDir, 'persist_test.cldb');
      const config = createMemoryMappedStorageConfig({
        filePath,
        maxMemoryUsage: 10 * 1024 * 1024,
      });
      
      // Create first instance and insert data
      const engine1 = new MemoryMappedStorageEngine(config, logger);
      await engine1.initialize();
      
      const testNode: DagNode = {
        id: 'persist-test-1',
        project: 'test-project',
        projectContext: 'test-context',
        thought: 'This should persist',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        metadata: {
          testValue: 42,
        },
        tags: [],
        artifacts: [],
      };
      
      await engine1.insertNode(testNode);
      await engine1.flushToDisk();
      await engine1.shutdown();
      
      // Create second instance and verify data
      const engine2 = new MemoryMappedStorageEngine(config, logger);
      await engine2.initialize();
      
      const retrieved = await engine2.getNode(testNode.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(testNode.id);
      expect(retrieved?.thought).toBe(testNode.thought);
      expect(retrieved?.metadata?.testValue).toBe(42);
      
      await engine2.shutdown();
    });
  });
});