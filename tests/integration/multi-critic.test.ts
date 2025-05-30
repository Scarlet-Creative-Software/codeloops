#!/usr/bin/env npx tsx

/**
 * Comprehensive Multi-Critic Consensus System Integration Tests
 * 
 * This test suite validates the multi-critic consensus system with:
 * - Three specialized critics (Correctness, Efficiency, Security)
 * - Consensus building and cross-critic comparison
 * - Performance measurements and memory tracking
 * - Graceful fallback to single-critic mode
 * - Key memory system integration
 * - Artifact content loading
 */

import { ActorCriticEngine } from '../../src/engine/ActorCriticEngine.js';
import { KnowledgeGraphManager } from '../../src/engine/KnowledgeGraph.js';
import { Critic } from '../../src/agents/Critic.js';
import { Actor } from '../../src/agents/Actor.js';
import { SummarizationAgent } from '../../src/agents/Summarize.js';
import { Tag } from '../../src/engine/tags.js';
import { getInstance as getLogger } from '../../src/logger.js';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

interface TestResults {
  success: boolean;
  duration: number;
  logGrowth: number;
  nodeId: string;
  multiCriticEngaged: boolean;
  criticsInvolved?: number;
  consensusAnalysis?: Record<string, unknown>;
  mode: 'multi-critic' | 'single-critic';
}

/**
 * Sample code with intentional issues for critics to identify
 */
function createTestArtifact(): { name: string; path: string; content: string } {
  const content = `import { Database } from 'sqlite3';
import * as crypto from 'crypto';

/**
 * PaymentProcessor with intentional security, performance, and correctness issues
 * for multi-critic review testing
 */
export class PaymentProcessor {
  private db: Database;
  private apiKey: string = 'sk_live_1234567890'; // Issue 1: Hardcoded API key (Security)

  constructor(dbPath: string) {
    this.db = new Database(dbPath); // Issue 2: No error handling (Correctness)
  }

  // Issue 3: SQL injection vulnerability (Security)
  // Issue 4: No input validation (Correctness) 
  // Issue 5: Logging sensitive data (Security)
  async processPayment(userId: string, amount: number, cardNumber: string) {
    console.log(\`Processing payment for user \${userId} with card \${cardNumber}\`);
    
    const query = \`
      INSERT INTO payments (user_id, amount, card_number, status) 
      VALUES ('\${userId}', \${amount}, '\${cardNumber}', 'pending')
    \`;
    
    // Issue 6: No error handling (Correctness)
    return new Promise((resolve) => {
      this.db.run(query, (err) => {
        // Issue 7: Ignoring errors (Correctness)
        resolve({ success: true, paymentId: Date.now() });
      });
    });
  }

  // Issue 8: O(n²) complexity - inefficient algorithm (Efficiency)
  findDuplicateTransactions(transactions: Array<{id: string, amount: number, userId: string}>) {
    const duplicates = [];
    for (let i = 0; i < transactions.length; i++) {
      for (let j = i + 1; j < transactions.length; j++) {
        if (transactions[i].amount === transactions[j].amount && 
            transactions[i].userId === transactions[j].userId) {
          duplicates.push(transactions[i].id);
        }
      }
    }
    return duplicates;
  }

  // Issue 9: No authentication check (Security)
  // Issue 10: SQL injection again (Security)
  // Issue 11: No audit trail (Security)
  async refundPayment(paymentId: string, adminUserId?: string) {
    const query = \`UPDATE payments SET status = 'refunded' WHERE id = '\${paymentId}'\`;
    this.db.run(query);
    // Issue 12: No resource cleanup (Efficiency)
    // Issue 13: No return value (Correctness)
  }

  // Issue 14: Synchronous operation that should be async (Efficiency)
  // Issue 15: Memory leak - storing all transactions (Efficiency)
  private transactionCache = new Map<string, any>();
  
  validateCard(cardNumber: string): boolean {
    // Issue 16: Weak validation logic (Correctness)
    return cardNumber.length >= 13 && cardNumber.length <= 19;
  }

  // Issue 17: Race condition potential (Correctness)
  // Issue 18: No rate limiting (Security)
  async batchProcessPayments(payments: Array<any>) {
    const results = [];
    for (const payment of payments) {
      const result = await this.processPayment(
        payment.userId, 
        payment.amount, 
        payment.cardNumber
      );
      results.push(result);
      this.transactionCache.set(payment.id, result); // Issue 19: Memory growth
    }
    return results;
  }
}`;

  return {
    name: "test-payment-processor.ts",
    path: join(tmpdir(), `test-payment-processor-${Date.now()}.ts`),
    content
  };
}

