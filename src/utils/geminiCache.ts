import { type Content } from '@google/genai';
import { GEMINI_CACHE_TTL } from '../config.ts';
import { getConnectionManager, RequestPriority } from './GeminiConnectionManager.ts';

// Note: Connection management now handled by GeminiConnectionManager

const promptCache = new Map<string, string>();

export async function getCacheId(prompt: string, ttl: number = GEMINI_CACHE_TTL): Promise<string> {
  if (promptCache.has(prompt)) {
    return promptCache.get(prompt)!;
  }

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
  const connectionManager = getConnectionManager();
  
  const response = await connectionManager.execute(
    async (client) => {
      return await client.caches.create({
        model: 'gemini-2.5-flash-preview-05-20',
        config: {
          contents,
          ttl: `${ttl}s`,
          displayName: `prompt-${Math.random().toString(36).slice(2)}`,
        },
      });
    },
    { priority: RequestPriority.LOW } // Cache creation is lower priority
  );

  const cacheId = response.name as string;
  promptCache.set(prompt, cacheId);
  return cacheId;
}
