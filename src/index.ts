import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ActorCriticEngine, ActorThinkSchema } from './engine/ActorCriticEngine.ts';
import { KnowledgeGraphManager } from './engine/KnowledgeGraph.ts';
import { Critic } from './agents/Critic.ts';
import { Actor } from './agents/Actor.ts';
import { SummarizationAgent } from './agents/Summarize.ts';
import { TagEnum } from './engine/tags.ts';
import pkg from '../package.json' with { type: 'json' };
import { CodeLoopsLogger, getInstance as getLogger, setGlobalLogger } from './logger.ts';
import { extractProjectName } from './utils/project.ts';
import { ConfigurationManager } from './config/ConfigurationManager.ts';

// Helper function to safely stringify large objects
function safeStringify(obj: unknown, maxLength = 10000): string {
  const jsonString = JSON.stringify(obj, null, 2);
  if (jsonString.length <= maxLength) {
    return jsonString;
  }
  
  // If too large, return a truncated version with summary
  const truncated = jsonString.slice(0, maxLength);
  const nodeCount = Array.isArray(obj) ? obj.length : (obj ? 1 : 0);
  return truncated + `\n... [TRUNCATED - Total length: ${jsonString.length} chars, Nodes: ${nodeCount}]`;
}

// -----------------------------------------------------------------------------
// MCP Server -------------------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Utilities for main entry point
 */

const runOnceOnProjectLoad = ({ logger }: { logger: CodeLoopsLogger }) => {
  return (project: string) => {
    const child = logger.child({ project });
    setGlobalLogger(child);
  };
};

const loadProjectOrThrow = async ({
  logger,
  args,
  onProjectLoad,
}: {
  logger: CodeLoopsLogger;
  args: { projectContext: string };
  onProjectLoad: (project: string) => void;
}) => {
  const projectName = extractProjectName(args.projectContext);
  if (!projectName) {
    logger.error({ projectContext: args.projectContext }, 'Invalid projectContext');
    throw new Error(`Invalid projectContext: ${args.projectContext}`);
  }
  onProjectLoad(projectName);
  return projectName;
};

/**
 * Main entry point for the CodeLoops MCP server.
 */
