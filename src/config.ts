import path from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Path Configuration ----------------------------------------------------------
// -----------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow overriding data directory via environment variable
// This enables project-specific data storage when using codeloops globally
export const dataDir = process.env.CODELOOPS_DATA_DIR 
  ? path.resolve(process.cwd(), process.env.CODELOOPS_DATA_DIR)
  : path.resolve(__dirname, '..', 'data');

// -----------------------------------------------------------------------------
// Gemini Configuration --------------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Default cache TTL (in seconds) for Gemini context caching.
 * Configurable via the GEMINI_CACHE_TTL environment variable.
 */
export const GEMINI_CACHE_TTL = Number.parseInt(process.env.GEMINI_CACHE_TTL ?? '600', 10);

/**
 * Default thinking budget (in tokens) for Gemini / Google GenAI models.
 * Set via the GENAI_THINKING_BUDGET environment variable.
 */
export const GENAI_THINKING_BUDGET = Number.parseInt(
  process.env.GENAI_THINKING_BUDGET ?? '500',
  10,
);

// -----------------------------------------------------------------------------
// Multi-Critic Configuration --------------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Validates and clamps temperature values to the valid range [0.0, 1.0]
 */
function validateTemperature(value: number, name: string): number {
  if (isNaN(value)) {
    console.warn(`Invalid temperature value for ${name}, using default 0.3`);
    return 0.3;
  }
  
  if (value < 0.0 || value > 1.0) {
    const clamped = Math.max(0.0, Math.min(1.0, value));
    console.warn(`Temperature ${name}=${value} is out of range [0.0, 1.0], clamped to ${clamped}`);
    return clamped;
  }
  
  return value;
}

/**
 * Temperature settings for multi-critic system.
 * Lower temperatures (0.0-0.5) produce more deterministic, focused responses.
 * Higher temperatures (0.5-1.0) produce more creative, varied responses.
 * For code review tasks, lower temperatures are recommended.
 */
export const CRITIC_TEMPERATURES = {
  correctness: validateTemperature(
    Number.parseFloat(process.env.CRITIC_TEMP_CORRECTNESS ?? '0.3'),
    'CRITIC_TEMP_CORRECTNESS'
  ),
  efficiency: validateTemperature(
    Number.parseFloat(process.env.CRITIC_TEMP_EFFICIENCY ?? '0.4'),
    'CRITIC_TEMP_EFFICIENCY'
  ),
  security: validateTemperature(
    Number.parseFloat(process.env.CRITIC_TEMP_SECURITY ?? '0.3'),
    'CRITIC_TEMP_SECURITY'
  ),
  default: validateTemperature(
    Number.parseFloat(process.env.CRITIC_TEMP_DEFAULT ?? '0.3'),
    'CRITIC_TEMP_DEFAULT'
  ),
};

/**
 * Maximum tokens for critic responses.
 * Configurable via CRITIC_MAX_TOKENS environment variable.
 */
export const CRITIC_MAX_TOKENS = Number.parseInt(
  process.env.CRITIC_MAX_TOKENS ?? '6000',
  10,
);

// -----------------------------------------------------------------------------
// Gemini API Connection Configuration -----------------------------------------
// -----------------------------------------------------------------------------

/**
 * Connection pool and resilience settings for Gemini API.
 * These settings control rate limiting, circuit breaker behavior,
 * connection pooling, and retry logic.
 */
export const GEMINI_CONNECTION_CONFIG = {
  rateLimit: {
    requestsPerMinute: Number.parseInt(process.env.GEMINI_RATE_LIMIT_PER_MINUTE ?? '60', 10),
    requestsPerHour: Number.parseInt(process.env.GEMINI_RATE_LIMIT_PER_HOUR ?? '1000', 10),
    burstSize: Number.parseInt(process.env.GEMINI_BURST_SIZE ?? '10', 10),
    queueTimeout: Number.parseInt(process.env.GEMINI_QUEUE_TIMEOUT ?? '30000', 10),
  },
  circuitBreaker: {
    failureThreshold: Number.parseInt(process.env.GEMINI_CIRCUIT_FAILURE_THRESHOLD ?? '5', 10),
    resetTimeout: Number.parseInt(process.env.GEMINI_CIRCUIT_RESET_TIMEOUT ?? '60000', 10),
    halfOpenRequests: Number.parseInt(process.env.GEMINI_CIRCUIT_HALF_OPEN_REQUESTS ?? '3', 10),
    monitoringPeriod: Number.parseInt(process.env.GEMINI_CIRCUIT_MONITORING_PERIOD ?? '120000', 10),
  },
  connectionPool: {
    maxConnections: Number.parseInt(process.env.GEMINI_MAX_CONNECTIONS ?? '5', 10),
    connectionTimeout: Number.parseInt(process.env.GEMINI_CONNECTION_TIMEOUT ?? '10000', 10),
    idleTimeout: Number.parseInt(process.env.GEMINI_IDLE_TIMEOUT ?? '300000', 10),
    keepAlive: process.env.GEMINI_KEEP_ALIVE !== 'false',
  },
  retry: {
    maxRetries: Number.parseInt(process.env.GEMINI_MAX_RETRIES ?? '3', 10),
    baseDelay: Number.parseInt(process.env.GEMINI_RETRY_BASE_DELAY ?? '1000', 10),
    maxDelay: Number.parseInt(process.env.GEMINI_RETRY_MAX_DELAY ?? '30000', 10),
    backoffMultiplier: Number.parseFloat(process.env.GEMINI_RETRY_BACKOFF_MULTIPLIER ?? '2'),
  },
};
