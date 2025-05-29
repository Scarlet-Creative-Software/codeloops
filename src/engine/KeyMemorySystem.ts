import { z } from 'zod';
import { DagNode } from './KnowledgeGraph.js';
import { getInstance as getLogger } from '../logger.js';

/**
 * Schema for a memory entry
 */
export const MemoryEntrySchema = z.object({
  nodeId: z.string().describe('ID of the original actor node'),
  thought: z.string().describe('The thought content'),
  artifacts: z.array(z.object({
    name: z.string(),
    path: z.string(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  criticResponse: z.string().describe('The critic response or consensus'),
  storedAt: z.number().describe('Timestamp when memory was stored'),
  lastAccessed: z.number().describe('Timestamp of last access'),
  remainingLifespan: z.number().min(0).max(10).describe('Remaining tool calls before expiry'),
  accessCount: z.number().describe('Number of times this memory was accessed'),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

/**
 * KeyMemorySystem manages per-critic memory storage with automatic expiration
 */
export class KeyMemorySystem {
  private memories: Map<string, MemoryEntry[]> = new Map(); // criticId -> memories
  private readonly maxMemoriesPerCritic = 10;
  private readonly initialLifespan = 10;
  private toolCallCounter = 0;
  private logger = getLogger();

  /**
   * Increments the tool call counter and decrements memory lifespans
   */
  onToolCall(): void {
    this.toolCallCounter++;
    this.logger.debug(`KeyMemorySystem: Tool call ${this.toolCallCounter}`);
    
    // Decrement lifespan for all memories
    for (const [criticId, memories] of this.memories.entries()) {
      const updatedMemories = memories
        .map(memory => ({
          ...memory,
          remainingLifespan: memory.remainingLifespan - 1
        }))
        .filter(memory => memory.remainingLifespan > 0);
      
      if (updatedMemories.length !== memories.length) {
        this.logger.debug(
          `KeyMemorySystem: Expired ${memories.length - updatedMemories.length} memories for critic ${criticId}`
        );
      }
      
      this.memories.set(criticId, updatedMemories);
    }
  }

  /**
   * Stores a memory for a specific critic
   */
  storeMemory(criticId: string, node: DagNode, criticResponse: string): void {
    const memories = this.memories.get(criticId) || [];
    
    const newMemory: MemoryEntry = {
      nodeId: node.id,
      thought: node.thought,
      artifacts: node.artifacts?.map(a => ({ name: a.name, path: a.path })),
      tags: node.tags,
      criticResponse,
      storedAt: Date.now(),
      lastAccessed: Date.now(),
      remainingLifespan: this.initialLifespan,
      accessCount: 0,
    };

    // If at capacity, remove least recently accessed memory
    if (memories.length >= this.maxMemoriesPerCritic) {
      const sortedMemories = [...memories].sort((a, b) => a.lastAccessed - b.lastAccessed);
      const removed = sortedMemories[0];
      this.logger.debug(
        `KeyMemorySystem: Evicting memory ${removed.nodeId} for critic ${criticId} (last accessed: ${new Date(removed.lastAccessed).toISOString()})`
      );
      memories.splice(memories.indexOf(removed), 1);
    }

    memories.push(newMemory);
    this.memories.set(criticId, memories);
    
    this.logger.info(
      `KeyMemorySystem: Stored memory for critic ${criticId}, node ${node.id}. Total memories: ${memories.length}`
    );
  }

  /**
   * Retrieves memories relevant to the given artifacts
   */
  getRelevantMemories(criticId: string, artifacts?: Array<{ path: string }>): MemoryEntry[] {
    const memories = this.memories.get(criticId) || [];
    
    if (!artifacts || artifacts.length === 0) {
      return [];
    }

    const artifactPaths = new Set(artifacts.map(a => a.path));
    const relevantMemories: MemoryEntry[] = [];

    for (const memory of memories) {
      if (memory.artifacts?.some(a => artifactPaths.has(a.path))) {
        // Update access time and increment lifespan (max 10)
        memory.lastAccessed = Date.now();
        memory.accessCount++;
        memory.remainingLifespan = Math.min(this.initialLifespan, memory.remainingLifespan + 1);
        
        relevantMemories.push(memory);
        
        this.logger.debug(
          `KeyMemorySystem: Retrieved memory ${memory.nodeId} for critic ${criticId}, lifespan extended to ${memory.remainingLifespan}`
        );
      }
    }

    return relevantMemories;
  }

  /**
   * Gets all memories for a specific critic
   */
  getAllMemories(criticId: string): MemoryEntry[] {
    return this.memories.get(criticId) || [];
  }

  /**
   * Clears all memories for a specific critic
   */
  clearMemories(criticId: string): void {
    this.memories.delete(criticId);
    this.logger.info(`KeyMemorySystem: Cleared all memories for critic ${criticId}`);
  }

  /**
   * Gets memory statistics
   */
  getStats(): Record<string, { count: number; totalAccesses: number; avgLifespan: number }> {
    const stats: Record<string, { count: number; totalAccesses: number; avgLifespan: number }> = {};
    
    for (const [criticId, memories] of this.memories.entries()) {
      const totalAccesses = memories.reduce((sum, m) => sum + m.accessCount, 0);
      const avgLifespan = memories.length > 0 
        ? memories.reduce((sum, m) => sum + m.remainingLifespan, 0) / memories.length 
        : 0;
      
      stats[criticId] = {
        count: memories.length,
        totalAccesses,
        avgLifespan: Math.round(avgLifespan * 10) / 10,
      };
    }
    
    return stats;
  }
}