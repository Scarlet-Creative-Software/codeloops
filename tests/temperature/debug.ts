#!/usr/bin/env npx tsx

import { ActorCriticEngine } from './src/engine/ActorCriticEngine.js';
import { KnowledgeGraphManager } from './src/engine/KnowledgeGraph.js';
import { Critic } from './src/agents/Critic.js';
import { Actor } from './src/agents/Actor.js';
import { SummarizationAgent } from './src/agents/Summarize.js';
import { Tag } from './src/engine/tags.js';
import { getInstance as getLogger } from './src/logger.js';
import { readFileSync } from 'fs';

// Enable more verbose logging
process.env.LOG_LEVEL = 'debug';

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

  // Create a simpler test artifact with obvious issues
  const testArtifact = {
    name: "simple-test.ts",
    path: "./simple-test.ts",
    content: `// Simple test with obvious issues
function authenticateUser(username, password) {
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  // No password hashing
  if (password === "admin123") {
    return true;
  }
  return false;
}`
  };

  try {
    // Track log file size
    const logFilePath = './data/knowledge_graph.ndjson';
    const startSize = readFileSync(logFilePath, 'utf-8').length;
    const startTime = Date.now();
    
    console.log('Testing multi-critic system with simplified code example...');
    
    // Submit to actor_think with feedback enabled
    const result = await engine.actorThink({
      thought: "Review this simple authentication function that has SQL injection vulnerability and hardcoded password issues",
      tags: [Tag.Task],
      project: "temperature-debug-test",
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
      console.log('\n📋 Full critique:');
      console.log(result.thought);
    } else {
      console.log('⚠️  Fell back to single critic mode');
      console.log('\n📋 Single critic response:');
      console.log(result.thought);
    }

  } catch (error) {
    logger.error('Test failed:', error);
    console.error('Test failed:', error);
    
    // Check if it's an API key issue
    if (error.message?.includes('API_KEY')) {
      console.log('\n⚠️  API Key Issue Detected');
      console.log('Make sure GOOGLE_GENAI_API_KEY is set correctly');
    }
  }

  process.exit(0);
}

// Run the test
testMultiCriticWithTemperature().catch(console.error);