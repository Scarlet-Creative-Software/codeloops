#!/usr/bin/env npx tsx

import { ActorCriticEngine } from './src/engine/ActorCriticEngine.js';
import { KnowledgeGraphManager } from './src/engine/KnowledgeGraph.js';
import { Critic } from './src/agents/Critic.js';
import { Actor } from './src/agents/Actor.js';
import { SummarizationAgent } from './src/agents/Summarize.js';
import { Tag } from './src/engine/tags.js';
import { getInstance as getLogger } from './src/logger.js';
import { readFileSync, writeFileSync } from 'fs';

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

  // Create test file content
  const testContent = `import { Database } from 'sqlite3';

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
}`;

  // Write test file to disk so it can be loaded by the system
  const testFilePath = './test-critic-temperature.ts';
  writeFileSync(testFilePath, testContent);

  try {
    // Track log file size
    const logFilePath = './data/knowledge_graph.ndjson';
    const startSize = readFileSync(logFilePath, 'utf-8').length;
    const startTime = Date.now();
    
    console.log('🔍 Testing multi-critic system with temperature configuration...\n');
    
    // Submit to actor_think with feedback enabled
    const result = await engine.actorThink({
      thought: "Review the UserService class for security vulnerabilities, performance issues, and code quality. The code has SQL injection, missing error handling, inefficient algorithms, and resource leaks.",
      tags: [Tag.Task, Tag.Design],
      project: "temperature-final-test",
      projectContext: "/Users/matthewamann/codeloops",
      artifacts: [{
        name: "test-critic-temperature.ts",
        path: testFilePath,
        content: testContent
      }],
      feedback: true // Enable multi-critic review
    });

    const endTime = Date.now();
    const endSize = readFileSync(logFilePath, 'utf-8').length;

    // Output results
    console.log('\n=== MULTI-CRITIC TEST RESULTS ===\n');
    console.log(`✅ Review completed!`);
    console.log(`⏱️  Time taken: ${(endTime - startTime) / 1000}s`);
    console.log(`📊 Log growth: ${((endSize - startSize) / 1024).toFixed(2)} KB`);
    console.log(`🆔 Result node ID: ${result.id}`);
    console.log(`📝 Result type: ${result.role}`);

    if (result.metadata?.multiCritic) {
      console.log('✨ Multi-critic system activated!');
      console.log(`👥 Critics involved: ${result.metadata.criticsInvolved}`);
      
      // Parse the consensus analysis
      if (result.metadata.consensusAnalysis) {
        const consensus = result.metadata.consensusAnalysis;
        console.log('\n📊 CONSENSUS ANALYSIS:');
        console.log(`- Strong consensus items: ${consensus.strongConsensus?.length || 0}`);
        console.log(`- Majority consensus items: ${consensus.majorityConsensus?.length || 0}`);
        console.log(`- Disputed items: ${consensus.disputed?.length || 0}`);
        console.log(`- Minority opinions: ${consensus.minorityOpinions?.length || 0}`);
      }
      
      // Show key findings
      console.log('\n🔍 KEY FINDINGS:');
      const thoughtLines = result.thought.split('\n');
      const issueLines = thoughtLines.filter(line => line.match(/^\d+\.\s+\*\*/));
      issueLines.slice(0, 5).forEach(line => console.log(line));
      
    } else {
      console.log('⚠️  Fell back to single critic mode');
      console.log('\n📋 Single critic response:');
      console.log(result.thought.substring(0, 500) + '...');
    }

    console.log('\n=== TEMPERATURE CONFIGURATION ===');
    console.log('🌡️  Expected: 0.3-0.4 (lower temperatures for focused, deterministic reviews)');
    console.log('📝 Result: The critics should have provided consistent, factual analysis');
    console.log('         focusing on concrete code issues rather than creative suggestions.');

  } catch (error) {
    logger.error('Test failed:', error);
    console.error('❌ Test failed:', error);
  }

  process.exit(0);
}

// Run the test
testMultiCriticWithTemperature().catch(console.error);