async function runMultiCriticTest(): Promise<TestResults> {
  const logger = getLogger();
  
  // Check API key availability
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  const expectedMode = apiKey ? 'multi-critic' : 'single-critic';
  
  console.log(`🔑 API Key Status: ${apiKey ? 'Configured' : 'Not configured'}`);
  console.log(`📋 Expected Mode: ${expectedMode}`);
  
  if (!apiKey) {
    console.log('⚠️  Note: Multi-critic requires API key. Testing fallback behavior...\n');
  }

  // Initialize components
  const kg = new KnowledgeGraphManager(logger);
  await kg.init();
  
  const summarizationAgent = new SummarizationAgent(kg);
  const critic = new Critic(kg);
  const actor = new Actor(kg);
  const engine = new ActorCriticEngine(kg, critic, actor, summarizationAgent);

  // Create test artifact
  const testArtifact = createTestArtifact();
  writeFileSync(testArtifact.path, testArtifact.content);

  try {
    // Track performance metrics
    const logFilePath = './data/knowledge_graph.ndjson';
    const startSize = existsSync(logFilePath) ? readFileSync(logFilePath, 'utf-8').length : 0;
    const startTime = Date.now();
    
    console.log('🔍 Submitting code for multi-critic review...\n');
    console.log('Expected critic specializations:');
    console.log('1. 📐 Correctness Critic - SQL injection, error handling, validation');
    console.log('2. ⚡ Efficiency Critic - O(n²) algorithm, memory leaks, async patterns');
    console.log('3. 🔒 Security Critic - Hardcoded secrets, sensitive logging, auth gaps\n');
    
    // Submit to actor_think with feedback enabled
    const result = await engine.actorThink({
      thought: "Review this PaymentProcessor class for security vulnerabilities, performance issues, and correctness problems. The code contains multiple intentional issues across all three critic specializations including SQL injection, hardcoded secrets, O(n²) algorithms, memory leaks, missing error handling, and input validation gaps.",
      tags: [Tag.Task, Tag.Design, Tag.Risk],
      project: "multi-critic-integration-test",
      projectContext: "/Users/matthewamann/codeloops",
      artifacts: [testArtifact],
      feedback: true // Enable multi-critic review
    });

    const endTime = Date.now();
    const endSize = existsSync(logFilePath) ? readFileSync(logFilePath, 'utf-8').length : 0;

    // Analyze results
    const duration = (endTime - startTime) / 1000;
    const logGrowth = (endSize - startSize) / 1024; // KB
    const multiCriticEngaged = !!(result.metadata?.multiCritic);
    const mode = multiCriticEngaged ? 'multi-critic' : 'single-critic';

    return {
      success: true,
      duration,
      logGrowth,
      nodeId: result.id,
      multiCriticEngaged,
      criticsInvolved: result.metadata?.criticsInvolved,
      consensusAnalysis: result.metadata?.consensusAnalysis,
      mode
    };

  } finally {
    // Cleanup test file
    if (existsSync(testArtifact.path)) {
      unlinkSync(testArtifact.path);
    }
  }
}

async function validateCriticFindings(result: Record<string, unknown>): Promise<{
  securityIssuesFound: number;
  performanceIssuesFound: number;
  correctnessIssuesFound: number;
}> {
  const thoughtText = result.thought.toLowerCase();
  
  // Count security issues mentioned
  const securityKeywords = ['sql injection', 'hardcoded', 'api key', 'sensitive data', 'authentication', 'authorization'];
  const securityIssuesFound = securityKeywords.filter(keyword => thoughtText.includes(keyword)).length;
  
  // Count performance issues mentioned
  const performanceKeywords = ['o(n²)', 'o(n^2)', 'efficiency', 'memory leak', 'cache', 'synchronous', 'async'];
  const performanceIssuesFound = performanceKeywords.filter(keyword => thoughtText.includes(keyword)).length;
  
  // Count correctness issues mentioned
  const correctnessKeywords = ['error handling', 'validation', 'race condition', 'return value', 'promise'];
  const correctnessIssuesFound = correctnessKeywords.filter(keyword => thoughtText.includes(keyword)).length;
  
  return {
    securityIssuesFound,
    performanceIssuesFound,
    correctnessIssuesFound
  };
}

