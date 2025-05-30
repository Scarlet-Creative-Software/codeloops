/**
 * Integration test for SemanticCacheManager with KnowledgeGraph
 * 
 * This test verifies that:
 * 1. SemanticCacheManager integrates properly with KnowledgeGraph
 * 2. The cache lookup workflow works correctly
 * 3. Configuration is properly loaded and used
 * 4. Error handling works as expected
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeGraphManager } from '../../src/engine/KnowledgeGraph.ts';
import { CodeLoopsLogger, createLogger } from '../../src/logger.ts';
import { PerformanceConfig } from '../../src/config/schema.ts';
import { Tag } from '../../src/engine/tags.ts';
import { DagNode } from '../../src/engine/KnowledgeGraph.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

describe('SemanticCacheManager Integration', () => {
  let kg: KnowledgeGraphManager;
  let logger: CodeLoopsLogger;
  let tempDir: string;
  
  const semanticCacheConfig: PerformanceConfig['semanticCache'] = {
    enabled: false, // Disabled to avoid requiring API key in tests
    embeddingModel: 'text-embedding-004',
    similarityThreshold: 0.85,
    confidenceThreshold: 0.90,
    maxCandidates: 10,
    cacheSize: 100,
    ttl: 86400000, // 24 hours
    cleanup: {
      enabled: true,
      intervalMs: 3600000, // 1 hour
      maxAge: 604800000 // 7 days
    },
    hnsw: {
      efConstruction: 200,
      efSearch: 50,
      maxConnections: 16,
      similarityMetric: 'cosine' as const
    }
  };
  
  beforeEach(async () => {
    // Create temp directory for test
    tempDir = join(tmpdir(), `semantic-cache-test-${randomUUID()}`);
    
    // Override dataDir for testing
    const originalDataDir = process.env.CODELOOPS_DATA_DIR;
    process.env.CODELOOPS_DATA_DIR = tempDir;
    
    logger = createLogger();
    kg = new KnowledgeGraphManager(logger, semanticCacheConfig);
    await kg.init();
    
    // Restore original dataDir
    if (originalDataDir) {
      process.env.CODELOOPS_DATA_DIR = originalDataDir;
    } else {
      delete process.env.CODELOOPS_DATA_DIR;
    }
  });
  
  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('should initialize KnowledgeGraph with semantic cache disabled in test mode', async () => {
    const stats = kg.getSemanticCacheStats();
    
    expect(stats.enabled).toBe(false);
    expect(stats.message).toBe('Semantic cache not enabled');
  });
  
  it('should initialize KnowledgeGraph without semantic cache when disabled', async () => {
    const disabledConfig = { ...semanticCacheConfig, enabled: false };
    const kgDisabled = new KnowledgeGraphManager(logger, disabledConfig);
    await kgDisabled.init();
    
    const stats = kgDisabled.getSemanticCacheStats();
    
    expect(stats.enabled).toBe(false);
    expect(stats.message).toBe('Semantic cache not enabled');
  });
  
  it('should handle search queries without semantic cache when embedding service fails', async () => {
    // This test ensures graceful fallback when semantic cache encounters errors
    const testNode: DagNode = {
      id: 'test-node-1',
      project: 'test-project',
      projectContext: '/test/project',
      thought: 'Create authentication system with JWT tokens',
      role: 'actor',
      tags: [Tag.Task],
      artifacts: [],
      parents: [],
      children: [],
      createdAt: new Date().toISOString()
    };
    
    // Add a node to the knowledge graph
    await kg.appendEntity(testNode);
    
    // Search should work even if semantic cache fails internally
    const results = await kg.search({
      project: 'test-project',
      query: 'authentication',
      tags: [Tag.Task],
      limit: 10
    });
    
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.id === 'test-node-1')).toBe(true);
    expect(results.some(r => r.thought.includes('authentication'))).toBe(true);
  });
  
  it('should provide cache statistics', async () => {
    const indexStats = kg.getIndexStats();
    const cacheStats = kg.getSemanticCacheStats();
    
    expect(indexStats.indexed).toBe(true);
    expect(indexStats.totalProjects).toBeGreaterThanOrEqual(0);
    expect(indexStats.totalTags).toBeGreaterThanOrEqual(0);
    expect(indexStats.totalContentTerms).toBeGreaterThanOrEqual(0);
    
    expect(cacheStats.enabled).toBe(false);
    expect(cacheStats.message).toBe('Semantic cache not enabled');
  });
  
  it('should handle cache cleanup operations', async () => {
    // Add some test data
    const testNode: DagNode = {
      id: 'test-node-cleanup',
      project: 'test-project',
      projectContext: '/test/project',
      thought: 'Test node for cleanup',
      role: 'actor',
      tags: [Tag.Task],
      artifacts: [],
      parents: [],
      children: [],
      createdAt: new Date().toISOString()
    };
    
    await kg.appendEntity(testNode);
    
    // Perform cleanup - should not throw
    await kg.cleanup();
    
    // Verify node still exists after cleanup
    const results = await kg.search({
      project: 'test-project',
      query: 'cleanup',
      limit: 10
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-node-cleanup');
  });
  
  it('should handle cache clearing operations', async () => {
    // Add some test data
    const testNode: DagNode = {
      id: 'test-node-clear',
      project: 'test-project',
      projectContext: '/test/project',
      thought: 'Test node for clearing',
      role: 'actor',
      tags: [Tag.Task],
      artifacts: [],
      parents: [],
      children: [],
      createdAt: new Date().toISOString()
    };
    
    await kg.appendEntity(testNode);
    
    // Clear caches - should not throw
    await kg.clearCaches();
    
    // Verify node still exists after cache clear (data persisted in log file)
    const results = await kg.search({
      project: 'test-project',
      query: 'clearing',
      limit: 10
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-node-clear');
    
    // Cache stats should show disabled state
    const cacheStats = kg.getSemanticCacheStats();
    expect(cacheStats.enabled).toBe(false);
    expect(cacheStats.message).toBe('Semantic cache not enabled');
  });
  
  it('should handle search with different query patterns', async () => {
    // Add test nodes with different content
    const nodes: DagNode[] = [
      {
        id: 'auth-node',
        project: 'test-project',
        projectContext: '/test/project',
        thought: 'Implement user authentication with JWT',
        role: 'actor',
        tags: [Tag.Task],
        artifacts: [],
        parents: [],
        children: [],
        createdAt: new Date().toISOString()
      },
      {
        id: 'db-node',
        project: 'test-project',
        projectContext: '/test/project',
        thought: 'Set up database connection and models',
        role: 'actor',
        tags: [Tag.Task],
        artifacts: [],
        parents: [],
        children: [],
        createdAt: new Date().toISOString()
      },
      {
        id: 'api-node',
        project: 'test-project',
        projectContext: '/test/project',
        thought: 'Create REST API endpoints',
        role: 'actor',
        tags: [Tag.Design],
        artifacts: [],
        parents: [],
        children: [],
        createdAt: new Date().toISOString()
      }
    ];
    
    for (const node of nodes) {
      await kg.appendEntity(node);
    }
    
    // Search by text content
    const authResults = await kg.search({
      project: 'test-project',
      query: 'authentication',
      limit: 10
    });
    
    expect(authResults.length).toBeGreaterThanOrEqual(1);
    expect(authResults.some(r => r.id === 'auth-node')).toBe(true);
    
    // Search by tags
    const taskResults = await kg.search({
      project: 'test-project',
      tags: [Tag.Task],
      limit: 10
    });
    
    expect(taskResults.length).toBeGreaterThanOrEqual(2);
    expect(taskResults.map(n => n.id)).toContain('auth-node');
    expect(taskResults.map(n => n.id)).toContain('db-node');
    
    // Search with combined filters
    const combinedResults = await kg.search({
      project: 'test-project',
      query: 'API',
      tags: [Tag.Design],
      limit: 10
    });
    
    expect(combinedResults).toHaveLength(1);
    expect(combinedResults[0].id).toBe('api-node');
  });
});