import { type Content } from '@google/genai';
import { GENAI_THINKING_BUDGET } from '../config.ts';
import { z } from 'zod';
import { getConnectionManager, RequestPriority } from './GeminiConnectionManager.ts';
import { zodToJsonSchema } from 'zod-to-json-schema';
// Note: Gemini API structured output support

// Note: getZodExample removed since we now use native structured output

// Legacy getAI functions removed - all API calls now go through GeminiConnectionManager

function normalize(input: string | Content[]): Content[] {
  return typeof input === 'string' ? [{ role: 'user', parts: [{ text: input }] }] : input;
}

export async function generateGeminiContent({
  model,
  contents,
  priority = RequestPriority.NORMAL,
}: {
  model: string;
  contents: string | Content[];
  priority?: RequestPriority;
}): Promise<string> {
  const normalized = normalize(contents);
  const connectionManager = getConnectionManager();
  
  const result = await connectionManager.execute(
    async (client) => {
      return await client.models.generateContent({
        model,
        contents: normalized,
        config: {
          thinkingConfig: { thinkingBudget: GENAI_THINKING_BUDGET },
        },
      });
    },
    { priority }
  );

  return result.text ?? '';
}

export async function generateObject<T>({
  model,
  messages,
  schema,
  system,
  generationConfig,
  priority = RequestPriority.NORMAL,
  timeout,
}: {
  model: string;
  messages: { role: string; content: string }[];
  schema: z.ZodSchema<T>;
  system?: string;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topK?: number;
    topP?: number;
  };
  priority?: RequestPriority;
  timeout?: number;
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
  
  // Convert Zod schema to JSON Schema for Gemini's responseSchema
  // Don't pass a name to avoid $ref and definitions which Gemini doesn't support
  const jsonSchema = zodToJsonSchema(schema);
  
  const connectionManager = getConnectionManager();
  const result = await connectionManager.execute(
    async (client) => {
      return await client.models.generateContent({
        model,
        contents,
        config: {
          ...generationConfig,
          responseMimeType: 'application/json',
          responseSchema: jsonSchema,
          thinkingConfig: { thinkingBudget: GENAI_THINKING_BUDGET },
        },
      });
    },
    { priority, timeout }
  );
  
  const text = result.text ?? '{}';
  
  try {
    // With structured output, response should be valid JSON
    const parsed = JSON.parse(text);
    return schema.parse(parsed);
  } catch (error) {
    // Fallback parsing for backward compatibility
    let jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1];
    
    if (!jsonMatch) {
      jsonMatch = text.match(/\{[\s\S]*\}/)?.[0];
    }
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch.trim());
        return schema.parse(parsed);
      } catch {
        // Failed to parse extracted JSON - continue to throw main error
      }
    }
    throw new Error(`Failed to parse response as valid JSON: ${error}\nOriginal text: ${text.substring(0, 500)}`);
  }
}