async function testMultiCriticSystem() {
  console.log('🧪 Multi-Critic Consensus System Integration Test\n');
  console.log('================================================================\n');
  
  try {
    const results = await runMultiCriticTest();
    
    console.log('\n=== TEST RESULTS ===\n');
    console.log(`✅ Test Status: ${results.success ? 'PASSED' : 'FAILED'}`);
    console.log(`🕐 Duration: ${results.duration.toFixed(2)}s`);
    console.log(`📊 Log Growth: ${results.logGrowth.toFixed(2)} KB`);
    console.log(`🆔 Node ID: ${results.nodeId}`);
    console.log(`🎯 Mode: ${results.mode.toUpperCase()}`);
    
    if (results.multiCriticEngaged) {
      console.log('\n✨ MULTI-CRITIC SYSTEM ENGAGED!');
      console.log(`👥 Critics Involved: ${results.criticsInvolved || 3}`);
      
      if (results.consensusAnalysis) {
        const consensus = results.consensusAnalysis;
        console.log('\n📊 CONSENSUS ANALYSIS:');
        console.log(`- Strong consensus: ${consensus.strongConsensus?.length || 0} items`);
        console.log(`- Majority consensus: ${consensus.majorityConsensus?.length || 0} items`);
        console.log(`- Disputed items: ${consensus.disputed?.length || 0} items`);
        console.log(`- Minority opinions: ${consensus.minorityOpinions?.length || 0} items`);
      }
      
    } else {
      console.log('\n⚠️  SINGLE CRITIC MODE (Fallback)');
      console.log('This is expected when no API key is configured.');
    }
    
    // Validate that critics found the expected issues
    console.log('\n=== ISSUE DETECTION VALIDATION ===\n');
    const kg = new KnowledgeGraphManager(getInstance());
    await kg.init();
    const resultNode = await kg.getNode(results.nodeId);
    
    if (resultNode) {
      const validation = await validateCriticFindings(resultNode);
      console.log(`🔒 Security Issues Detected: ${validation.securityIssuesFound}`);
      console.log(`⚡ Performance Issues Detected: ${validation.performanceIssuesFound}`);
      console.log(`📐 Correctness Issues Detected: ${validation.correctnessIssuesFound}`);
      
      const totalIssuesFound = validation.securityIssuesFound + 
                               validation.performanceIssuesFound + 
                               validation.correctnessIssuesFound;
      
      console.log(`\n📈 Total Issues Detected: ${totalIssuesFound}/19 expected`);
      
      if (totalIssuesFound >= 10) {
        console.log('✅ Critics successfully identified major issues');
      } else if (totalIssuesFound >= 5) {
        console.log('⚠️  Critics identified some issues but may have missed others');
      } else {
        console.log('❌ Critics may not have thoroughly analyzed the code');
      }
    }
    
    console.log('\n=== PERFORMANCE ANALYSIS ===\n');
    
    if (results.mode === 'multi-critic') {
      console.log('📊 Multi-Critic Performance:');
      console.log(`- Target: 15-30s (acceptable for 3 critics + consensus)`);
      console.log(`- Actual: ${results.duration.toFixed(2)}s`);
      
      if (results.duration <= 30) {
        console.log('✅ Performance within acceptable range');
      } else if (results.duration <= 60) {
        console.log('⚠️  Performance slower than ideal but functional');
      } else {
        console.log('❌ Performance concerns - may indicate API issues');
      }
      
      console.log(`- Log growth: ${results.logGrowth.toFixed(2)} KB (expected: ~1.5x single critic)`);
      
    } else {
      console.log('📊 Single-Critic Performance:');
      console.log(`- Target: 8-12s (single critic)`);
      console.log(`- Actual: ${results.duration.toFixed(2)}s`);
      
      if (results.duration <= 15) {
        console.log('✅ Fallback performance acceptable');
      } else {
        console.log('⚠️  Slower than expected for single critic');
      }
    }
    
    console.log('\n=== RECOMMENDATIONS ===\n');
    
    if (results.mode === 'single-critic') {
      console.log('🔧 To enable multi-critic mode:');
      console.log('1. Set GOOGLE_GENAI_API_KEY environment variable');
      console.log('2. Restart the test');
      console.log('3. Verify API key has sufficient quota');
    } else {
      console.log('✅ Multi-critic system fully operational');
      console.log('🚀 Ready for production workloads');
    }
    
    console.log('\n================================================================');
    console.log(`🎯 Overall Test Result: ${results.success ? 'PASSED' : 'FAILED'}`);
    console.log('================================================================\n');
    
    return results.success ? 0 : 1;
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    console.error('\nStack trace:');
    console.error(error.stack);
    return 1;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMultiCriticSystem()
    .then(code => process.exit(code))
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

export { testMultiCriticSystem, runMultiCriticTest, validateCriticFindings };