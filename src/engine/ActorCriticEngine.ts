import { Critic } from '../agents/Critic.ts';
import { Actor } from '../agents/Actor.ts';
import { KnowledgeGraphManager, type DagNode, FILE_REF } from './KnowledgeGraph.ts';
import { SummarizationAgent } from '../agents/Summarize.ts';
import { MultiCriticEngine } from './MultiCriticEngine.ts';
import { z } from 'zod';
import { TagEnum } from './tags.ts';
import { getInstance as getLogger } from '../logger.ts';
// -----------------------------------------------------------------------------
// Actor–Critic engine ----------------------------------------------------------
// -----------------------------------------------------------------------------

const THOUGHT_DESCRIPTION = `
Add a new thought node to the knowledge‑graph.

• Use for any creative / planning step, requirement capture, task break‑down, etc.
• **Always include at least one 'tag'** so future searches can find this node
  – e.g. requirement, task, design, risk, task-complete, summary.
• **If your thought references a file you just created or modified**, list it in
  the 'artifacts' array so the graph stores a durable link.
• Think of 'tags' + 'artifacts' as the breadcrumbs that future you (or another
  agent) will follow to avoid duplicate work or forgotten decisions.
`.trim();

export const ActorThinkSchema = {
  thought: z.string().describe(THOUGHT_DESCRIPTION),

  projectContext: z
    .string()
    .describe(
      'Full path to the currently open directory in the code editor. Used to infer the project name from the last item in the path.',
    ),

  tags: z
    .array(TagEnum)
    .min(
      1,
      'Add at least one semantic tag – requirement, task, design, risk, task-complete, summary',
    )
    .describe('Semantic categories used for later search and deduping.'),

  /** Optional git-style diff summarizing code changes. */
  diff: z.string().optional(),

  /** Optional parent node IDs this thought builds upon. */
  parents: z.array(z.string()).optional(),

  /** Actual files produced or updated by this step.*/
  artifacts: z
    .array(FILE_REF)
    .describe(
      'Declare the file set this thought will affect so the critic can ' +
        'verify coverage before code is written.' +
        'graph has durable pointers to the exact revision.',
    ),

  /** Optional flag to control enhanced multi-critic consensus review */
  feedback: z
    .boolean()
    .optional()
    .describe(
      'Controls whether to use the comprehensive 3-critic consensus review with specialized analysis. ' +
        'Defaults to true (enabled) but can be set to false to use single-critic review. ' +
        'The default can be changed via CODELOOPS_MULTI_CRITIC_DEFAULT environment variable.',
    ),
};

export const ActorThinkSchemaZodObject = z.object(ActorThinkSchema);
export type ActorThinkInput = z.infer<typeof ActorThinkSchemaZodObject>;

export class ActorCriticEngine {
  public readonly multiCriticEngine: MultiCriticEngine;

  constructor(
    private readonly kg: KnowledgeGraphManager,
    private readonly critic: Critic,
    private readonly actor: Actor,
    private readonly summarizationAgent: SummarizationAgent,
  ) {
    this.multiCriticEngine = new MultiCriticEngine(kg);
  }

  // Use the centralized extractProjectName function from utils
  /* --------------------------- public API --------------------------- */
  /**
   * Adds a new thought node to the knowledge graph and automatically triggers
   * critic review
   *
   * @param input The actor thought input
   * @returns Either the actor node (if no review was triggered) or the critic node (if review was triggered)
   */
  async actorThink(input: ActorThinkInput & { project: string }): Promise<DagNode> {
    // Actor.think will handle project switching based on projectContext
    const { node } = await this.actor.think(input);

    // Check if enhanced multi-critic feedback is requested
    // Use environment variable default when feedback is undefined
    const shouldUseMultiCritic = input.feedback ?? (process.env.CODELOOPS_MULTI_CRITIC_DEFAULT === 'true');
    
    if (shouldUseMultiCritic) {
      try {
        const criticNode = await this.multiCriticEngine.performMultiCriticReview({
          actorNodeId: node.id,
          projectContext: input.projectContext,
          project: input.project,
        });
        return criticNode;
      } catch (error) {
        // Enhanced logging for multi-critic failures
        const logger = getLogger();
        logger.error({
          error: error instanceof Error ? {
            name: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 5).join('\n')
          } : error,
          actorNodeId: node.id,
          project: input.project,
          feedback: input.feedback
        }, 'Multi-critic review failed, falling back to single critic');
        
        // Fall back to enhanced single critic with metadata about the failure
        const criticNode = await this.criticReview({
          actorNodeId: node.id,
          projectContext: input.projectContext,
          project: input.project,
        });
        
        // Add metadata to indicate this was a fallback from multi-critic
        if (criticNode.metadata) {
          criticNode.metadata.multiCriticFallback = true;
          criticNode.metadata.fallbackReason = error instanceof Error ? error.message : String(error);
        } else {
          criticNode.metadata = {
            multiCriticFallback: true,
            fallbackReason: error instanceof Error ? error.message : String(error)
          };
        }
        
        return criticNode;
      }
    }

    // Default single critic review
    const criticNode = await this.criticReview({
      actorNodeId: node.id,
      projectContext: input.projectContext,
      project: input.project,
    });

    return criticNode;
  }

  /**
   * Manually triggers a critic review for a specific actor node.
   *
   * NOTE: In most cases, you don't need to call this directly as actorThink
   * automatically triggers critic reviews when appropriate.
   *
   * This method is primarily useful for:
   * - Manual intervention in the workflow
   * - Forcing a review of a specific previous node
   * - Debugging or testing purposes
   *
   * @param actorNodeId The ID of the actor node to review
   * @param projectContext The project context for the review
   * @returns The critic node
   */
  async criticReview({
    actorNodeId,
    projectContext,
    project,
  }: {
    actorNodeId: string;
    projectContext: string;
    project: string;
  }): Promise<DagNode> {
    const criticNode = await this.critic.review({ actorNodeId, projectContext, project });

    // Temporarily disable automatic summarization to prevent performance issues
    // TODO: Re-enable once the core exponential growth issue is resolved
    // await this.summarizationAgent.checkAndTriggerSummarization({
    //   project,
    //   projectContext,
    // });

    return criticNode;
  }
}
