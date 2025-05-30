#!/usr/bin/env npx tsx

import { ActorCriticEngine } from './src/engine/ActorCriticEngine.js';
import { KnowledgeGraphManager } from './src/engine/KnowledgeGraph.js';
import { Critic } from './src/agents/Critic.js';
import { Actor } from './src/agents/Actor.js';
import { SummarizationAgent } from './src/agents/Summarize.js';
import { Tag } from './src/engine/tags.js';
import { getInstance as getLogger } from './src/logger.js';

async function testMultiCritic() {
  const logger = getLogger();
  
  // Set log level to debug for more detailed output
  logger.level = 'debug';
  
  console.log('🚀 Starting multi-critic test with debug logging...\n');

  // Initialize components
  const kg = new KnowledgeGraphManager(logger);
  await kg.init();
  
  const summarizationAgent = new SummarizationAgent(kg);
  const critic = new Critic(kg);
  const actor = new Actor(kg);
  const engine = new ActorCriticEngine(kg, critic, actor, summarizationAgent);

  // Test content with various issues
  const testContent = `// Test file with various issues for multi-critic review
import * as fs from 'fs';
import { exec } from 'child_process';

// Security vulnerability: SQL injection
function getUserData(userId: string) {
  const query = \`SELECT * FROM users WHERE id = '\${userId}'\`; // Direct string interpolation
  return database.query(query);
}

// Performance issue: Inefficient array operations
function findDuplicates(arr: number[]) {
  const duplicates = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j] && !duplicates.includes(arr[i])) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates; // O(n³) complexity
}

// Logic error: Off-by-one error
function getLastNElements(arr: any[], n: number) {
  return arr.slice(arr.length - n + 1); // Should be arr.length - n
}

// Security: Command injection vulnerability
function runCommand(userInput: string) {
  exec(\`ls -la \${userInput}\`, (err, stdout) => {
    console.log(stdout);
  });
}

// Performance: Synchronous file operations blocking event loop
function processFiles(files: string[]) {
  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8'); // Blocking
    const processed = content.toUpperCase();
    fs.writeFileSync(file + '.processed', processed); // Blocking
  });
}

// Edge case: Special characters in strings
const message = "This string has \\"quotes\\" and \`backticks\` and 'apostrophes'";
const codeExample = \`
  const func = () => {
    return "nested \\\\"quotes\\\\" and \\\\\`template\\\\\` literals";
  };
\`;

// Logic error: Incorrect null check
function processData(data: any) {
  if (data == null) { // Should use === for strict equality
    return 'No data';
  }
  // This will treat 0, false, '' as equal to null
  return data.toString();
}

// Memory leak: Event listeners not cleaned up
class EventManager {
  private listeners: Function[] = [];
  
  addListener(fn: Function) {
    this.listeners.push(fn);
    document.addEventListener('click', fn);
    // No removeEventListener - memory leak
  }
}

// Type safety issue: Any type usage
function dangerousFunction(input: any): any {
  return input.doSomething(); // No type checking
}

export { getUserData, findDuplicates, getLastNElements, runCommand, processFiles, processData, EventManager, dangerousFunction };`;

  try {
    const startTime = Date.now();
    
    // Submit to actor_think with feedback enabled
    const result = await engine.actorThink({
      thought: "Final test of multi-critic system with all improvements: temperature configuration (0.3-0.4), JSON sanitization for code examples, retry logic with exponential backoff, and improved error handling. This should demonstrate more robust and consistent critic reviews.",
      tags: [Tag.Task, Tag.TaskComplete],
      project: "multi-critic-final-test",
      projectContext: "/Users/matthewamann/codeloops",
      artifacts: [{
        name: "test-edge-cases.ts",
        path: "./test-edge-cases.ts",
        content: testContent
      }],
      feedback: true // Enable multi-critic review
    });

    const endTime = Date.now();

    // Output results
    console.log('\n=== MULTI-CRITIC TEST RESULTS ===\n');
    console.log(`✅ Review completed!`);
    console.log(`⏱️  Time taken: ${(endTime - startTime) / 1000}s`);
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
        
        // Show sample findings
        if (consensus.strongConsensus?.length > 0) {
          console.log('\n🔍 STRONG CONSENSUS ISSUES:');
          consensus.strongConsensus.slice(0, 3).forEach((issue: { issue: string; severity: string; confidence: number }, i: number) => {
            console.log(`${i + 1}. ${issue.issue}`);
            console.log(`   Severity: ${issue.severity}, Confidence: ${issue.confidence}`);
          });
        }
      }
      
      // Show critic response preview
      console.log('\n📋 Critic response preview:');
      console.log(result.thought.substring(0, 500) + '...');
      
    } else {
      console.log('⚠️  Fell back to single critic mode');
      console.log('\n📋 Single critic response:');
      console.log(result.thought.substring(0, 500) + '...');
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }

  process.exit(0);
}

// Run the test
testMultiCritic().catch(console.error);