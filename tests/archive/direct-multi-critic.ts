#!/usr/bin/env npx tsx

import { KnowledgeGraphManager } from './src/engine/KnowledgeGraph.js';
import { ActorCriticEngine } from './src/engine/ActorCriticEngine.js';
import { Actor } from './src/agents/Actor.js';
import { Critic } from './src/agents/Critic.js';
import { SummarizationAgent } from './src/agents/Summarize.js';
import { Tag } from './src/engine/tags.js';
import { readFileSync } from 'fs';
import { getInstance as getLogger } from './src/logger.js';

// SECURITY NOTE: API key removed for security reasons
// Set GOOGLE_GENAI_API_KEY environment variable before running this test

async function testMultiCritic() {
  console.log('Testing Multi-Critic Consensus System...\n');
  
  // Initialize components with logger
  const logger = getLogger();
  const kg = new KnowledgeGraphManager(logger);
  await kg.init();
  
  const actor = new Actor(kg);
  const critic = new Critic(kg);
  const summarizer = new SummarizationAgent(kg);
  const engine = new ActorCriticEngine(kg, critic, actor, summarizer);
  
  // Read the test file content
  const testFileContent = readFileSync('./test-multi-critic-demo.ts', 'utf-8');
  
  // Test with feedback:true to trigger multi-critic
  console.log('🔍 Running with feedback:true (multi-critic mode)...\n');
  
  const startSize = readFileSync('./data/knowledge_graph.ndjson', 'utf-8').length;
  const startTime = Date.now();
  
  try {
    const result = await engine.actorThink({
      thought: 'Review and improve the UserAuthentication class in test-multi-critic-demo.ts. The class has various security, performance, and code quality issues that need to be addressed.',
      projectContext: '/Users/matthewamann/codeloops',
      project: 'multi-critic-test',
      tags: [Tag.Task, Tag.Design],
      artifacts: [{
        name: 'test-multi-critic-demo.ts',
        path: './test-multi-critic-demo.ts',
        content: testFileContent
      }],
      feedback: true
    });
    
    const endTime = Date.now();
    const endSize = readFileSync('./data/knowledge_graph.ndjson', 'utf-8').length;
    
    console.log('✅ Multi-critic review completed!');
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
    
  } catch (error) {
    console.error('❌ Error during multi-critic review:', error);
    console.log('\nThis might be due to API key issues or rate limiting.');
  }
  
  // Compare with single critic
  console.log('\n🔍 Running with feedback:false (single critic mode) for comparison...\n');
  
  const singleStartSize = readFileSync('./data/knowledge_graph.ndjson', 'utf-8').length;
  const singleStartTime = Date.now();
  
  try {
    await engine.actorThink({
      thought: 'Review the same UserAuthentication class for comparison',
      projectContext: '/Users/matthewamann/codeloops',
      project: 'multi-critic-test',
      tags: [Tag.Task],
      artifacts: [{
        name: 'test-multi-critic-demo.ts',
        path: './test-multi-critic-demo.ts',
        content: testFileContent
      }],
      feedback: false
    });
    
    const singleEndTime = Date.now();
    const singleEndSize = readFileSync('./data/knowledge_graph.ndjson', 'utf-8').length;
    
    console.log('✅ Single critic review completed!');
    console.log(`⏱️  Time taken: ${(singleEndTime - singleStartTime) / 1000}s`);
    console.log(`📊 Log growth: ${((singleEndSize - singleStartSize) / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('❌ Error during single critic review:', error);
  }
}

// Run the test
testMultiCritic().catch(console.error);