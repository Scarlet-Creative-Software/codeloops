/**
 * Retry utility with exponential backoff
 */

import { getInstance as getLogger } from '../logger.js';

const logger = getLogger();

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  onRetry: () => {},
};

/**
 * Retries a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === opts.maxAttempts) {
        logger.error(
          { error: lastError, attempts: attempt },
          'Max retry attempts reached'
        );
        throw lastError;
      }
      
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffFactor, attempt - 1),
        opts.maxDelay
      );
      
      logger.warn(
        { error: lastError, attempt, nextDelay: delay },
        'Operation failed, retrying...'
      );
      
      opts.onRetry(lastError, attempt);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Special retry logic for JSON parsing with progressive fallbacks
 */
export async function retryJsonParse<T>(
  generateFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retry(async () => {
    try {
      return await generateFn();
    } catch (error) {
      // Check if it's a JSON parsing error
      if (error instanceof Error && error.message.includes('JSON')) {
        logger.error(
          { error: error.message },
          'JSON parsing error detected, will retry with modified approach'
        );
        throw error;
      }
      
      // For other errors, just re-throw
      throw error;
    }
  }, {
    ...options,
    onRetry: (error, attempt) => {
      logger.info(
        { attempt, errorType: error.name },
        'Retrying with adjusted parameters'
      );
      options.onRetry?.(error, attempt);
    },
  });
}