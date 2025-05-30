import { z } from 'zod';

// Helper type for deep partial objects
export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

// System configuration
export const SystemConfigSchema = z.object({
  dataDir: z.string().default('./data'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logFile: z.string().optional(),
  maxLogSize: z.number().default(10 * 1024 * 1024), // 10MB
  enableTelemetry: z.boolean().default(false),
});

// Model provider configuration
export const ModelConfigSchema = z.object({
  // Google Gemini settings
  gemini: z.object({
    apiKey: z.string().optional(),
    model: z.string().default('gemini-2.5-flash-preview-05-20'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().default(8192),
    topP: z.number().min(0).max(1).default(0.9),
    topK: z.number().min(1).default(40),
    timeout: z.number().default(30000),
    retryAttempts: z.number().default(3),
    retryDelay: z.number().default(1000),
  }).default({}),
  
  // Ollama settings
  ollama: z.object({
    baseUrl: z.string().url().optional(),
    model: z.string().default('llama2'),
    timeout: z.number().default(60000),
  }).default({}),
});

// Agent configuration
export const AgentConfigSchema = z.object({
  critic: z.object({
    baseUrl: z.string().url().optional(),
    timeout: z.number().default(120000),
    maxRetries: z.number().default(3),
  }).default({}),
  
  summarize: z.object({
    baseUrl: z.string().url().optional(),
    timeout: z.number().default(60000),
    maxRetries: z.number().default(3),
  }).default({}),
});

// Engine configuration
export const EngineConfigSchema = z.object({
  actorCritic: z.object({
    maxIterations: z.number().default(10),
    convergenceThreshold: z.number().default(0.95),
    enableMultiCritic: z.boolean().default(true),
    criticTimeout: z.number().default(120000),
  }).default({}),
  
  knowledgeGraph: z.object({
    maxNodes: z.number().default(10000),
    maxEdgesPerNode: z.number().default(50),
    enableCycleDetection: z.boolean().default(true),
    indexCacheSize: z.number().default(1000),
  }).default({}),
  
  keyMemory: z.object({
    maxMemoriesPerCritic: z.number().default(10),
    memoryLifespan: z.number().default(10),
    enableAutoEviction: z.boolean().default(true),
  }).default({}),
});

// Performance configuration
export const PerformanceConfigSchema = z.object({
  cache: z.object({
    enabled: z.boolean().default(true),
    ttl: z.number().default(3600000), // 1 hour
    maxSize: z.number().default(100),
    strategy: z.enum(['lru', 'lfu', 'fifo']).default('lru'),
  }).default({}),
  
  connectionPool: z.object({
    maxConnections: z.number().default(10),
    idleTimeout: z.number().default(60000),
    connectionTimeout: z.number().default(5000),
  }).default({}),
});

// Complete configuration schema
export const ConfigurationSchema = z.object({
  system: SystemConfigSchema,
  model: ModelConfigSchema,
  agent: AgentConfigSchema,
  engine: EngineConfigSchema,
  performance: PerformanceConfigSchema,
});

// Type exports
export type SystemConfig = z.infer<typeof SystemConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type EngineConfig = z.infer<typeof EngineConfigSchema>;
export type PerformanceConfig = z.infer<typeof PerformanceConfigSchema>;
export type Configuration = z.infer<typeof ConfigurationSchema>;

// Hot-reloadable settings (safe to change at runtime)
export const HotReloadableSettings = [
  'system.logLevel',
  'model.gemini.temperature',
  'model.gemini.topP',
  'model.gemini.topK',
  'engine.actorCritic.enableMultiCritic',
  'engine.knowledgeGraph.enableCycleDetection',
  'performance.cache.enabled',
  'performance.cache.ttl',
];