async function main() {
  // Initialize logger
  const logger = getLogger();
  const runOnce = runOnceOnProjectLoad({ logger });
  logger.info('Starting CodeLoops MCP server...');

  // Load configuration
  const configManager = new ConfigurationManager();
  const config = configManager.getAll();
  
  logger.info('Configuration loaded', {
    semanticCacheEnabled: config.performance.semanticCache.enabled,
    cacheStrategy: config.performance.cache.strategy,
    logLevel: config.system.logLevel
  });

  // Create KnowledgeGraphManager with semantic cache configuration
  const kg = new KnowledgeGraphManager(logger, config.performance.semanticCache);
  await kg.init();

  // Create SummarizationAgent with KnowledgeGraphManager
  const summarizationAgent = new SummarizationAgent(kg);

  // Create other dependencies
  const critic = new Critic(kg);
  const actor = new Actor(kg);

  // Create ActorCriticEngine with all dependencies
  const engine = new ActorCriticEngine(kg, critic, actor, summarizationAgent);

  const server = new McpServer({ name: 'codeloops', version: pkg.version });

  const ACTOR_THINK_DESCRIPTION = `
  Add a new thought node to the CodeLoops knowledge graph to plan, execute, or document coding tasks.
  
  **Purpose**: This is the **primary tool** for interacting with the actor-critic system. It records your work, triggers critic reviews when needed, and guides you through iterative development. **You must call 'actor_think' iteratively** after every significant action to ensure your work is reviewed and refined.
  
  **Instructions**:
  1. **Call 'actor_think' for all actions**:
     - Planning, requirement capture, task breakdown, or coding steps.
     - Use the 'projectContext' property to specify the full path to the currently open directory.
  2. **Always include at least one semantic tag** (e.g., 'requirement', 'task', 'design', 'risk', 'task-complete', 'summary') to enable searchability and trigger appropriate reviews.
  3. **Iterative Workflow**:
     - File modifications or task completions automatically trigger critic reviews.
     - Use the critic's feedback (in 'criticNode') to refine your next thought.
  4. **Tags and artifacts are critical for tracking decisions and avoiding duplicate work**.
  
  **Example Workflow**:
  - Step 1: Call 'actor_think' with thought: "Create main.ts with initial setup", projectContext: "/path/to/project", artifacts: ['src/main.ts'], tags: ['task'].
      - Response: Includes feedback from the critic
  - Step 2:  Make any necessary changes and call 'actor_think' again with the updated thought.
  - Repeat until the all work is completed.
  
  **Note**: Do not call 'critic_review' directly unless debugging; 'actor_think' manages reviews automatically.
  `;

  /**
   * actor_think - Add a new thought node to the knowledge graph.
   *
   * This is the primary tool for interacting with the actor-critic system.
   * It automatically triggers critic reviews when appropriate, so you don't
   * need to call critic_review separately in most cases.
   *
   * The response will include:
   * - The actor node if no critic review was triggered
   * - The critic node if a review was automatically triggered
   */
  server.tool('actor_think', ACTOR_THINK_DESCRIPTION, ActorThinkSchema, async (args) => {
    const projectName = await loadProjectOrThrow({ logger, args, onProjectLoad: runOnce });
    
    // Use configured default for feedback if not explicitly provided
    const feedback = args.feedback ?? config.engine.actorCritic.multiCriticDefault;
    
    const node = await engine.actorThink({
      ...args,
      feedback,
      project: projectName,
    });
    return {
      content: [
        {
          type: 'text',
          text: safeStringify(node),
        },
      ],
    };
  });

  // -----------------------------------------------------------------------------
  // Tool definitions ---------------------------------------------------------------------
  // -----------------------------------------------------------------------------

  /**
   * critic_review – manually evaluates an actor node.
   *
   */
  server.tool(
    'critic_review',
    'Call this tool when you want explicit feedback on your thought, idea or final implementation of a task.',
    {
      actorNodeId: z.string().describe('ID of the actor node to critique.'),
      projectContext: z.string().describe('Full path to the project directory.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      return {
        content: [
          {
            type: 'text',
            text: safeStringify(
              await engine.criticReview({
                actorNodeId: a.actorNodeId,
                projectContext: a.projectContext,
                project: projectName,
              }),
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'get_node',
    'Get a specific node by ID',
    {
      id: z.string().describe('ID of the node to retrieve.'),
    },
    async (a) => {
      const node = await kg.getNode(a.id);
      return {
        content: [
          {
            type: 'text',
            text: safeStringify(node),
          },
        ],
      };
    },
  );

  server.tool(
    'get_neighbors',
    'Get a node along with its parents and children up to the requested depth',
    {
      id: z.string().describe('ID of the node to retrieve neighbors for.'),
      projectContext: z.string().describe('Full path to the project directory.'),
      depth: z
        .number()
        .optional()
        .describe('How many levels of neighbors to include. Defaults to 1.'),
    },
    async (a) => {
      await loadProjectOrThrow({
        logger,
        args: { projectContext: a.projectContext },
        onProjectLoad: runOnce,
      });
      const nodes = await kg.getNeighbors(a.id, a.depth);
      return {
        content: [
          {
            type: 'text',
            text: safeStringify(nodes),
          },
        ],
      };
    },
  );

  server.tool(
    'resume',
    'Pick up where you left off by fetching the most recent nodes from the knowledge graph for this project. Use limit to control the number of nodes returned. Increase it if you need more context.',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
      limit: z
        .number()
        .optional()
        .describe('Limit the number of nodes returned. Increase it if you need more context.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      const text = await kg.resume({
        project: projectName,
        limit: a.limit,
      });
      return {
        content: [{ type: 'text', text: safeStringify(text) }],
      };
    },
  );

  /** export – dump the current graph */
  server.tool(
    'export',
    'dump the current knowledge graph, with optional limit',
    {
      limit: z.number().optional().describe('Limit the number of nodes returned.'),
      projectContext: z.string().describe('Full path to the project directory.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      const nodes = await kg.export({ project: projectName, limit: a.limit });
      return {
        content: [
          {
            type: 'text',
            text: safeStringify(nodes),
          },
        ],
      };
    },
  );

  server.tool(
    'search_nodes',
    'Search nodes by tags and/or text query',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
      tags: z.array(TagEnum).optional().describe('Tags to match.'),
      query: z.string().optional().describe('Substring to search for in thoughts.'),
      limit: z.number().optional().describe('Limit the number of nodes returned.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      const nodes = await kg.search({
        project: projectName,
        tags: a.tags,
        query: a.query,
        limit: a.limit,
      });
      return {
        content: [
          {
            type: 'text',
            text: safeStringify(nodes),
          },
        ],
      };
    },
  );

  server.tool(
    'artifact_history',
    'Retrieve history for a specific artifact path',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
      path: z.string().describe('Artifact path to look up.'),
      limit: z.number().optional().describe('Limit the number of nodes returned.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      const nodes = await kg.getArtifactHistory(projectName, a.path, a.limit);
      return {
        content: [{ type: 'text', text: safeStringify(nodes) }],
      };
    },
  );

  server.tool(
    'list_open_tasks',
    'List actor nodes tagged "task" that have not been marked as "task-complete"',
    {
      projectContext: z.string().describe('Full path to the project directory.'),
    },
    async (a) => {
      const projectName = await loadProjectOrThrow({ logger, args: a, onProjectLoad: runOnce });
      const nodes = await kg.listOpenTasks(projectName);
      return {
        content: [{ type: 'text', text: safeStringify(nodes) }],
      };
    },
  );

  /** list_projects – list all available knowledge graph projects */
  server.tool(
    'list_projects',
    {
      projectContext: z
        .string()
        .optional()
        .describe(
          'Optional full path to the project directory. If provided, the project name will be extracted and highlighted as current.',
        ),
    },
    async (a) => {
      let activeProject: string | null = null;
      if (a.projectContext) {
        const projectName = extractProjectName(a.projectContext);
        if (!projectName) {
          throw new Error('Invalid projectContext');
        }
        activeProject = projectName;
      }
      const projects = await kg.listProjects();

      logger.info(
        `[list_projects] Current project: ${activeProject}, Available projects: ${projects.join(', ')}`,
      );

      return {
        content: [
          {
            type: 'text',
            text: safeStringify(
              {
                activeProject,
                projects,
              },
            ),
          },
        ],
      };
    },
  );

  /** get_cache_stats – Get comprehensive cache statistics and performance metrics */
  server.tool(
    'get_cache_stats',
    'Get detailed statistics about semantic cache performance, hit rates, and system health',
    {},
    async () => {
      const indexStats = kg.getIndexStats();
      const semanticCacheStats = kg.getSemanticCacheStats();
      
      const stats = {
        timestamp: new Date().toISOString(),
        indexSystem: indexStats,
        semanticCache: semanticCacheStats,
        configuration: {
          semanticCacheEnabled: config.performance.semanticCache.enabled,
          similarityThreshold: config.performance.semanticCache.similarityThreshold,
          confidenceThreshold: config.performance.semanticCache.confidenceThreshold,
          cacheSize: config.performance.semanticCache.cacheSize,
          ttl: config.performance.semanticCache.ttl
        }
      };

      logger.info('[get_cache_stats] Cache statistics requested', {
        semanticCacheEnabled: semanticCacheStats.enabled,
        hitRates: 'hitRates' in semanticCacheStats ? semanticCacheStats.hitRates : undefined
      });

      return {
        content: [
          {
            type: 'text',
            text: safeStringify(stats),
          },
        ],
      };
    },
  );

  /** cleanup_caches – Manually trigger cache cleanup and optimization */
  server.tool(
    'cleanup_caches',
    'Manually trigger cleanup of expired cache entries and optimize cache performance',
    {},
    async () => {
      logger.info('[cleanup_caches] Manual cache cleanup initiated');
      
      try {
        await kg.cleanup();
        
        const postCleanupStats = {
          timestamp: new Date().toISOString(),
          message: 'Cache cleanup completed successfully',
          semanticCache: kg.getSemanticCacheStats()
        };

        return {
          content: [
            {
              type: 'text',
              text: safeStringify(postCleanupStats),
            },
          ],
        };
      } catch (error) {
        logger.error('[cleanup_caches] Cleanup failed', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        
        return {
          content: [
            {
              type: 'text',
              text: safeStringify({
                timestamp: new Date().toISOString(),
                error: 'Cache cleanup failed',
                details: error instanceof Error ? error.message : String(error)
              }),
            },
          ],
        };
      }
    },
  );

  /** check_multi_critic_health – Diagnostic tool to check multi-critic system status */
  server.tool(
    'check_multi_critic_health',
    'Check the health and configuration of the multi-critic consensus system. Set reset=true to attempt recovery from circuit breaker OPEN state.',
    {
      reset: z.boolean().optional().describe('Set to true to reset the circuit breaker from OPEN state'),
    },
    async (args) => {
      logger.info('[check_multi_critic_health] Checking multi-critic system health', { 
        resetRequested: args.reset || false 
      });
      
      try {
        // Get memory stats from multi-critic engine
        const memoryStats = engine.multiCriticEngine?.getMemoryStats();
        
        // Check circuit breaker status and handle reset if requested
        let circuitBreakerStatus = 'unknown';
        let circuitBreakerDetails = null;
        let resetResult = null;
        
        try {
          const connectionManager = await import('../src/utils/GeminiConnectionManager.ts');
          const manager = connectionManager.getConnectionManager();
          const metrics = manager.getMetrics();
          circuitBreakerStatus = metrics.circuitBreakerState;
          circuitBreakerDetails = manager.getCircuitBreakerStatus();
          
          // Perform reset if requested and circuit breaker is OPEN
          if (args.reset && circuitBreakerStatus === 'OPEN') {
            resetResult = connectionManager.resetCircuitBreaker();
            if (resetResult.success) {
              // Update status after reset
              const updatedMetrics = manager.getMetrics();
              circuitBreakerStatus = updatedMetrics.circuitBreakerState;
              circuitBreakerDetails = manager.getCircuitBreakerStatus();
            }
          }
        } catch (error) {
          circuitBreakerStatus = 'not available';
          logger.warn('[check_multi_critic_health] Could not access circuit breaker', { 
            error: error instanceof Error ? error.message : String(error) 
          });
        }

        const healthCheck = {
          timestamp: new Date().toISOString(),
          status: 'healthy',
          configuration: {
            multiCriticEnabled: config.engine.actorCritic.enableMultiCritic,
            multiCriticDefault: config.engine.actorCritic.multiCriticDefault,
            criticTimeout: config.engine.actorCritic.criticTimeout,
            staggerDelay: config.engine.actorCritic.multiCriticStaggerDelay,
          },
          systemHealth: {
            circuitBreakerStatus,
            circuitBreakerDetails,
            keyMemoryStats: memoryStats,
            apiKeyConfigured: !!(process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY),
          },
          circuitBreakerReset: resetResult,
          recommendations: [] as string[],
        };

        // Add recommendations based on health check
        if (!healthCheck.systemHealth.apiKeyConfigured) {
          healthCheck.status = 'warning';
          healthCheck.recommendations.push('API key not configured - multi-critic system will fail');
        }
        
        if (circuitBreakerStatus === 'OPEN') {
          if (resetResult?.success) {
            healthCheck.status = 'recovered';
            healthCheck.recommendations.push('Circuit breaker was OPEN but has been successfully reset');
          } else {
            healthCheck.status = 'degraded';
            healthCheck.recommendations.push('Circuit breaker is OPEN - use reset=true to attempt recovery');
          }
        } else if (resetResult && !resetResult.success) {
          healthCheck.status = 'warning';
          healthCheck.recommendations.push(`Circuit breaker reset failed: ${resetResult.message}`);
        }

        if (!config.engine.actorCritic.enableMultiCritic) {
          healthCheck.status = 'disabled';
          healthCheck.recommendations.push('Multi-critic is disabled in configuration');
        }
        
        // Add usage instructions for reset functionality
        if (circuitBreakerStatus === 'OPEN' && !args.reset) {
          healthCheck.recommendations.push('To reset the circuit breaker, call: check_multi_critic_health({"reset": true})');
        }

        return {
          content: [
            {
              type: 'text',
              text: safeStringify(healthCheck),
            },
          ],
        };
      } catch (error) {
        logger.error('[check_multi_critic_health] Health check failed', { 
          error: error instanceof Error ? error.message : String(error) 
        });
        
        return {
          content: [
            {
              type: 'text',
              text: safeStringify({
                timestamp: new Date().toISOString(),
                status: 'error',
                error: 'Health check failed',
                details: error instanceof Error ? error.message : String(error)
              }),
            },
          ],
        };
      }
    },
  );

  // ------------------------------------------------------------------
  // Transport: stdio JSON‑over‑MCP -----------------------------------
  // ------------------------------------------------------------------
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('CodeLoops MCP server running on stdio');
}

main().catch((err) => {
  const logger = getLogger();
  logger.error({ err }, 'Fatal error in main');
  process.exit(1);
});
