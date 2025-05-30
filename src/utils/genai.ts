import { GoogleGenAI, type Content } from '@google/genai';
import { GENAI_THINKING_BUDGET } from '../config.ts';
import { z } from 'zod';
// Note: Gemini API structured output support

// Helper to generate example JSON from Zod schema
function getZodExample(schema: z.ZodType<unknown>): unknown {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const example: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      example[key] = getZodExample(value as z.ZodType<unknown>);
    }
    return example;
  }
  
  if (schema instanceof z.ZodArray) {
    return [getZodExample(schema.element)];
  }
  
  if (schema instanceof z.ZodString) {
    return "string";
  }
  
  if (schema instanceof z.ZodNumber) {
    return 0;
  }
  
  if (schema instanceof z.ZodBoolean) {
    return true;
  }
  
  if (schema instanceof z.ZodEnum) {
    return schema.options[0];
  }
  
  if (schema instanceof z.ZodOptional) {
    return getZodExample(schema.unwrap());
  }
  
  return "unknown";
}

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
  generationConfig,
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
  
  // For now, use the prompt-based approach until we can properly convert Zod to Gemini schema
  // Add instruction to return JSON
  const lastContent = contents[contents.length - 1];
  if (lastContent && lastContent.role === 'user' && lastContent.parts && lastContent.parts[0]) {
    lastContent.parts[0].text += `\n\nReturn your response as a valid JSON object matching this structure:\n${JSON.stringify(getZodExample(schema), null, 2)}\n\nRespond ONLY with valid JSON, no markdown formatting or explanations.`;
  }
  
  const result = await getAI().models.generateContent({
    model,
    contents,
    config: generationConfig,
  });
  
  const text = result.text ?? '{}';
  
  try {
    // First try to parse the raw response
    const parsed = JSON.parse(text);
    return schema.parse(parsed);
  } catch (error) {
    // If that fails, try to extract JSON from the response
    let jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1];
    
    if (!jsonMatch) {
      jsonMatch = text.match(/\{[\s\S]*\}/)?.[0];
    }
    
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch.trim());
        return schema.parse(parsed);
      } catch (innerError) {
        console.error('Failed to parse extracted JSON:', innerError);
        console.error('JSON string:', jsonMatch.substring(0, 500));
      }
    }
    throw new Error(`Failed to parse response as valid JSON: ${error}\nOriginal text: ${text.substring(0, 500)}`);
  }
}
