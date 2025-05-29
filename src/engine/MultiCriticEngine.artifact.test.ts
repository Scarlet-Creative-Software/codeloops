/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiCriticEngine } from './MultiCriticEngine.js';
import { KnowledgeGraphManager } from './KnowledgeGraph.js';
import { Tag } from './tags.js';
import { readFileSync } from 'fs';

// Mock the fs module
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

// Mock the logger
vi.mock('../logger.js', () => ({
  getInstance: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock generateObject
vi.mock('../utils/genai.js', () => ({
  generateObject: vi.fn().mockResolvedValue({
    critiques: [],
    overallAssessment: 'Test assessment',
    strengths: ['Test strength'],
    storeMemory: false,
  }),
}));

describe('MultiCriticEngine Artifact Loading', () => {
  let engine: MultiCriticEngine;
  let mockKg: KnowledgeGraphManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKg = {
      getNode: vi.fn(),
      getNeighbors: vi.fn().mockResolvedValue([]),
      appendEntity: vi.fn(),
    } as unknown as KnowledgeGraphManager;
    engine = new MultiCriticEngine(mockKg);
  });

  it('should load artifact content from file system when content not provided', async () => {
    const mockFileContent = `line 1
line 2
line 3`;
    
    vi.mocked(readFileSync).mockReturnValue(mockFileContent);
    
    const testNode = {
      id: 'test-node',
      project: 'test-project',
      projectContext: '/test/project',
      thought: 'Test thought',
      role: 'actor' as const,
      parents: [],
      children: [],
      createdAt: new Date().toISOString(),
      tags: [Tag.Task],
      artifacts: [
        { name: 'test.ts', path: '/test/test.ts' }
      ],
    };
    
    vi.mocked(mockKg.getNode).mockResolvedValue(testNode);
    
    // Access private method through any type casting for testing
    const context = await (engine as any).gatherContext('test-node');
    
    expect(readFileSync).toHaveBeenCalledWith('/test/test.ts', 'utf-8');
    expect(context.artifactContents.get('/test/test.ts')).toBe(mockFileContent);
  });

  it('should use provided artifact content when available', async () => {
    const providedContent = 'Provided content';
    
    const testNode = {
      id: 'test-node',
      project: 'test-project',
      projectContext: '/test/project',
      thought: 'Test thought',
      role: 'actor' as const,
      parents: [],
      children: [],
      createdAt: new Date().toISOString(),
      tags: [Tag.Task],
      artifacts: [
        { name: 'test.ts', path: '/test/test.ts', content: providedContent }
      ],
    };
    
    vi.mocked(mockKg.getNode).mockResolvedValue(testNode);
    
    const context = await (engine as any).gatherContext('test-node');
    
    expect(readFileSync).not.toHaveBeenCalled();
    expect(context.artifactContents.get('/test/test.ts')).toBe(providedContent);
  });

  it('should truncate files longer than 3000 lines', async () => {
    const longContent = Array.from({ length: 3500 }, (_, i) => `line ${i + 1}`).join('\n');
    
    vi.mocked(readFileSync).mockReturnValue(longContent);
    
    const testNode = {
      id: 'test-node',
      project: 'test-project',
      projectContext: '/test/project',
      thought: 'Test thought',
      role: 'actor' as const,
      parents: [],
      children: [],
      createdAt: new Date().toISOString(),
      tags: [Tag.Task],
      artifacts: [
        { name: 'large.ts', path: '/test/large.ts' }
      ],
    };
    
    vi.mocked(mockKg.getNode).mockResolvedValue(testNode);
    
    const context = await (engine as any).gatherContext('test-node');
    
    const content = context.artifactContents.get('/test/large.ts');
    expect(content).toContain('line 3000');
    expect(content).toContain('... (truncated after 3000 lines)');
    expect(content).not.toContain('line 3001');
  });

  it('should handle file read errors gracefully', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });
    
    const testNode = {
      id: 'test-node',
      project: 'test-project',
      projectContext: '/test/project',
      thought: 'Test thought',
      role: 'actor' as const,
      parents: [],
      children: [],
      createdAt: new Date().toISOString(),
      tags: [Tag.Task],
      artifacts: [
        { name: 'missing.ts', path: '/test/missing.ts' }
      ],
    };
    
    vi.mocked(mockKg.getNode).mockResolvedValue(testNode);
    
    const context = await (engine as any).gatherContext('test-node');
    
    expect(context.artifactContents.get('/test/missing.ts')).toBe('[File not found or cannot be read: /test/missing.ts]');
  });

  it('should include artifact contents in critic prompts', async () => {
    const mockFileContent = `function test() {
  return 42;
}`;
    
    vi.mocked(readFileSync).mockReturnValue(mockFileContent);
    
    const testNode = {
      id: 'test-node',
      project: 'test-project',
      projectContext: '/test/project',
      thought: 'Implement test function',
      role: 'actor' as const,
      parents: [],
      children: [],
      createdAt: new Date().toISOString(),
      tags: [Tag.Task],
      artifacts: [
        { name: 'test.ts', path: '/test/test.ts' }
      ],
    };
    
    vi.mocked(mockKg.getNode).mockResolvedValue(testNode);
    
    const context = await (engine as any).gatherContext('test-node');
    const critic = (engine as any).critics[0];
    const prompt = (engine as any).buildCriticPrompt(critic, context);
    
    expect(prompt).toContain('Artifact Contents:');
    expect(prompt).toContain('--- /test/test.ts ---');
    expect(prompt).toContain(mockFileContent);
    expect(prompt).toContain('--- End of /test/test.ts ---');
  });
});