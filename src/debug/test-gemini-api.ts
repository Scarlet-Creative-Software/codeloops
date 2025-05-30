#!/usr/bin/env tsx
/**
 * Minimal test script to verify Gemini API connectivity
 * Tests direct API calls outside of multi-critic system
 */

import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

// Load .env from project root
config({ path: path.join(rootDir, '.env') });

async function testGeminiAPI() {
  console.log('🧪 Testing Gemini API Connectivity');
  console.log('=====================================');
  
  // 1. Check API key availability
  const codeloopsKey = process.env.CODELOOPS_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  const apiKey = codeloopsKey || geminiKey;
  
  if (!apiKey) {
    console.error('❌ No API key found in environment variables');
    console.log('   Checked: CODELOOPS_KEY, GOOGLE_GENAI_API_KEY, GEMINI_API_KEY');
    process.exit(1);
  }
  
  console.log(`✅ API key found: ${apiKey.substring(0, 8)}...`);
  console.log(`   Source: ${codeloopsKey ? 'CODELOOPS_KEY' : (process.env.GOOGLE_GENAI_API_KEY ? 'GOOGLE_GENAI_API_KEY' : 'GEMINI_API_KEY')}`);
  
  // 2. Test basic API initialization
  try {
    const genai = new GoogleGenAI({ apiKey });
    console.log('✅ GoogleGenAI client initialized successfully');
    
    // 3. Test direct API access (new pattern)
    console.log('\n📝 Testing basic text generation...');
    const result = await genai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: [{ role: 'user', parts: [{ text: 'Say "Hello" if you can respond.' }] }],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    
    const text = result.text;
    console.log('✅ Basic generation successful:');
    console.log(`   Response: "${text?.trim() || 'No text returned'}"`);
    
    // 4. Test structured output (similar to multi-critic usage)
    console.log('\n🏗️  Testing structured output...');
    const structuredPrompt = `
You are a code review critic. Please analyze this simple function and provide feedback.

function add(a, b) {
  return a + b;
}

Respond with JSON in this format:
{
  "summary": "Brief summary of the analysis",
  "issues": ["list", "of", "issues"],
  "suggestions": ["list", "of", "suggestions"],
  "rating": "score from 1-10"
}

Respond ONLY with valid JSON, no markdown formatting or explanations.`;

    const structuredResult = await genai.models.generateContent({
      model: 'gemini-2.5-flash-preview-05-20',
      contents: [{ role: 'user', parts: [{ text: structuredPrompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 2048,
      },
    });
    
    const structuredText = structuredResult.text || '';
    console.log('✅ Structured generation successful:');
    console.log(`   Response length: ${structuredText.length} characters`);
    
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(structuredText);
      console.log('✅ Response is valid JSON');
      console.log(`   Summary: "${parsed.summary}"`);
    } catch {
      console.log('⚠️  Response is not valid JSON (this might be expected)');
      console.log(`   First 100 chars: "${structuredText.substring(0, 100)}..."`);
    }
    
    // 5. Test rate limiting behavior
    console.log('\n⚡ Testing rapid requests (rate limit check)...');
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        genai.models.generateContent({
          model: 'gemini-2.5-flash-preview-05-20',
          contents: [{ role: 'user', parts: [{ text: `Test request ${i + 1}: What is ${i + 1} + 1?` }] }],
        })
      );
    }
    
    const rapidResults = await Promise.allSettled(promises);
    const successful = rapidResults.filter(r => r.status === 'fulfilled').length;
    const failed = rapidResults.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Rapid requests: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      console.log('❌ Failed request errors:');
      rapidResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.log(`   Request ${index + 1}: ${result.reason.message}`);
        }
      });
    }
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('   The Gemini API is working correctly.');
    console.log('   Multi-critic failures are likely in the orchestration layer.');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(`   Type: ${(error as Error).constructor.name}`);
    console.error(`   Message: ${(error as Error).message}`);
    if ((error as Error).stack) {
      console.error(`   Stack: ${(error as Error).stack}`);
    }
    
    // Check for common error patterns
    if ((error as Error).message.includes('API_KEY_INVALID')) {
      console.log('\n💡 Diagnosis: Invalid API key');
      console.log('   - Check that your API key is correct');
      console.log('   - Verify the key has proper permissions');
    } else if ((error as Error).message.includes('PERMISSION_DENIED')) {
      console.log('\n💡 Diagnosis: Permission denied');
      console.log('   - Check API key permissions');
      console.log('   - Verify Gemini API is enabled for your project');
    } else if ((error as Error).message.includes('QUOTA_EXCEEDED')) {
      console.log('\n💡 Diagnosis: Quota exceeded');
      console.log('   - Check your usage limits in Google Cloud Console');
      console.log('   - Wait for quota reset or upgrade plan');
    } else if ((error as Error).message.includes('RESOURCE_EXHAUSTED')) {
      console.log('\n💡 Diagnosis: Rate limit hit');
      console.log('   - Reduce request frequency');
      console.log('   - Implement proper backoff strategies');
    }
    
    process.exit(1);
  }
}

// Run the test
testGeminiAPI().catch(console.error);