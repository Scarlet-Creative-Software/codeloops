/**
 * Test for multi-critic rate limiting behavior
 */

import { MultiCriticEngine } from '../../src/engine/MultiCriticEngine.js';
import { KnowledgeGraphManager } from '../../src/engine/KnowledgeGraph.js';
import { Tag } from '../../src/engine/tags.js';
import { createLogger } from '../../src/logger.js';
import { getConfig } from '../../src/config/index.js';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables
dotenvConfig();

const logger = createLogger({ withDevStdout: true });

async function testMultiCriticRateLimiting() {
  // Check API key
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    throw new Error('GOOGLE_GENAI_API_KEY environment variable is required');
  }
  const testDir = path.join(os.tmpdir(), `multi-critic-rate-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
  
  const kgPath = path.join(testDir, 'knowledge_graph.ndjson');
  const kg = new KnowledgeGraphManager(kgPath);
  const engine = new MultiCriticEngine(kg, logger);
  
  // Create test actor node
  const actorNode = await kg.addNode({
    text: `Implementing a rate-limited API client:

1. Use exponential backoff for retries
2. Implement request queuing with priority levels
3. Add circuit breaker pattern for fault tolerance
4. Monitor and log API usage metrics

This implementation will ensure robust API interactions while respecting rate limits.`,
    tags: [Tag.Task, Tag.Design],
    projectContext: {
      repo: 'test-repo',
      currentBranch: 'main',
    },
    artifacts: [
      {
        name: 'api-client.ts',
        content: `import { Queue } from './queue';

export class RateLimitedAPIClient {
  private queue: Queue<Request>;
  private circuitBreaker: CircuitBreaker;
  
  constructor(private apiKey: string) {
    this.queue = new PriorityQueue();
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
    });
  }
  
  async request(endpoint: string, options: RequestOptions) {
    return this.circuitBreaker.execute(async () => {
      return await this.queue.enqueue({
        endpoint,
        options,
        priority: options.priority || Priority.NORMAL,
      });
    });
  }
}`,
      },
    ],
  });
  
  logger.info('Starting multi-critic review with rate limiting...');
  const startTime = Date.now();
  
  try {
    const { response, metrics } = await engine.performMultiCriticReview(actorNode.id, 'test-project');
    
    const duration = Date.now() - startTime;
    
    logger.info({
      duration,
      criticCount: response.type === 'multi' ? 3 : 1,
      staggerDelay: getConfig<number>('engine.actorCritic.multiCriticStaggerDelay'),
      metrics,
    }, 'Multi-critic review completed');
    
    // Check if staggering is working
    if (response.type === 'multi') {
      const expectedMinDuration = getConfig<number>('engine.actorCritic.multiCriticStaggerDelay') * 2; // 2 delays for 3 critics
      logger.info({
        actualDuration: duration,
        expectedMinDuration,
        staggeringWorking: duration >= expectedMinDuration,
      }, 'Rate limiting validation');
    }
    
    // Display results
    console.log('\n=== Multi-Critic Review Results ===');
    console.log(`Type: ${response.type}`);
    console.log(`Duration: ${duration}ms`);
    
    if (response.type === 'multi') {
      console.log(`\nConsensus Analysis:`);
      console.log(`- Strong consensus: ${response.consensus.strongConsensus.length} issues`);
      console.log(`- Majority consensus: ${response.consensus.majorityConsensus.length} issues`);
      console.log(`- Disputed: ${response.consensus.disputed.length} issues`);
      
      if (response.consensus.strongConsensus.length > 0) {
        console.log('\nTop unanimous issues:');
        response.consensus.strongConsensus.slice(0, 3).forEach(issue => {
          console.log(`  - ${issue.issue} (confidence: ${issue.confidence.toFixed(2)})`);
        });
      }
    } else {
      console.log(`\nSingle critic review - ${response.critiques.length} issues found`);
    }
    
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error 
    }, 'Multi-critic review failed');
    throw error;
  } finally {
    // Cleanup
    await fs.rm(testDir, { recursive: true, force: true });
  }
}

// Run the test
testMultiCriticRateLimiting()
  .then(() => {
    logger.info('Rate limiting test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error }, 'Rate limiting test failed');
    process.exit(1);
  });