import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, DagNode } from './KnowledgeGraph.js';
import { Tag } from './tags.js';
import { getInstance as getLogger } from '../logger.js';
import { generateObject } from '../utils/genai.js';
import { KeyMemorySystem } from './KeyMemorySystem.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { getConfig } from '../config/index.js';
// Legacy config import for backward compatibility
import { CRITIC_TEMPERATURES, CRITIC_MAX_TOKENS } from '../config.js';
import { preprocessCriticResponse } from './JsonSanitizer.js';
import { retryJsonParse } from '../utils/retry.js';
import { RequestPriority, resetConnectionManager, getConnectionManager } from '../utils/GeminiConnectionManager.js';

// Schema for structured critic responses
const CriticResponseSchema = z.object({
  critiques: z.array(
    z.object({
      issue: z.string().describe('Description of the issue identified'),
      severity: z.enum(['low', 'medium', 'high', 'critical']).describe('Severity of the issue'),
      confidence: z.number().min(0).max(1).describe('Confidence score (0-1) for this critique point'),
      suggestion: z.string().describe('Specific improvement suggestion'),
      codeExample: z.string().optional().describe('Code example if applicable'),
    }),
  ),
  overallAssessment: z.string().describe('Overall assessment of the thought/code'),
  strengths: z.array(z.string()).describe('Positive aspects identified'),
  storeMemory: z.boolean().optional().describe('Whether to store this review in key memory for future reference'),
});

export type CriticResponse = z.infer<typeof CriticResponseSchema>;

// Schema for cross-critic comparison responses
const CrossCriticResponseSchema = z.object({
  agreements: z.array(
    z.object({
      issue: z.string(),
      criticsAgreeing: z.array(z.string()),
      strengthOfAgreement: z.number().min(0).max(1),
    }),
  ),
  disagreements: z.array(
    z.object({
      issue: z.string(),
      positions: z.array(
        z.object({
          criticId: z.string(),
          stance: z.string(),
          rationale: z.string(),
        }),
      ),
    }),
  ),
  revisedConfidences: z.record(z.string(), z.number()),
  finalStance: z.string(),
});

export type CrossCriticResponse = z.infer<typeof CrossCriticResponseSchema>;

// Schema for consensus analysis (exported for validation)
export const ConsensusAnalysisSchema = z.object({
  strongConsensus: z.array(
    z.object({
      issue: z.string(),
      agreement: z.literal('unanimous'),
      confidence: z.number(),
    }),
  ),
  majorityConsensus: z.array(
    z.object({
      issue: z.string(),
      agreement: z.literal('majority'),
      confidence: z.number(),
      dissenting: z.array(z.string()),
    }),
  ),
  disputed: z.array(
    z.object({
      issue: z.string(),
      positions: z.array(
        z.object({
          stance: z.string(),
          supporters: z.array(z.string()),
          weightedScore: z.number(),
        }),
      ),
    }),
  ),
  minorityOpinions: z.array(
    z.object({
      issue: z.string(),
      criticId: z.string(),
      confidence: z.number(),
      rationale: z.string(),
    }),
  ),
});

export type ConsensusAnalysis = z.infer<typeof ConsensusAnalysisSchema>;

interface CriticConfig {
  id: string;
  name: string;
  focus: string;
  promptTemplate: string;
}

