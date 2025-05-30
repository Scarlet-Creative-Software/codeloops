import { getConfigurationManager, getConfig } from './index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Provides compatibility layer for legacy config.ts imports
 */

// Path Configuration
export const dataDir = (() => {
  try {
    return getConfig<string>('system.dataDir');
  } catch {
    // Fallback to legacy behavior
    return process.env.CODELOOPS_DATA_DIR 
      ? path.resolve(process.cwd(), process.env.CODELOOPS_DATA_DIR)
      : path.resolve(__dirname, '../..', 'data');
  }
})();

// Gemini Configuration
export const GEMINI_CACHE_TTL = (() => {
  try {
    return getConfig<number>('performance.cache.ttl') / 1000; // Convert ms to seconds
  } catch {
    return Number.parseInt(process.env.GEMINI_CACHE_TTL ?? '600', 10);
  }
})();

export const GENAI_THINKING_BUDGET = (() => {
  try {
    return getConfig<number>('model.gemini.maxTokens');
  } catch {
    return Number.parseInt(process.env.GENAI_THINKING_BUDGET ?? '500', 10);
  }
})();

// Multi-Critic Configuration
export const CRITIC_TEMPERATURES = (() => {
  try {
    const defaultTemp = getConfig<number>('model.gemini.temperature');
    return {
      correctness: Number.parseFloat(process.env.CRITIC_TEMP_CORRECTNESS ?? String(defaultTemp)),
      efficiency: Number.parseFloat(process.env.CRITIC_TEMP_EFFICIENCY ?? String(defaultTemp)),
      security: Number.parseFloat(process.env.CRITIC_TEMP_SECURITY ?? String(defaultTemp)),
      default: defaultTemp,
    };
  } catch {
    return {
      correctness: 0.3,
      efficiency: 0.4,
      security: 0.3,
      default: 0.3,
    };
  }
})();

export const CRITIC_MAX_TOKENS = (() => {
  try {
    return getConfig<number>('model.gemini.maxTokens');
  } catch {
    return Number.parseInt(process.env.CRITIC_MAX_TOKENS ?? '6000', 10);
  }
})();

// Gemini API Connection Configuration
export const GEMINI_CONNECTION_CONFIG = (() => {
  try {
    const config = getConfigurationManager().getAll();
    return {
      rateLimit: {
        requestsPerMinute: Number.parseInt(process.env.GEMINI_RATE_LIMIT_PER_MINUTE ?? '60', 10),
        requestsPerHour: Number.parseInt(process.env.GEMINI_RATE_LIMIT_PER_HOUR ?? '1000', 10),
        burstSize: Number.parseInt(process.env.GEMINI_BURST_SIZE ?? '10', 10),
        queueTimeout: config.model.gemini.timeout,
      },
      circuitBreaker: {
        failureThreshold: Number.parseInt(process.env.GEMINI_CIRCUIT_FAILURE_THRESHOLD ?? '5', 10),
        resetTimeout: Number.parseInt(process.env.GEMINI_CIRCUIT_RESET_TIMEOUT ?? '60000', 10),
        halfOpenRequests: Number.parseInt(process.env.GEMINI_CIRCUIT_HALF_OPEN_REQUESTS ?? '3', 10),
        monitoringPeriod: Number.parseInt(process.env.GEMINI_CIRCUIT_MONITORING_PERIOD ?? '120000', 10),
      },
      connectionPool: {
        maxConnections: config.performance.connectionPool.maxConnections,
        connectionTimeout: config.performance.connectionPool.connectionTimeout,
        idleTimeout: config.performance.connectionPool.idleTimeout,
        keepAlive: process.env.GEMINI_KEEP_ALIVE !== 'false',
      },
      retry: {
        maxRetries: config.model.gemini.retryAttempts,
        baseDelay: config.model.gemini.retryDelay,
        maxDelay: Number.parseInt(process.env.GEMINI_RETRY_MAX_DELAY ?? '30000', 10),
        backoffMultiplier: Number.parseFloat(process.env.GEMINI_RETRY_BACKOFF_MULTIPLIER ?? '2'),
      },
    };
  } catch {
    // Fallback to legacy defaults
    return {
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        burstSize: 10,
        queueTimeout: 30000,
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
        halfOpenRequests: 3,
        monitoringPeriod: 120000,
      },
      connectionPool: {
        maxConnections: 5,
        connectionTimeout: 10000,
        idleTimeout: 300000,
        keepAlive: true,
      },
      retry: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
    };
  }
})();