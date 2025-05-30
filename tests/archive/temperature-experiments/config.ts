#!/usr/bin/env npx tsx

import { KnowledgeGraphManager } from './src/engine/KnowledgeGraph.js';
import { ActorCriticEngine } from './src/engine/ActorCriticEngine.js';
import { Actor } from './src/agents/Actor.js';
import { Critic } from './src/agents/Critic.js';
import { SummarizationAgent } from './src/agents/Summarize.js';
import { Tag } from './src/engine/tags.js';
import { readFileSync } from 'fs';
import { getInstance as getLogger } from './src/logger.js';

async function testTemperatureConfig() {
  console.log('Testing Multi-Critic System with Temperature Configuration Task...\n');
  
  // Initialize components
  const logger = getLogger();
  const kg = new KnowledgeGraphManager(logger);
  await kg.init();
  
  const actor = new Actor(kg);
  const critic = new Critic(kg);
  const summarizer = new SummarizationAgent(kg);
  const engine = new ActorCriticEngine(kg, critic, actor, summarizer);
  
  // Read the config.ts file
  const configContent = readFileSync('./src/config.ts', 'utf-8');
  
  console.log('🔍 Running actor_think with feedback:true (multi-critic mode)...\n');
  console.log('📋 Task: Implement temperature configuration for critics\n');
  
  const startTime = Date.now();
  
  try {
    const result = await engine.actorThink({
      thought: "Implement temperature configuration for the multi-critic system. The critics currently use default Gemini temperatures (~0.9) which is too high for code review. Need to add environment variables for configuring temperatures per critic type (correctness: 0.3, efficiency: 0.4, security: 0.3).",
      projectContext: '/Users/matthewamann/codeloops',
      project: 'codeloops',
      tags: [Tag.Task, Tag.Design],
      artifacts: [{
        name: 'src/config.ts',
        path: './src/config.ts',
        content: configContent
      }],
      feedback: true
    });
    
    const endTime = Date.now();
    
    console.log('✅ Multi-critic review completed!');
    console.log(`⏱️  Time taken: ${(endTime - startTime) / 1000}s`);
    console.log(`🆔 Result node ID: ${result.id}`);
    console.log(`📝 Result type: ${result.role}`);
    
    if (result.metadata?.multiCritic) {
      console.log('✨ Multi-critic metadata found!');
      console.log(`👥 Critics involved: ${result.metadata.criticsInvolved}`);
      console.log('\n🔍 Consensus Analysis:');
      if (result.metadata.consensus) {
        console.log(`  - Strong consensus items: ${result.metadata.consensus.strongConsensus?.length || 0}`);
        console.log(`  - Majority consensus items: ${result.metadata.consensus.majorityConsensus?.length || 0}`);
        console.log(`  - Disputed items: ${result.metadata.consensus.disputed?.length || 0}`);
        console.log(`  - Minority opinions: ${result.metadata.consensus.minorityOpinions?.length || 0}`);
      }
    }
    
    // Show the critique
    console.log('\n📋 Full Critique:');
    console.log('─'.repeat(80));
    console.log(result.thought);
    console.log('─'.repeat(80));
    
  } catch (error) {
    console.error('❌ Error during multi-critic review:', error);
    if (error instanceof Error && error.message.includes('API key')) {
      console.log('\n⚠️  Make sure GOOGLE_GENAI_API_KEY is set in your environment');
    }
  }
}

// Run the test
testTemperatureConfig().catch(console.error);