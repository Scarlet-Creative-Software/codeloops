import { GoogleGenAI, type Content } from '@google/genai';
import { GEMINI_CACHE_TTL } from '../config.ts';

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

const promptCache = new Map<string, string>();

export async function getCacheId(prompt: string, ttl: number = GEMINI_CACHE_TTL): Promise<string> {
  if (promptCache.has(prompt)) {
    return promptCache.get(prompt)!;
  }

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
  const response = await getAI().caches.create({
    model: 'gemini-2.5-flash-preview-05-20',
    config: {
      contents,
      ttl: `${ttl}s`,
      displayName: `prompt-${Math.random().toString(36).slice(2)}`,
    },
  });

  const cacheId = response.name as string;
  promptCache.set(prompt, cacheId);
  return cacheId;
}
