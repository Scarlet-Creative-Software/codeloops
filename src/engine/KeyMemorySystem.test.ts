import { describe, it, expect, beforeEach } from 'vitest';
import { KeyMemorySystem } from './KeyMemorySystem.js';
import { DagNode } from './KnowledgeGraph.js';
import { Tag } from './tags.js';
import { v4 as uuid } from 'uuid';

describe('KeyMemorySystem', () => {
  let memorySystem: KeyMemorySystem;
  
  beforeEach(() => {
    memorySystem = new KeyMemorySystem();
  });

  const createTestNode = (artifacts?: Array<{ name: string; path: string }>): DagNode => ({
    id: uuid(),
    project: 'test-project',
    projectContext: '/test/project',
    thought: 'Test thought content for memory system testing',
    role: 'actor',
    parents: [],
    children: [],
    tags: [Tag.Task],
    artifacts: artifacts || [],
    createdAt: new Date().toISOString(),
  });

  describe('storeMemory', () => {
    it('should store a memory for a critic', () => {
      const node = createTestNode([{ name: 'test.js', path: 'src/test.js' }]);
      const criticResponse = 'This code has issues with error handling';
      
      memorySystem.storeMemory('correctness', node, criticResponse);
      
      const memories = memorySystem.getAllMemories('correctness');
      expect(memories).toHaveLength(1);
      expect(memories[0].nodeId).toBe(node.id);
      expect(memories[0].thought).toBe(node.thought);
      expect(memories[0].criticResponse).toBe(criticResponse);
      expect(memories[0].remainingLifespan).toBe(10);
    });

    it('should evict oldest memory when at capacity', () => {
      const criticId = 'efficiency';
      const nodes: DagNode[] = [];
      
      // Store 10 memories
      for (let i = 0; i < 10; i++) {
        const node = createTestNode();
        nodes.push(node);
        memorySystem.storeMemory(criticId, node, `Response ${i}`);
      }
      
      // Store one more (should evict the first one)
      const newNode = createTestNode();
      memorySystem.storeMemory(criticId, newNode, 'New response');
      
      const memories = memorySystem.getAllMemories(criticId);
      expect(memories).toHaveLength(10);
      expect(memories.find(m => m.nodeId === nodes[0].id)).toBeUndefined();
      expect(memories.find(m => m.nodeId === newNode.id)).toBeDefined();
    });
  });

  describe('getRelevantMemories', () => {
    it('should retrieve memories matching artifacts', () => {
      const criticId = 'security';
      const artifact = { name: 'auth.js', path: 'src/auth.js' };
      
      // Store memories with different artifacts
      const node1 = createTestNode([artifact]);
      const node2 = createTestNode([{ name: 'other.js', path: 'src/other.js' }]);
      const node3 = createTestNode([artifact]); // Same artifact
      
      memorySystem.storeMemory(criticId, node1, 'Auth issues');
      memorySystem.storeMemory(criticId, node2, 'Other issues');
      memorySystem.storeMemory(criticId, node3, 'More auth issues');
      
      // Get memories for auth.js
      const relevantMemories = memorySystem.getRelevantMemories(criticId, [artifact]);
      
      expect(relevantMemories).toHaveLength(2);
      expect(relevantMemories[0].nodeId).toBe(node1.id);
      expect(relevantMemories[1].nodeId).toBe(node3.id);
    });

    it('should increment lifespan when memory is accessed', () => {
      const criticId = 'correctness';
      const artifact = { name: 'test.js', path: 'src/test.js' };
      const node = createTestNode([artifact]);
      
      memorySystem.storeMemory(criticId, node, 'Test response');
      
      // Simulate tool calls to reduce lifespan
      for (let i = 0; i < 5; i++) {
        memorySystem.onToolCall();
      }
      
      // Get memory (should increment lifespan)
      const memories = memorySystem.getRelevantMemories(criticId, [artifact]);
      expect(memories[0].remainingLifespan).toBe(6); // 10 - 5 + 1
      expect(memories[0].accessCount).toBe(1);
    });

    it('should cap lifespan at maximum value', () => {
      const criticId = 'efficiency';
      const artifact = { name: 'test.js', path: 'src/test.js' };
      const node = createTestNode([artifact]);
      
      memorySystem.storeMemory(criticId, node, 'Test response');
      
      // Access multiple times
      for (let i = 0; i < 5; i++) {
        memorySystem.getRelevantMemories(criticId, [artifact]);
      }
      
      const memories = memorySystem.getAllMemories(criticId);
      expect(memories[0].remainingLifespan).toBe(10); // Capped at max
      expect(memories[0].accessCount).toBe(5);
    });
  });

  describe('onToolCall', () => {
    it('should decrement lifespan of all memories', () => {
      const node1 = createTestNode();
      const node2 = createTestNode();
      
      memorySystem.storeMemory('critic1', node1, 'Response 1');
      memorySystem.storeMemory('critic2', node2, 'Response 2');
      
      // Call tool 3 times
      for (let i = 0; i < 3; i++) {
        memorySystem.onToolCall();
      }
      
      expect(memorySystem.getAllMemories('critic1')[0].remainingLifespan).toBe(7);
      expect(memorySystem.getAllMemories('critic2')[0].remainingLifespan).toBe(7);
    });

    it('should remove expired memories', () => {
      const node = createTestNode();
      memorySystem.storeMemory('correctness', node, 'Response');
      
      // Call tool 10 times (should expire the memory)
      for (let i = 0; i < 10; i++) {
        memorySystem.onToolCall();
      }
      
      const memories = memorySystem.getAllMemories('correctness');
      expect(memories).toHaveLength(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const artifact = { name: 'test.js', path: 'src/test.js' };
      const node1 = createTestNode([artifact]);
      const node2 = createTestNode();
      
      memorySystem.storeMemory('critic1', node1, 'Response 1');
      memorySystem.storeMemory('critic1', node2, 'Response 2');
      memorySystem.storeMemory('critic2', node1, 'Response 3');
      
      // Access some memories
      memorySystem.getRelevantMemories('critic1', [artifact]);
      memorySystem.getRelevantMemories('critic1', [artifact]);
      
      const stats = memorySystem.getStats();
      
      expect(stats.critic1).toEqual({
        count: 2,
        totalAccesses: 2, // Only node1 was accessed
        avgLifespan: 10,
      });
      
      expect(stats.critic2).toEqual({
        count: 1,
        totalAccesses: 0,
        avgLifespan: 10,
      });
    });
  });

  describe('clearMemories', () => {
    it('should clear all memories for a critic', () => {
      const node = createTestNode();
      memorySystem.storeMemory('correctness', node, 'Response');
      
      expect(memorySystem.getAllMemories('correctness')).toHaveLength(1);
      
      memorySystem.clearMemories('correctness');
      
      expect(memorySystem.getAllMemories('correctness')).toHaveLength(0);
    });
  });
});