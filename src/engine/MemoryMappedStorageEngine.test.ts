/**
 * Tests for MemoryMappedStorageEngine
 * 
 * This test suite validates the core functionality of the memory-mapped storage engine,
 * including initialization, file format handling, and basic memory management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryMappedStorageEngine, createMemoryMappedStorageConfig } from './MemoryMappedStorageEngine.js';
import { type CodeLoopsLogger, createLogger } from '../logger.js';
import { DagNode } from './KnowledgeGraph.js';

describe('MemoryMappedStorageEngine', () => {
  let tempDir: string;
  let storageEngine: MemoryMappedStorageEngine;
  let logger: CodeLoopsLogger;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'storage-test-'));
    
    // Create logger with minimal output for tests
    logger = createLogger({ level: 'error' });
    
    // Create storage engine with test configuration
    const config = createMemoryMappedStorageConfig({
      filePath: path.join(tempDir, 'test_storage.cldb'),
      maxMemoryUsage: 10 * 1024 * 1024, // 10MB for tests
      backgroundFlushInterval: 1000, // 1 second for faster tests
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

  describe('Initialization', () => {
    it('should initialize with new file creation', async () => {
      await storageEngine.initialize();
      
      const stats = storageEngine.getMemoryStats();
      expect(stats.totalAllocated).toBe(0);
      expect(stats.activeBlocks).toBe(0);
      expect(stats.cachedNodes).toBe(0);
      expect(stats.memoryPressure).toBe('low');
    });

    it('should create file with valid header', async () => {
      await storageEngine.initialize();
      
      // Check that file was created
      const filePath = path.join(tempDir, 'test_storage.cldb');
      const fileStats = await fs.stat(filePath);
      expect(fileStats.isFile()).toBe(true);
      expect(fileStats.size).toBeGreaterThan(0);
    });

    it('should handle double initialization gracefully', async () => {
      await storageEngine.initialize();
      await storageEngine.initialize(); // Should not throw
      
      const stats = storageEngine.getMemoryStats();
      expect(stats).toBeDefined();
    });

    it('should validate configuration parameters', () => {
      expect(() => {
        new MemoryMappedStorageEngine({
          filePath: 'test.cldb',
          maxMemoryUsage: 512, // Too small
          blockSize: 4096,
          enableCompression: true,
          legacyCompatibility: true,
          backgroundFlushInterval: 30000,
        }, logger);
      }).toThrow('maxMemoryUsage must be at least 1MB');
    });

    it('should validate block size parameters', () => {
      expect(() => {
        new MemoryMappedStorageEngine({
          filePath: 'test.cldb',
          maxMemoryUsage: 10 * 1024 * 1024,
          blockSize: 512, // Too small
          enableCompression: true,
          legacyCompatibility: true,
          backgroundFlushInterval: 30000,
        }, logger);
      }).toThrow('blockSize must be between 1KB and 64KB');
    });
  });

  describe('File Header Management', () => {
    it('should create valid file header for new files', async () => {
      await storageEngine.initialize();
      
      // Read the file directly to verify header
      const filePath = path.join(tempDir, 'test_storage.cldb');
      const fileHandle = await fs.open(filePath, 'r');
      const headerBuffer = Buffer.alloc(32); // First 32 bytes contain key header fields
      
      await fileHandle.read(headerBuffer, 0, 32, 0);
      await fileHandle.close();
      
      // Verify magic number
      const magic = headerBuffer.readUInt32LE(0);
      expect(magic).toBe(0x434C4F4F); // "CLOO"
      
      // Verify version
      const version = headerBuffer.readUInt32LE(4);
      expect(version).toBe(1);
      
      // Verify initial node count
      const nodeCount = headerBuffer.readUInt32LE(8);
      expect(nodeCount).toBe(0);
    });

    it('should open existing files with valid headers', async () => {
      // First, create a file
      await storageEngine.initialize();
      await storageEngine.shutdown();
      
      // Create new engine instance and open existing file
      const config = createMemoryMappedStorageConfig({
        filePath: path.join(tempDir, 'test_storage.cldb'),
        maxMemoryUsage: 10 * 1024 * 1024,
      });
      
      const newEngine = new MemoryMappedStorageEngine(config, logger);
      await newEngine.initialize(); // Should open existing file
      
      const stats = newEngine.getMemoryStats();
      expect(stats).toBeDefined();
      
      await newEngine.shutdown();
    });
  });

  describe('Memory Management', () => {
    it('should track memory usage statistics', async () => {
      await storageEngine.initialize();
      
      const stats = storageEngine.getMemoryStats();
      expect(stats.totalAllocated).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.evictionCount).toBe(0);
      expect(stats.memoryPressure).toBe('low');
    });

    it('should calculate memory pressure levels correctly', async () => {
      await storageEngine.initialize();
      
      // Initial state should be low pressure
      const stats = storageEngine.getMemoryStats();
      expect(stats.memoryPressure).toBe('low');
      
      // Note: We can't easily test higher pressure levels without actually
      // consuming memory, which would require implementing the full caching system
    });

    it('should handle flush operations gracefully', async () => {
      await storageEngine.initialize();
      
      // Should not throw even with empty data
      await expect(storageEngine.flushToDisk()).resolves.not.toThrow();
    });
  });

  describe('Node Operations', () => {
    it('should handle node retrieval for non-existent nodes', async () => {
      await storageEngine.initialize();
      
      const result = await storageEngine.getNode('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should throw appropriate errors for unimplemented operations', async () => {
      await storageEngine.initialize();
      
      const testNode: DagNode = {
        id: 'test-node',
        project: 'test-project',
        projectContext: 'test-context',
        thought: 'Test thought',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [],
        artifacts: [],
      };

      // These operations should throw until implemented
      await expect(storageEngine.insertNode(testNode)).rejects.toThrow('not yet implemented');
      await expect(storageEngine.bulkInsert([testNode])).rejects.toThrow('not yet implemented');
      await expect(storageEngine.deleteNode('test-id')).resolves.toBe(false);
    });

    it('should require initialization before operations', async () => {
      // Don't initialize
      
      await expect(storageEngine.getNode('test-id')).rejects.toThrow('not initialized');
      
      const testNode: DagNode = {
        id: 'test-node',
        project: 'test-project',
        projectContext: 'test-context',
        thought: 'Test thought',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [],
        artifacts: [],
      };
      
      await expect(storageEngine.insertNode(testNode)).rejects.toThrow('not initialized');
    });
  });

  describe('Configuration Factory', () => {
    it('should create default configuration', () => {
      const config = createMemoryMappedStorageConfig();
      
      expect(config.filePath).toBe('./data/knowledge_graph.cldb');
      expect(config.maxMemoryUsage).toBe(512 * 1024 * 1024);
      expect(config.blockSize).toBe(4096);
      expect(config.enableCompression).toBe(true);
      expect(config.legacyCompatibility).toBe(true);
      expect(config.backgroundFlushInterval).toBe(30000);
    });

    it('should apply configuration overrides', () => {
      const config = createMemoryMappedStorageConfig({
        maxMemoryUsage: 1024 * 1024 * 1024, // 1GB
        enableCompression: false,
      });
      
      expect(config.maxMemoryUsage).toBe(1024 * 1024 * 1024);
      expect(config.enableCompression).toBe(false);
      expect(config.blockSize).toBe(4096); // Should keep default
    });
  });

  describe('Lifecycle Management', () => {
    it('should handle graceful shutdown', async () => {
      await storageEngine.initialize();
      await expect(storageEngine.shutdown()).resolves.not.toThrow();
      
      // Should be able to shutdown multiple times
      await expect(storageEngine.shutdown()).resolves.not.toThrow();
    });

    it('should cleanup resources on shutdown', async () => {
      await storageEngine.initialize();
      
      // Verify engine is initialized
      expect(() => storageEngine.getMemoryStats()).not.toThrow();
      
      await storageEngine.shutdown();
      
      // Operations should fail after shutdown
      await expect(storageEngine.getNode('test')).rejects.toThrow('not initialized');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid file paths gracefully', async () => {
      const config = createMemoryMappedStorageConfig({
        filePath: '/invalid/path/that/does/not/exist/test.cldb',
      });
      
      const engine = new MemoryMappedStorageEngine(config, logger);
      
      // Should fail to initialize with invalid path
      await expect(engine.initialize()).rejects.toThrow();
    });

    it('should handle corrupted file headers', async () => {
      // Create a file with invalid header
      const corruptedFile = path.join(tempDir, 'corrupted.cldb');
      await fs.writeFile(corruptedFile, 'invalid header data');
      
      const config = createMemoryMappedStorageConfig({
        filePath: corruptedFile,
      });
      
      const engine = new MemoryMappedStorageEngine(config, logger);
      
      // Should fail to open corrupted file
      await expect(engine.initialize()).rejects.toThrow('Invalid file');
    });
  });
});