export class MultiCriticEngine {
  private logger = getLogger();
  private keyMemory = new KeyMemorySystem();
  private critics: CriticConfig[] = [
    {
      id: 'correctness',
      name: 'Functional Correctness & Logic Critic',
      focus: 'logical consistency, edge cases, algorithm accuracy, error handling',
      promptTemplate: `You are a specialized code correctness critic. Analyze the provided thought and code artifacts for:
1. Logical errors and inconsistencies
2. Missing edge cases or boundary conditions
3. Incorrect algorithm implementations
4. Inadequate error handling
5. Violations of stated requirements

Consider the execution context and previous attempts when available.
Be specific and provide code examples where applicable.`,
    },
    {
      id: 'efficiency',
      name: 'Code Quality & Efficiency Critic',
      focus: 'performance, maintainability, best practices, resource usage',
      promptTemplate: `You are a specialized code efficiency critic. Evaluate the provided thought and code artifacts for:
1. Algorithmic complexity and optimization opportunities
2. Code reusability and maintainability
3. Adherence to language-specific best practices
4. Memory and computational efficiency
5. Code organization and readability

Identify specific inefficiencies and suggest improvements.`,
    },
    {
      id: 'security',
      name: 'Security & Robustness Critic',
      focus: 'security vulnerabilities, input validation, defensive programming',
      promptTemplate: `You are a specialized security critic. Examine the provided thought and code artifacts for:
1. Security vulnerabilities (injection, XSS, etc.)
2. Missing input validation or sanitization
3. Unsafe operations or practices
4. Potential attack vectors
5. Data exposure risks

Highlight security risks with severity ratings.`,
    },
  ];

  constructor(private readonly kg: KnowledgeGraphManager) {}

