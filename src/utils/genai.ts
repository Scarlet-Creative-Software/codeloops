import { GoogleGenAI, type Content } from '@google/genai';
import { GENAI_THINKING_BUDGET } from '../config.ts';
import { z } from 'zod';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

let ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!ai) {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY or GOOGLE_GENAI_API_KEY environment variable not set');
    }
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return ai;
}

function normalize(input: string | Content[]): Content[] {
  return typeof input === 'string' ? [{ role: 'user', parts: [{ text: input }] }] : input;
}

export async function generateGeminiContent({
  model,
  contents,
}: {
  model: string;
  contents: string | Content[];
}): Promise<string> {
  const normalized = normalize(contents);
  const result = await getAI().models.generateContent({
    model,
    contents: normalized,
    config: {
      thinkingConfig: { thinkingBudget: GENAI_THINKING_BUDGET },
    },
  });

  return result.text ?? '';
}

export async function generateObject<T>({
  model,
  messages,
  schema,
  system,
}: {
  model: string;
  messages: { role: string; content: string }[];
  schema: z.ZodSchema<T>;
  system?: string;
}): Promise<T> {
  // Convert messages to Content format
  const contents: Content[] = [];
  
  if (system) {
    contents.push({ role: 'model', parts: [{ text: system }] });
  }
  
  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: msg.content }] });
  }
  
  // Add instruction to return JSON
  const lastContent = contents[contents.length - 1];
  if (lastContent && lastContent.role === 'user' && lastContent.parts && lastContent.parts[0]) {
    // Add schema description to help the model understand the expected format
    const schemaDesc = schema._def.description || 'the expected structure';
    lastContent.parts[0].text += `\n\nIMPORTANT: Return your response as a valid JSON object only. Do not include any markdown formatting or explanations. The JSON should match ${schemaDesc}.`;
  }
  
  const result = await getAI().models.generateContent({
    model,
    contents,
  });
  
  const text = result.text ?? '{}';
  
  try {
    // First try to parse the raw response
    const parsed = JSON.parse(text);
    return schema.parse(parsed);
  } catch (error) {
    // If that fails, try to extract JSON from the response
    // Try to find JSON in code blocks first
    let jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1];
    
    // If not found, try to find any JSON object
    if (!jsonMatch) {
      jsonMatch = text.match(/\{[\s\S]*\}/)?.[0];
    }
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch.trim());
        return schema.parse(parsed);
      } catch (innerError) {
        // Log for debugging
        console.error('Failed to parse extracted JSON:', innerError);
        console.error('JSON string:', jsonMatch.substring(0, 500));
      }
    }
    throw new Error(`Failed to parse response as valid JSON: ${error}\nOriginal text: ${text.substring(0, 500)}`);
  }
}
