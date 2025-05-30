#!/usr/bin/env npx tsx

import { ActorCriticEngine } from '../../src/engine/ActorCriticEngine.js';
import { KnowledgeGraphManager } from '../../src/engine/KnowledgeGraph.js';
import { Critic } from '../../src/agents/Critic.js';
import { Actor } from '../../src/agents/Actor.js';
import { SummarizationAgent } from '../../src/agents/Summarize.js';
import { Tag } from '../../src/engine/tags.js';
import { getInstance as getLogger } from '../../src/logger.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

async function testMultiCriticFixed() {
  const logger = getLogger();
  
  // Check if API key is available
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('⚠️  Multi-Critic Test Requirements:');
    console.log('   This test requires a Google Gemini API key to function properly.');
    console.log('   Please set one of the following environment variables:');
    console.log('   - GOOGLE_GENAI_API_KEY');
    console.log('   - GEMINI_API_KEY');
    console.log('');
    console.log('   Example:');
    console.log('   export GOOGLE_GENAI_API_KEY="your-api-key-here"');
    console.log('   npm run test:multi-critic');
    console.log('');
    console.log('   The multi-critic system will fall back to single critic mode without an API key.');
    
    // Continue with test to show fallback behavior
    console.log('\n🔄 Continuing test to demonstrate fallback behavior...\n');
  } else {
    console.log('✅ API key detected. Multi-critic system should engage all 3 critics.\n');
  }
  
  logger.info('Testing fixed multi-critic system...');

  // Initialize components
  const kg = new KnowledgeGraphManager(logger);
  await kg.init();
  
  const summarizationAgent = new SummarizationAgent(kg);
  const critic = new Critic(kg);
  const actor = new Actor(kg);
  const engine = new ActorCriticEngine(kg, critic, actor, summarizationAgent);

  // Create test file content with multiple issues for critics to find
  const testContent = `import { Database } from 'sqlite3';

// Code with issues for multi-critic review
export class PaymentProcessor {
  private db: Database;
  private apiKey: string = 'sk_live_1234567890'; // Issue 1: Hardcoded API key

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  // Issue 2: SQL injection vulnerability
  async processPayment(userId: string, amount: number, cardNumber: string) {
    // Issue 3: Logging sensitive data
    console.log(\`Processing payment for user \${userId} with card \${cardNumber}\`);
    
    // Issue 4: No input validation
    const query = \`
      INSERT INTO payments (user_id, amount, card_number, status) 
      VALUES ('\${userId}', \${amount}, '\${cardNumber}', 'pending')
    \`;
    
    // Issue 5: No error handling
    return new Promise((resolve) => {
      this.db.run(query, (err) => {
        // Issue 6: Ignoring errors
        resolve({ success: true });
      });
    });
  }

  // Issue 7: Inefficient duplicate check - O(n²) complexity
  findDuplicateTransactions(transactions: Array<{id: string, amount: number}>) {
    const duplicates = [];
    for (let i = 0; i < transactions.length; i++) {
      for (let j = i + 1; j < transactions.length; j++) {
        if (transactions[i].amount === transactions[j].amount) {
          duplicates.push(transactions[i].id);
        }
      }
    }
    return duplicates;
  }

  // Issue 8: No authentication check
  refundPayment(paymentId: string) {
    const query = \`UPDATE payments SET status = 'refunded' WHERE id = '\${paymentId}'\`;
    this.db.run(query);
    // Issue 9: No audit trail
    // Issue 10: No resource cleanup
  }
}`;

  // Write test file
  const testFilePath = './test-payment-processor.ts';
  writeFileSync(testFilePath, testContent);

  try {
    // Track timing and log size
    const logFilePath = './data/knowledge_graph.ndjson';
    const startSize = existsSync(logFilePath) ? readFileSync(logFilePath, 'utf-8').length : 0;
    const startTime = Date.now();
    
    console.log('🔍 Submitting code for multi-critic review...\n');
    console.log('Expected critics to engage:');
    console.log('1. Correctness Critic - Will identify SQL injection, error handling issues');
    console.log('2. Efficiency Critic - Will identify O(n²) algorithm, resource leaks');
    console.log('3. Security Critic - Will identify hardcoded API key, sensitive data logging\n');
    
    // Submit to actor_think with feedback enabled
    const result = await engine.actorThink({
      thought: "Review this PaymentProcessor class for security vulnerabilities, performance issues, and code quality. The code has multiple intentional issues including SQL injection, hardcoded secrets, inefficient algorithms, and missing error handling.",
      tags: [Tag.Task, Tag.Design],
      project: "multi-critic-test-fixed",
      projectContext: "/Users/matthewamann/codeloops",
      artifacts: [{
        name: "test-payment-processor.ts",
        path: testFilePath,
        content: testContent
      }],
      feedback: true // Enable multi-critic review
    });

    const endTime = Date.now();
    const endSize = existsSync(logFilePath) ? readFileSync(logFilePath, 'utf-8').length : 0;

    // Output results
    console.log('\n=== MULTI-CRITIC TEST RESULTS (FIXED) ===\n');
    console.log(`✅ Review completed!`);
    console.log(`⏱️  Time taken: ${(endTime - startTime) / 1000}s`);
    console.log(`📊 Log growth: ${((endSize - startSize) / 1024).toFixed(2)} KB`);
    console.log(`🆔 Result node ID: ${result.id}`);
    console.log(`📝 Result type: ${result.role}`);

    if (result.metadata?.multiCritic) {
      console.log('\n✨ MULTI-CRITIC SYSTEM ENGAGED!');
      console.log(`👥 Critics involved: ${result.metadata.criticsInvolved}`);
      
      // Parse the consensus analysis
      if (result.metadata.consensusAnalysis) {
        const consensus = result.metadata.consensusAnalysis;
        console.log('\n📊 CONSENSUS ANALYSIS:');
        console.log(`- Strong consensus items: ${consensus.strongConsensus?.length || 0}`);
        console.log(`- Majority consensus items: ${consensus.majorityConsensus?.length || 0}`);
        console.log(`- Disputed items: ${consensus.disputed?.length || 0}`);
        console.log(`- Minority opinions: ${consensus.minorityOpinions?.length || 0}`);
        
        // Show unanimous findings
        if (consensus.strongConsensus && consensus.strongConsensus.length > 0) {
          console.log('\n🎯 UNANIMOUS FINDINGS:');
          consensus.strongConsensus.forEach((item, i) => {
            console.log(`${i + 1}. ${item.issue} (confidence: ${(item.confidence * 100).toFixed(0)}%)`);
          });
        }
      }
      
      // Show key findings from the critique
      console.log('\n🔍 KEY FINDINGS FROM CONSENSUS:');
      const thoughtLines = result.thought.split('\n');
      const issueLines = thoughtLines.filter(line => line.match(/^\d+\.\s+\*\*/));
      issueLines.slice(0, 5).forEach(line => console.log(line));
      
    } else {
      console.log('\n⚠️  SINGLE CRITIC MODE');
      console.log('The system fell back to single critic mode.');
      console.log('This typically happens when:');
      console.log('1. No API key is configured');
      console.log('2. Rate limiting is preventing parallel API calls');
      console.log('3. Circuit breaker is open due to previous failures');
      
      console.log('\n📋 Single critic response preview:');
      console.log(result.thought.substring(0, 500) + '...');
    }

    console.log('\n=== SYSTEM STATUS ===');
    console.log(`🔑 API Key Status: ${apiKey ? 'Configured' : 'Not configured'}`);
    console.log('🔧 Stagger Delay: 500ms between critics');
    console.log('🔄 Circuit Breaker: Auto-reset on OPEN state');
    console.log('📈 Expected Performance:');
    console.log('   - With API key: 15-30s (3 critics + consensus)');
    console.log('   - Without API key: 8-10s (single critic fallback)');

  } catch (error) {
    logger.error('Test failed:', error);
    console.error('❌ Test failed:', error);
  }

  process.exit(0);
}

// Run the test
testMultiCriticFixed().catch(console.error);