  /**
   * Performs the full multi-critic consensus review process
   */
  async performMultiCriticReview({
    actorNodeId,
    projectContext,
    project,
  }: {
    actorNodeId: string;
    projectContext: string;
    project: string;
  }): Promise<DagNode> {
    try {
      // Check circuit breaker state before starting
      try {
        const connectionManager = getConnectionManager();
        const metrics = connectionManager.getMetrics();
        if (metrics.circuitBreakerState === 'OPEN') {
          this.logger.warn('Circuit breaker is OPEN, resetting connection manager');
          await resetConnectionManager();
        }
      } catch (error) {
        // If API key is not configured, log instructional message and fail gracefully
        if (error instanceof Error && error.message.includes('API Key Configuration Required')) {
          this.logger.warn('Multi-critic system unavailable: API key not configured');
          this.logger.info(error.message);
          throw new Error('Multi-critic requires API key configuration');
        }
        // Connection manager might not be initialized yet, continue
        this.logger.debug('Could not check circuit breaker state:', error);
      }
      
      // Increment tool call counter for memory expiration
      this.keyMemory.onToolCall();
      
      // 1. Gather context
      const context = await this.gatherContext(actorNodeId);

      // 2. Parallel critic review with memory context
      const initialReviews = await this.parallelCriticReview(context);

      // 3. Cross-critic comparison
      const crossComparisons = await this.crossCriticComparison(
        context,
        initialReviews,
      );

      // 4. Build consensus
      const consensus = await this.buildConsensus(initialReviews, crossComparisons);

      // 5. Generate final critique
      const finalCritique = await this.generateFinalCritique(context, consensus);

      // 6. Store memories if requested by critics
      this.storeMemoriesIfRequested(context.actorNode, initialReviews);

      // 7. Create and store the critic node
      const criticNode = await this.createCriticNode({
        actorNodeId,
        project,
        projectContext,
        critique: finalCritique,
        consensus,
      });

      return criticNode;
    } catch (error) {
      this.logger.error({ 
        error: error instanceof Error ? { 
          name: error.name, 
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 5).join('\n')
        } : error, 
        actorNodeId,
        // Add detailed diagnostics
        connectionManagerStatus: (() => {
          try {
            const manager = getConnectionManager();
            return {
              metrics: manager.getMetrics(),
              circuitBreaker: manager.getCircuitBreakerStatus()
            };
          } catch (e) {
            return { error: e instanceof Error ? e.message : 'Unknown error getting connection manager' };
          }
        })(),
        criticConfiguration: {
          critics: this.critics.map(c => ({ id: c.id, specialization: c.specialization })),
          criticsCount: this.critics.length
        }
      }, 'Multi-critic review failed - comprehensive error analysis');
      throw error; // Let the caller handle fallback
    }
  }

  /**
   * Gathers all necessary context for the critics
   */
  private async gatherContext(
    actorNodeId: string,
  ): Promise<{
    actorNode: DagNode;
    artifactContents: Map<string, string>;
    relatedNodes: DagNode[];
    executionContext: string;
  }> {
    const actorNode = await this.kg.getNode(actorNodeId);
    if (!actorNode) {
      throw new Error(`Actor node ${actorNodeId} not found`);
    }

    // Load artifact contents (max 3k lines per file)
    const artifactContents = await this.loadArtifactContents(actorNode.artifacts || []);

    // Get related nodes for context
    const relatedNodes = await this.kg.getNeighbors(actorNodeId, 2);

    // Build execution context
    const executionContext = this.buildExecutionContext(actorNode, relatedNodes);

    return {
      actorNode,
      artifactContents,
      relatedNodes,
      executionContext,
    };
  }

  /**
   * Get the appropriate temperature for a critic based on its type
   */
  private getCriticTemperature(criticId: string): number {
    let temperature: number;
    
    try {
      // Try to get temperature from new config system
      const baseTemp = getConfig<number>('model.gemini.temperature');
      
      // Apply critic-specific adjustments
      switch (criticId) {
        case 'correctness':
          temperature = baseTemp * 0.9; // Slightly lower for correctness
          break;
        case 'efficiency':
          temperature = baseTemp * 1.1; // Slightly higher for efficiency
          break;
        case 'security':
          temperature = baseTemp * 0.9; // Slightly lower for security
          break;
        default:
          temperature = baseTemp;
      }
    } catch {
      // Fallback to legacy config if new system unavailable
      switch (criticId) {
        case 'correctness':
          temperature = CRITIC_TEMPERATURES.correctness;
          break;
        case 'efficiency':
          temperature = CRITIC_TEMPERATURES.efficiency;
          break;
        case 'security':
          temperature = CRITIC_TEMPERATURES.security;
          break;
        default:
          temperature = CRITIC_TEMPERATURES.default;
      }
    }
    
    // Validate temperature is within valid range [0, 2]
    if (temperature < 0 || temperature > 2) {
      this.logger.warn(
        { criticId, temperature },
        'Invalid temperature value, using default'
      );
      return CRITIC_TEMPERATURES.default;
    }
    
    return temperature;
  }

  /**
   * Runs all critics in parallel
   */
  private async parallelCriticReview(
    context: Awaited<ReturnType<typeof this.gatherContext>>,
  ): Promise<Map<string, CriticResponse>> {
    const reviews = new Map<string, CriticResponse>();

    // Use staggered execution to avoid rate limiting
    const staggerDelay = (() => {
      try {
        return getConfig<number>('engine.actorCritic.multiCriticStaggerDelay');
      } catch {
        return 500; // Default fallback
      }
    })();
    
    // Sequential execution with delays to prevent rate limiting
    const reviewPromises: Promise<void>[] = [];
    
    for (let index = 0; index < this.critics.length; index++) {
      const critic = this.critics[index];
      
      // Add delay between critics (except for the first one)
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, staggerDelay));
      }
      
      // Launch the critic review asynchronously
      const reviewPromise = (async () => {
        let prompt = '';
        try {
        this.logger.info({ criticId: critic.id }, 'Starting critic review');
        prompt = this.buildCriticPrompt(critic, context);
        
        // Get temperature based on critic type
        const temperature = this.getCriticTemperature(critic.id);
        this.logger.info({ 
          criticId: critic.id, 
          temperature, 
          promptLength: prompt.length 
        }, 'Critic prompt built, starting API call');
        
        const response = await retryJsonParse(async () => {
          this.logger.debug({ 
            criticId: critic.id, 
            model: 'gemini-2.5-flash-preview-05-20',
            temperature,
            maxTokens: (() => {
              try {
                return getConfig<number>('model.gemini.maxTokens');
              } catch {
                return CRITIC_MAX_TOKENS;
              }
            })()
          }, 'Calling generateObject');
          
          const rawResponse = await generateObject({
            model: 'gemini-2.5-flash-preview-05-20',
            messages: [{ role: 'user', content: prompt }],
            schema: CriticResponseSchema,
            generationConfig: {
              temperature,
              maxOutputTokens: (() => {
                try {
                  return getConfig<number>('model.gemini.maxTokens');
                } catch {
                  return CRITIC_MAX_TOKENS;
                }
              })(),
            },
            priority: RequestPriority.HIGH, // Multi-critic requests are high priority
            timeout: 120000, // 120 seconds timeout for complex multi-critic requests
            // Note: GeminiConnectionManager handles rate limiting internally
          });
          
          this.logger.info({ 
            criticId: critic.id, 
            responseLength: JSON.stringify(rawResponse).length 
          }, 'generateObject completed successfully');
          
          // Preprocess the response to ensure JSON safety
          return preprocessCriticResponse(rawResponse) as CriticResponse;
        }, {
          maxAttempts: 3,
          onRetry: (error, attempt) => {
            this.logger.warn({ 
              criticId: critic.id, 
              attempt, 
              error: error.message 
            }, 'Retrying critic review due to JSON parsing error');
          }
        });

          this.logger.info({ criticId: critic.id }, 'Critic review completed successfully');
          reviews.set(critic.id, response);
        } catch (error) {
          this.logger.error({ 
            error: error instanceof Error ? { 
              name: error.name, 
              message: error.message,
              stack: error.stack?.split('\n').slice(0, 5).join('\n')
            } : error, 
            criticId: critic.id,
            promptPreview: prompt.substring(0, 200) + '...',
            // Add additional context that might help debugging
            connectionManagerStatus: (() => {
              try {
                const manager = getConnectionManager();
                return {
                  metrics: manager.getMetrics(),
                  circuitBreaker: manager.getCircuitBreakerStatus()
                };
              } catch (e) {
                return { error: e instanceof Error ? e.message : 'Unknown error getting connection manager' };
              }
            })()
          }, 'Critic review failed - detailed error analysis');
          // Continue with other critics even if one fails
        }
      })();
      
      reviewPromises.push(reviewPromise);
    }

    await Promise.all(reviewPromises);

    if (reviews.size === 0) {
      throw new Error('All critics failed to provide reviews');
    }

    return reviews;
  }

  /**
   * Performs cross-critic comparison
   */
  private async crossCriticComparison(
    context: Awaited<ReturnType<typeof this.gatherContext>>,
    initialReviews: Map<string, CriticResponse>,
  ): Promise<Map<string, CrossCriticResponse>> {
    const comparisons = new Map<string, CrossCriticResponse>();

    const comparisonPromises = Array.from(initialReviews.entries()).map(
      async ([criticId, ownReview]) => {
        try {
          const otherReviews = Array.from(initialReviews.entries())
            .filter(([id]) => id !== criticId)
            .map(([id, review]) => ({ criticId: id, review }));

          const prompt = this.buildCrossComparisonPrompt(
            criticId,
            ownReview,
            otherReviews,
            context,
          );

          const response = await retryJsonParse(async () => {
            const rawResponse = await generateObject({
              model: 'gemini-2.5-flash-preview-05-20',
              messages: [{ role: 'user', content: prompt }],
              schema: CrossCriticResponseSchema,
              timeout: 120000, // 120 seconds timeout for cross-critic comparison
            });
            
            return preprocessCriticResponse(rawResponse) as CrossCriticResponse;
          }, {
            maxAttempts: 3,
            onRetry: (_error, attempt) => {
              this.logger.warn({ criticId, attempt }, 'Retrying cross-critic comparison due to JSON parsing error');
            }
          });

          comparisons.set(criticId, response);
        } catch (err) {
          this.logger.error({ error: err, criticId }, 'Cross-critic comparison failed');
        }
      },
    );

    await Promise.all(comparisonPromises);

    return comparisons;
  }

  /**
   * Builds consensus from critic reviews and cross-comparisons
   */
  private async buildConsensus(
    initialReviews: Map<string, CriticResponse>,
    crossComparisons: Map<string, CrossCriticResponse>,
  ): Promise<ConsensusAnalysis> {
    // Extract all unique issues from all critics
    const allIssues = new Map<string, {
      critics: Set<string>;
      confidences: Map<string, number>;
      severity: Map<string, string>;
    }>();

    // Process initial reviews
    initialReviews.forEach((review, criticId) => {
      // Check if review and critiques exist
      if (!review || !review.critiques || !Array.isArray(review.critiques)) {
        this.logger.warn({ criticId }, 'Invalid review structure, skipping');
        return;
      }
      
      review.critiques.forEach((critique) => {
        const issueKey = critique.issue;
        if (!allIssues.has(issueKey)) {
          allIssues.set(issueKey, {
            critics: new Set(),
            confidences: new Map(),
            severity: new Map(),
          });
        }
        const issue = allIssues.get(issueKey)!;
        issue.critics.add(criticId);
        issue.confidences.set(criticId, critique.confidence);
        issue.severity.set(criticId, critique.severity);
      });
    });

    // Update confidences based on cross-comparisons
    crossComparisons.forEach((comparison, criticId) => {
      // Check if comparison and revisedConfidences exist
      if (!comparison || !comparison.revisedConfidences) {
        this.logger.warn({ criticId }, 'Invalid comparison structure, skipping');
        return;
      }
      
      Object.entries(comparison.revisedConfidences).forEach(([issue, confidence]) => {
        const issueData = allIssues.get(issue);
        if (issueData) {
          issueData.confidences.set(criticId, confidence);
        }
      });
    });

    // Build consensus categories
    const strongConsensus: ConsensusAnalysis['strongConsensus'] = [];
    const majorityConsensus: ConsensusAnalysis['majorityConsensus'] = [];
    const disputed: ConsensusAnalysis['disputed'] = [];
    const minorityOpinions: ConsensusAnalysis['minorityOpinions'] = [];

    allIssues.forEach((issueData, issue) => {
      const criticsCount = issueData.critics.size;
      const totalCritics = this.critics.length;
      const avgConfidence = Array.from(issueData.confidences.values()).reduce(
        (sum, conf) => sum + conf,
        0,
      ) / criticsCount;

      if (criticsCount === totalCritics) {
        // Unanimous agreement
        strongConsensus.push({
          issue,
          agreement: 'unanimous',
          confidence: avgConfidence,
        });
      } else if (criticsCount >= Math.ceil(totalCritics * 0.66)) {
        // Majority agreement
        const dissenting = this.critics
          .filter((c) => !issueData.critics.has(c.id))
          .map((c) => c.id);
        majorityConsensus.push({
          issue,
          agreement: 'majority',
          confidence: avgConfidence,
          dissenting,
        });
      } else if (criticsCount === 1 && avgConfidence > 0.7) {
        // High-confidence minority opinion
        const criticId = Array.from(issueData.critics)[0];
        minorityOpinions.push({
          issue,
          criticId,
          confidence: avgConfidence,
          rationale: 'High-confidence issue identified by single critic',
        });
      }
    });

    return {
      strongConsensus,
      majorityConsensus,
      disputed,
      minorityOpinions,
    };
  }

  /**
   * Generates the final synthesized critique
   */
  private async generateFinalCritique(
    context: Awaited<ReturnType<typeof this.gatherContext>>,
    consensus: ConsensusAnalysis,
  ): Promise<string> {
    const prompt = `You are synthesizing the results of a multi-critic review. 
    
Original thought: ${context.actorNode.thought}

Consensus Analysis:
${JSON.stringify(consensus, null, 2)}

Generate a concise, actionable critique that:
1. Prioritizes issues by consensus strength and severity
2. Provides specific improvement suggestions
3. Acknowledges areas of disagreement when relevant
4. Maintains a constructive tone

Focus on the most important issues that will improve the code quality.`;

    const responseSchema = z.object({
      summary: z.string().describe('Executive summary of the critique'),
      prioritizedIssues: z.array(
        z.object({
          issue: z.string(),
          severity: z.string(),
          consensusLevel: z.string(),
          recommendation: z.string(),
        }),
      ),
      conclusion: z.string().describe('Overall recommendation'),
    });
    
    let response;
    try {
      response = await generateObject({
        model: 'gemini-2.5-flash-preview-05-20',
        messages: [{ role: 'user', content: prompt }],
        schema: responseSchema,
        timeout: 120000, // 120 seconds timeout for final synthesis
        generationConfig: {
          temperature: CRITIC_TEMPERATURES.default,
          maxOutputTokens: (() => {
            try {
              return getConfig<number>('model.gemini.maxTokens');
            } catch {
              return CRITIC_MAX_TOKENS;
            }
          })(),
        },
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to generate final critique');
      throw new Error('Failed to generate final critique synthesis');
    }

    if (!response || !response.summary) {
      throw new Error('Invalid response from final critique generation');
    }

    return `## Multi-Critic Consensus Review

### Summary
${response.summary}

### Prioritized Issues
${response.prioritizedIssues
  .map(
    (issue, i) => `
${i + 1}. **${issue.issue}** (${issue.severity}, ${issue.consensusLevel})
   - ${issue.recommendation}`,
  )
  .join('\n')}

### Conclusion
${response.conclusion}`;
  }

  /**
   * Creates and stores the critic node in the knowledge graph
   */
  private async createCriticNode({
    actorNodeId,
    project,
    projectContext,
    critique,
    consensus,
  }: {
    actorNodeId: string;
    project: string;
    projectContext: string;
    critique: string;
    consensus: ConsensusAnalysis;
  }): Promise<DagNode> {
    const criticNode: DagNode = {
      id: uuid(),
      project,
      projectContext,
      thought: critique,
      role: 'critic',
      parents: [actorNodeId],
      children: [],
      createdAt: new Date().toISOString(),
      tags: [Tag.Design], // Critics provide design feedback
      artifacts: [],
      metadata: {
        consensusAnalysis: consensus,
        multiCritic: true,
        criticsInvolved: this.critics.length,
      },
    };

    await this.kg.appendEntity(criticNode);

    // Update actor node to include critic as child
    const actorNode = await this.kg.getNode(actorNodeId);
    if (actorNode) {
      actorNode.children.push(criticNode.id);
      await this.kg.appendEntity(actorNode);
    }

    return criticNode;
  }

  // Helper methods

  private buildExecutionContext(actorNode: DagNode, relatedNodes: DagNode[]): string {
    const previousAttempts = relatedNodes
      .filter((n) => n.role === 'actor' && n.tags?.includes(Tag.Task))
      .map((n) => n.thought)
      .join('\n');

    return `Project: ${actorNode.project}
Current Task: ${actorNode.thought}
Tags: ${actorNode.tags?.join(', ') || 'none'}
Previous Context: ${previousAttempts || 'none'}`;
  }

  private buildCriticPrompt(
    critic: CriticConfig,
    context: Awaited<ReturnType<typeof this.gatherContext>>,
  ): string {
    // Retrieve relevant memories for this critic
    const memories = this.keyMemory.getRelevantMemories(
      critic.id,
      context.actorNode.artifacts
    );
    
    let memoryContext = '';
    if (memories.length > 0) {
      memoryContext = `\n\nRelevant memories from previous reviews:
${memories.map((m, i) => `
Memory ${i + 1} (accessed ${m.accessCount} times):
- Original thought: ${m.thought.substring(0, 200)}...
- Your previous review: ${m.criticResponse.substring(0, 200)}...
- Artifacts: ${m.artifacts?.map(a => a.path).join(', ') || 'none'}
`).join('\n')}`;
    }
    
    // Build artifact content section
    let artifactContentSection = '';
    if (context.artifactContents.size > 0) {
      artifactContentSection = '\n\nArtifact Contents:\n';
      for (const [path, content] of context.artifactContents.entries()) {
        artifactContentSection += `\n--- ${path} ---\n${content}\n--- End of ${path} ---\n`;
      }
    }
    
    return `${critic.promptTemplate}

Context:
${context.executionContext}

Thought to review:
${context.actorNode.thought}

${
  context.actorNode.artifacts && context.actorNode.artifacts.length > 0
    ? `Files affected: ${context.actorNode.artifacts.map((a) => a.path).join(', ')}`
    : ''
}${artifactContentSection}${memoryContext}

Provide a structured review focusing on ${critic.focus}.

If this review contains important insights that should be remembered for future reviews of similar code, set storeMemory to true.`;
  }

  private buildCrossComparisonPrompt(
    criticId: string,
    ownReview: CriticResponse,
    otherReviews: Array<{ criticId: string; review: CriticResponse }>,
    context: Awaited<ReturnType<typeof this.gatherContext>>,
  ): string {
    const critic = this.critics.find((c) => c.id === criticId)!;
    
    return `You are the ${critic.name}. You have reviewed a thought and provided your initial critique.

Your initial critique:
${JSON.stringify(ownReview, null, 2)}

Other critics' reviews:
${otherReviews
  .map(({ criticId, review }) => `
${criticId} critic:
${JSON.stringify(review, null, 2)}`)
  .join('\n\n')}

Original context:
${context.executionContext}

Compare your review with the other critics:
1. Identify points of agreement and disagreement
2. Revise your confidence scores based on the other perspectives
3. Provide your final stance on the key issues

For revisedConfidences, provide an object mapping each issue/topic to a numeric confidence score (0-1):
Example: {"codeQuality": 0.8, "performance": 0.95, "security": 0.7}

Focus on constructive synthesis rather than defending your position.`;
  }

  /**
   * Stores memories for critics that requested it
   */
  private storeMemoriesIfRequested(
    actorNode: DagNode,
    reviews: Map<string, CriticResponse>,
  ): void {
    for (const [criticId, review] of reviews.entries()) {
      if (review.storeMemory === true) {
        // Store the individual critic's response
        const criticResponse = `${review.overallAssessment}\n\nKey issues:\n${review.critiques
          .map(c => `- ${c.issue} (${c.severity}): ${c.suggestion}`)
          .join('\n')}`;
        
        this.keyMemory.storeMemory(criticId, actorNode, criticResponse);
        
        this.logger.info(
          `Stored memory for critic ${criticId} based on review of node ${actorNode.id}`
        );
      }
    }
  }

  /**
   * Gets memory statistics for monitoring
   */
  getMemoryStats(): Record<string, { count: number; totalAccesses: number; avgLifespan: number }> {
    return this.keyMemory.getStats();
  }

  /**
   * Resets the connection manager and circuit breaker state
   * Useful for testing and recovering from persistent failures
   */
  async resetCircuitBreaker(): Promise<void> {
    this.logger.info('Resetting Gemini connection manager and circuit breaker');
    await resetConnectionManager();
  }

  /**
   * Loads the contents of artifacts, limited to 3000 lines per file
   */
  private async loadArtifactContents(
    artifacts: Array<{ name: string; path: string; content?: string }>,
  ): Promise<Map<string, string>> {
    const contents = new Map<string, string>();
    
    for (const artifact of artifacts) {
      try {
        let fileContent: string;
        
        if (artifact.content) {
          // If content is already provided in the artifact, use it directly
          fileContent = artifact.content;
        } else {
          // Try to read the file from the filesystem
          try {
            // Resolve the path relative to the project root
            const fullPath = resolve(artifact.path);
            fileContent = await readFile(fullPath, 'utf-8');
          } catch (fsError: unknown) {
            // Enhanced error handling with specific error types
            let errorMessage: string;
            
            // Type guard to check if error has NodeJS.ErrnoException properties
            const isNodeError = (err: unknown): err is NodeJS.ErrnoException => {
              return err instanceof Error && 'code' in err;
            };
            
            if (isNodeError(fsError)) {
              if (fsError.code === 'ENOENT') {
                errorMessage = `[File not found: ${artifact.path}]`;
                this.logger.warn({ 
                  path: artifact.path, 
                  fullPath: resolve(artifact.path),
                  errorCode: fsError.code 
                }, 'Artifact file does not exist');
              } else if (fsError.code === 'EACCES') {
                errorMessage = `[Permission denied: ${artifact.path}]`;
                this.logger.error({ 
                  path: artifact.path, 
                  fullPath: resolve(artifact.path),
                  errorCode: fsError.code 
                }, 'Permission denied when reading artifact file');
              } else if (fsError.code === 'EISDIR') {
                errorMessage = `[Path is a directory: ${artifact.path}]`;
                this.logger.warn({ 
                  path: artifact.path, 
                  fullPath: resolve(artifact.path),
                  errorCode: fsError.code 
                }, 'Artifact path points to a directory, not a file');
              } else if (fsError.code === 'EMFILE' || fsError.code === 'ENFILE') {
                errorMessage = `[Too many open files, retry later: ${artifact.path}]`;
                this.logger.error({ 
                  path: artifact.path, 
                  fullPath: resolve(artifact.path),
                  errorCode: fsError.code 
                }, 'File descriptor limit reached when reading artifact');
              } else if (fsError.code === 'ENOTDIR') {
                errorMessage = `[Invalid path (not a directory in path): ${artifact.path}]`;
                this.logger.warn({ 
                  path: artifact.path, 
                  fullPath: resolve(artifact.path),
                  errorCode: fsError.code 
                }, 'Invalid path structure for artifact file');
              } else {
                // Generic filesystem error with code
                errorMessage = `[Filesystem error (${fsError.code || 'unknown'}): ${artifact.path}]`;
                this.logger.error({ 
                  path: artifact.path, 
                  fullPath: resolve(artifact.path),
                  errorCode: fsError.code,
                  errorMessage: fsError.message,
                  errorName: fsError.name
                }, 'Unexpected filesystem error when reading artifact');
              }
            } else {
              // Non-Node.js error
              const errorMsg = fsError instanceof Error ? fsError.message : String(fsError);
              errorMessage = `[Unknown error: ${artifact.path}]`;
              this.logger.error({ 
                path: artifact.path, 
                fullPath: resolve(artifact.path),
                error: errorMsg
              }, 'Non-filesystem error when reading artifact');
            }
            
            contents.set(artifact.path, errorMessage);
            continue;
          }
        }
        
        // Validate that fileContent is a string
        if (typeof fileContent !== 'string') {
          this.logger.error({ 
            path: artifact.path, 
            contentType: typeof fileContent 
          }, 'Artifact content is not a string');
          contents.set(artifact.path, `[Invalid content type for: ${artifact.path}]`);
          continue;
        }
        
        // Split into lines and truncate if necessary
        const lines = fileContent.split('\n');
        if (lines.length > 3000) {
          const truncatedContent = lines.slice(0, 3000).join('\n');
          contents.set(artifact.path, truncatedContent + '\n\n... (truncated after 3000 lines)');
          this.logger.info({ 
            path: artifact.path, 
            totalLines: lines.length,
            truncatedLines: 3000 
          }, 'Truncated large file for critic review');
        } else {
          contents.set(artifact.path, fileContent);
          this.logger.debug({ 
            path: artifact.path, 
            lines: lines.length,
            sizeBytes: fileContent.length 
          }, 'Successfully loaded artifact content');
        }
      } catch (error: unknown) {
        // Catch-all for any unexpected errors during processing
        const errorInfo = error instanceof Error 
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack?.split('\n').slice(0, 3).join('\n') || 'No stack trace'
            }
          : {
              name: 'Unknown',
              message: String(error),
              stack: 'No stack trace'
            };
            
        this.logger.error({ 
          path: artifact.path, 
          error: errorInfo
        }, 'Unexpected error during artifact content processing');
        contents.set(artifact.path, `[Processing error: ${artifact.path}]`);
      }
    }

    return contents;
  }
}