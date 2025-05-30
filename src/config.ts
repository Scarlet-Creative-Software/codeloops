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
  process.env.CRITIC_MAX_TOKENS ?? '2000',
  10,
);
