import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MultiCriticEngine } from './MultiCriticEngine.js';
import { KnowledgeGraphManager, type DagNode } from './KnowledgeGraph.js';
import { Tag } from './tags.js';
import { createLogger, setGlobalLogger, getInstance as getLogger } from '../logger.js';
import * as genai from '../utils/genai.js';
import { v4 as uuid } from 'uuid';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

// Set up logger
const logger = createLogger({ withFile: false, withDevStdout: true });
setGlobalLogger(logger);

// Mock the genai module
vi.mock('../utils/genai.js', () => ({
  generateObject: vi.fn(),
}));

describe('MultiCriticEngine', () => {
  let multiCriticEngine: MultiCriticEngine;
  let kg: KnowledgeGraphManager;
  let testDataDir: string;
  let logFilePath: string;

  beforeEach(async () => {
    // Create a unique test directory
    testDataDir = path.join(os.tmpdir(), `multi-critic-test-${uuid()}`);
    await fs.mkdir(testDataDir, { recursive: true });
    logFilePath = path.join(testDataDir, 'knowledge_graph.ndjson');

    // Create KnowledgeGraphManager instance
    kg = new KnowledgeGraphManager(getLogger());
    // @ts-expect-error - Accessing private property for testing
    kg.logFilePath = logFilePath;
    await kg.init();

    // Create MultiCriticEngine instance
    multiCriticEngine = new MultiCriticEngine(kg);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up test directory:', error);
    }
  });

  describe('performMultiCriticReview', () => {
    it('should perform a complete multi-critic review successfully', async () => {
      // Create an actor node
      const actorNode: DagNode = {
        id: uuid(),
        project: 'test-project',
        projectContext: '/path/to/test-project',
        thought: 'Implement user authentication with JWT tokens',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [Tag.Task],
        artifacts: [
          { name: 'auth.ts', path: 'src/auth.ts', hash: 'abc123' },
        ],
      };
      await kg.appendEntity(actorNode);

      // Mock the generateObject responses
      const mockCriticResponse = {
        critiques: [
          {
            issue: 'Missing token expiration handling',
            severity: 'high',
            confidence: 0.9,
            suggestion: 'Add token expiration and refresh logic',
            codeExample: 'if (isTokenExpired(token)) { refreshToken(); }',
          },
        ],
        overallAssessment: 'Good implementation but needs security improvements',
        strengths: ['Clean code structure', 'Proper error handling'],
      };

      const mockCrossComparisonResponse = {
        agreements: [
          {
            issue: 'Missing token expiration handling',
            criticsAgreeing: ['correctness', 'security'],
            strengthOfAgreement: 0.85,
          },
        ],
        disagreements: [],
        revisedConfidences: { 'Missing token expiration handling': 0.95 },
        finalStance: 'Token expiration is critical for security',
      };

      const mockFinalCritique = {
        summary: 'Multi-critic review identified security improvements needed',
        prioritizedIssues: [
          {
            issue: 'Missing token expiration handling',
            severity: 'high',
            consensusLevel: 'unanimous',
            recommendation: 'Implement token refresh mechanism',
          },
        ],
        conclusion: 'Address security issues before deployment',
      };

      vi.mocked(genai.generateObject)
        .mockResolvedValueOnce(mockCriticResponse) // Correctness critic
        .mockResolvedValueOnce(mockCriticResponse) // Efficiency critic
        .mockResolvedValueOnce(mockCriticResponse) // Security critic
        .mockResolvedValueOnce(mockCrossComparisonResponse) // Cross comparison 1
        .mockResolvedValueOnce(mockCrossComparisonResponse) // Cross comparison 2
        .mockResolvedValueOnce(mockCrossComparisonResponse) // Cross comparison 3
        .mockResolvedValueOnce(mockFinalCritique); // Final synthesis

      // Perform the multi-critic review
      const criticNode = await multiCriticEngine.performMultiCriticReview({
        actorNodeId: actorNode.id,
        projectContext: actorNode.projectContext,
        project: actorNode.project,
      });

      // Verify the critic node was created
      expect(criticNode).toBeDefined();
      expect(criticNode.role).toBe('critic');
      expect(criticNode.parents).toEqual([actorNode.id]);
      expect(criticNode.thought).toContain('Multi-Critic Consensus Review');
      expect(criticNode.thought).toContain('Missing token expiration handling');
      expect(criticNode.metadata?.multiCritic).toBe(true);
      expect(criticNode.metadata?.criticsInvolved).toBe(3);

      // Verify the actor node was updated with the critic as child
      const updatedActorNode = await kg.getNode(actorNode.id);
      expect(updatedActorNode?.children).toContain(criticNode.id);

      // Verify generateObject was called the expected number of times
      expect(genai.generateObject).toHaveBeenCalledTimes(7);
    });

    it('should handle partial critic failures gracefully', async () => {
      // Create an actor node
      const actorNode: DagNode = {
        id: uuid(),
        project: 'test-project',
        projectContext: '/path/to/test-project',
        thought: 'Implement data validation',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [Tag.Task],
        artifacts: [],
      };
      await kg.appendEntity(actorNode);

      const mockCriticResponse = {
        critiques: [
          {
            issue: 'Missing input sanitization',
            severity: 'medium',
            confidence: 0.8,
            suggestion: 'Add input validation',
          },
        ],
        overallAssessment: 'Needs input validation',
        strengths: ['Good structure'],
      };

      const mockCrossComparisonResponse = {
        agreements: [],
        disagreements: [],
        revisedConfidences: {},
        finalStance: 'Input validation needed',
      };

      const mockFinalCritique = {
        summary: 'Review with partial critic responses',
        prioritizedIssues: [
          {
            issue: 'Missing input sanitization',
            severity: 'medium',
            consensusLevel: 'partial',
            recommendation: 'Add validation layer',
          },
        ],
        conclusion: 'Implement suggested improvements',
      };

      // Mock responses with one critic failing
      vi.mocked(genai.generateObject)
        .mockResolvedValueOnce(mockCriticResponse) // Correctness critic
        .mockRejectedValueOnce(new Error('Critic timeout')) // Efficiency critic fails
        .mockResolvedValueOnce(mockCriticResponse) // Security critic
        .mockResolvedValueOnce(mockCrossComparisonResponse) // Cross comparison 1
        .mockResolvedValueOnce(mockCrossComparisonResponse) // Cross comparison 2
        .mockResolvedValueOnce(mockFinalCritique); // Final synthesis

      // Should still succeed with 2 out of 3 critics
      const criticNode = await multiCriticEngine.performMultiCriticReview({
        actorNodeId: actorNode.id,
        projectContext: actorNode.projectContext,
        project: actorNode.project,
      });

      expect(criticNode).toBeDefined();
      expect(criticNode.role).toBe('critic');
    });

    it('should throw error when all critics fail', async () => {
      // Create an actor node
      const actorNode: DagNode = {
        id: uuid(),
        project: 'test-project',
        projectContext: '/path/to/test-project',
        thought: 'Test thought',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [Tag.Task],
        artifacts: [],
      };
      await kg.appendEntity(actorNode);

      // Mock all critics failing
      vi.mocked(genai.generateObject)
        .mockRejectedValue(new Error('API error'));

      await expect(
        multiCriticEngine.performMultiCriticReview({
          actorNodeId: actorNode.id,
          projectContext: actorNode.projectContext,
          project: actorNode.project,
        }),
      ).rejects.toThrow('All critics failed to provide reviews');
    });

    it('should handle missing actor node', async () => {
      const nonExistentId = uuid();

      await expect(
        multiCriticEngine.performMultiCriticReview({
          actorNodeId: nonExistentId,
          projectContext: '/path/to/project',
          project: 'test-project',
        }),
      ).rejects.toThrow(`Actor node ${nonExistentId} not found`);
    });
  });

  describe('consensus building', () => {
    it('should correctly categorize unanimous consensus', async () => {
      const actorNode: DagNode = {
        id: uuid(),
        project: 'test-project',
        projectContext: '/path/to/test-project',
        thought: 'Implement caching layer',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [Tag.Task],
        artifacts: [],
      };
      await kg.appendEntity(actorNode);

      // Mock all critics agreeing on the same issue
      const mockCriticResponse = {
        critiques: [
          {
            issue: 'Cache invalidation strategy missing',
            severity: 'high',
            confidence: 0.9,
            suggestion: 'Implement TTL-based cache invalidation',
          },
        ],
        overallAssessment: 'Needs cache invalidation',
        strengths: ['Good cache structure'],
      };

      const mockCrossComparisonResponse = {
        agreements: [
          {
            issue: 'Cache invalidation strategy missing',
            criticsAgreeing: ['correctness', 'efficiency', 'security'],
            strengthOfAgreement: 0.95,
          },
        ],
        disagreements: [],
        revisedConfidences: { 'Cache invalidation strategy missing': 0.95 },
        finalStance: 'Cache invalidation is critical',
      };

      const mockFinalCritique = {
        summary: 'Unanimous agreement on cache invalidation',
        prioritizedIssues: [
          {
            issue: 'Cache invalidation strategy missing',
            severity: 'high',
            consensusLevel: 'unanimous',
            recommendation: 'Add TTL-based invalidation',
          },
        ],
        conclusion: 'Critical issue to address',
      };

      vi.mocked(genai.generateObject)
        .mockResolvedValueOnce(mockCriticResponse) // All critics
        .mockResolvedValueOnce(mockCriticResponse)
        .mockResolvedValueOnce(mockCriticResponse)
        .mockResolvedValueOnce(mockCrossComparisonResponse) // All cross comparisons
        .mockResolvedValueOnce(mockCrossComparisonResponse)
        .mockResolvedValueOnce(mockCrossComparisonResponse)
        .mockResolvedValueOnce(mockFinalCritique);

      const criticNode = await multiCriticEngine.performMultiCriticReview({
        actorNodeId: actorNode.id,
        projectContext: actorNode.projectContext,
        project: actorNode.project,
      });

      expect(criticNode.thought).toContain('unanimous');
      expect(criticNode.metadata?.consensusAnalysis.strongConsensus).toHaveLength(1);
    });

    it('should handle majority consensus correctly', async () => {
      const actorNode: DagNode = {
        id: uuid(),
        project: 'test-project',
        projectContext: '/path/to/test-project',
        thought: 'Add logging system',
        role: 'actor',
        parents: [],
        children: [],
        createdAt: new Date().toISOString(),
        tags: [Tag.Task],
        artifacts: [],
      };
      await kg.appendEntity(actorNode);

      // Mock 2 out of 3 critics agreeing
      const mockAgreeingResponse = {
        critiques: [
          {
            issue: 'No log rotation strategy',
            severity: 'medium',
            confidence: 0.8,
            suggestion: 'Add log rotation',
          },
        ],
        overallAssessment: 'Needs log rotation',
        strengths: ['Good logging structure'],
      };

      const mockDisagreeingResponse = {
        critiques: [
          {
            issue: 'Performance overhead',
            severity: 'low',
            confidence: 0.6,
            suggestion: 'Consider async logging',
          },
        ],
        overallAssessment: 'Minor performance concern',
        strengths: ['Clean implementation'],
      };

      const mockCrossComparisonResponse = {
        agreements: [
          {
            issue: 'No log rotation strategy',
            criticsAgreeing: ['correctness', 'security'],
            strengthOfAgreement: 0.75,
          },
        ],
        disagreements: [
          {
            issue: 'Performance overhead',
            positions: [
              {
                criticId: 'efficiency',
                stance: 'Minor concern',
                rationale: 'Async logging would help',
              },
            ],
          },
        ],
        revisedConfidences: { 'No log rotation strategy': 0.85 },
        finalStance: 'Log rotation important for production',
      };

      const mockFinalCritique = {
        summary: 'Majority agreement on log rotation',
        prioritizedIssues: [
          {
            issue: 'No log rotation strategy',
            severity: 'medium',
            consensusLevel: 'majority',
            recommendation: 'Implement log rotation',
          },
        ],
        conclusion: 'Address majority concerns',
      };

      vi.mocked(genai.generateObject)
        .mockResolvedValueOnce(mockAgreeingResponse) // Correctness
        .mockResolvedValueOnce(mockDisagreeingResponse) // Efficiency
        .mockResolvedValueOnce(mockAgreeingResponse) // Security
        .mockResolvedValueOnce(mockCrossComparisonResponse)
        .mockResolvedValueOnce(mockCrossComparisonResponse)
        .mockResolvedValueOnce(mockCrossComparisonResponse)
        .mockResolvedValueOnce(mockFinalCritique);

      const criticNode = await multiCriticEngine.performMultiCriticReview({
        actorNodeId: actorNode.id,
        projectContext: actorNode.projectContext,
        project: actorNode.project,
      });

      expect(criticNode.thought).toContain('majority');
      expect(criticNode.metadata?.consensusAnalysis.majorityConsensus).toHaveLength(1);
    });
  });
});