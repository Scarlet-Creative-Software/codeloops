#!/usr/bin/env npx tsx

import { ActorCriticEngine } from './src/engine/ActorCriticEngine.js';
import { KnowledgeGraphManager } from './src/engine/KnowledgeGraph.js';
import { Critic } from './src/agents/Critic.js';
import { Actor } from './src/agents/Actor.js';
import { SummarizationAgent } from './src/agents/Summarize.js';
import { Tag } from './src/engine/tags.js';
import { getInstance as getLogger } from './src/logger.js';
import { readFileSync } from 'fs';

async function testMultiCriticWithTemperature() {
  const logger = getLogger();
  logger.info('Testing multi-critic system with configured temperatures (0.3-0.4)...');

  // Initialize components
  const kg = new KnowledgeGraphManager(logger);
  await kg.init();
  
  const summarizationAgent = new SummarizationAgent(kg);
  const critic = new Critic(kg);
  const actor = new Actor(kg);
  const engine = new ActorCriticEngine(kg, critic, actor, summarizationAgent);

  // Create test artifact with intentional issues
  const testArtifact = {
    name: "test-multi-critic-sample.ts",
    path: "./test-multi-critic-sample.ts",
    content: `import { Database } from 'sqlite3';

// Sample code with intentional issues for multi-critic review
export class UserService {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
  }

  // Issue 1: SQL injection vulnerability
  async getUser(userId: string) {
    const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
    return new Promise((resolve) => {
      this.db.get(query, (err, row) => {
        resolve(row); // Issue 2: No error handling
      });
    });
  }

  // Issue 3: Inefficient algorithm (O(n²) complexity)
  findDuplicateEmails(users: Array<{email: string}>) {
    const duplicates = [];
    for (let i = 0; i < users.length; i++) {
      for (let j = i + 1; j < users.length; j++) {
        if (users[i].email === users[j].email) {
          duplicates.push(users[i].email);
        }
      }
    }
    return duplicates;
  }

  // Issue 4: No input validation
  updateUserAge(userId: string, age: any) {
    const query = \`UPDATE users SET age = \${age} WHERE id = '\${userId}'\`;
    this.db.run(query); // Issue 5: No callback or promise
  }

  // Issue 6: Resource leak - no db.close()
}`
  };

  try {
    // Track log file size
    const logFilePath = './data/knowledge_graph.ndjson';
    const startSize = readFileSync(logFilePath, 'utf-8').length;
    const startTime = Date.now();
    
    // Now test with multi-critic
    console.log('Testing multi-critic system with temperature configuration...');
    
    // Submit to actor_think with feedback enabled
    const result = await engine.actorThink({
      thought: "Testing the multi-critic system with newly configured temperatures (0.3-0.4). The lower temperatures should produce more consistent, deterministic reviews focused on factual code analysis rather than creative suggestions.",
      tags: [Tag.Task, Tag.Design],
      project: "temperature-test",
      projectContext: "/Users/matthewamann/codeloops",
      artifacts: [testArtifact],
      feedback: true // Enable multi-critic review
    });

    const endTime = Date.now();
    const endSize = readFileSync(logFilePath, 'utf-8').length;

    // Output results
    console.log('\n=== MULTI-CRITIC TEST RESULTS ===\n');
    console.log(`✅ Multi-critic review completed!`);
    console.log(`⏱️  Time taken: ${(endTime - startTime) / 1000}s`);
    console.log(`📊 Log growth: ${((endSize - startSize) / 1024).toFixed(2)} KB`);
    console.log(`🆔 Result node ID: ${result.id}`);
    console.log(`📝 Result type: ${result.role}`);

    if (result.metadata?.multiCritic) {
      console.log('✨ Multi-critic metadata found!');
      console.log(`👥 Critics involved: ${result.metadata.criticsInvolved}`);
    }
    
    // Show a snippet of the critique
    console.log('\n📋 Critique preview:');
    console.log(result.thought.substring(0, 500) + '...\n');
    
    // Parse and display the multi-critic response if available
    if (result.thought.includes('Multi-Critic Consensus Review')) {
      console.log('\n=== ANALYZING CRITIC RESPONSES ===\n');
      
      // Extract sections using regex
      const correctnessMatch = result.thought.match(/### Correctness Critic([\s\S]*?)(?=###|$)/);
      const efficiencyMatch = result.thought.match(/### Efficiency Critic([\s\S]*?)(?=###|$)/);
      const securityMatch = result.thought.match(/### Security Critic([\s\S]*?)(?=###|$)/);
      const consensusMatch = result.thought.match(/### Consensus Summary([\s\S]*?)(?=###|$)/);
      
      if (correctnessMatch) {
        console.log('📐 CORRECTNESS CRITIC HIGHLIGHTS:');
        console.log(correctnessMatch[1].trim().substring(0, 300) + '...\n');
      }
      
      if (efficiencyMatch) {
        console.log('⚡ EFFICIENCY CRITIC HIGHLIGHTS:');
        console.log(efficiencyMatch[1].trim().substring(0, 300) + '...\n');
      }
      
      if (securityMatch) {
        console.log('🔒 SECURITY CRITIC HIGHLIGHTS:');
        console.log(securityMatch[1].trim().substring(0, 300) + '...\n');
      }
      
      if (consensusMatch) {
        console.log('🤝 CONSENSUS SUMMARY:');
        console.log(consensusMatch[1].trim());
      }
    }

    // Check temperature settings
    console.log('\n=== TEMPERATURE SETTINGS ===');
    console.log('Expected temperatures: 0.3-0.4 (configured via environment or defaults)');
    console.log('Lower temperatures should produce more focused, deterministic reviews');

  } catch (error) {
    logger.error('Test failed:', error);
    console.error('Test failed:', error);
  }

  process.exit(0);
}

// Run the test
testMultiCriticWithTemperature().catch(console.error);