/**
 * Gemini API Connection Manager with advanced resilience patterns
 * Implements connection pooling, rate limiting, circuit breaker, and retry logic
 */

import { GoogleGenAI } from '@google/genai';
import { CodeLoopsLogger, createLogger } from '../logger.ts';
import { EventEmitter } from 'node:events';
import { GEMINI_CONNECTION_CONFIG } from '../config.ts';

// Configuration interfaces
export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  burstSize: number;
  queueTimeout: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
  monitoringPeriod: number;
}

export interface ConnectionPoolConfig {
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  keepAlive: boolean;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

// Default configurations
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  burstSize: 10,
  queueTimeout: 30000, // 30 seconds
};

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  halfOpenRequests: 3,
  monitoringPeriod: 120000, // 2 minutes
};

const DEFAULT_CONNECTION_POOL: ConnectionPoolConfig = {
  maxConnections: 5,
  connectionTimeout: 10000, // 10 seconds
  idleTimeout: 300000, // 5 minutes
  keepAlive: true,
};

const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableErrors: ['DEADLINE_EXCEEDED', 'UNAVAILABLE', 'INTERNAL', 'RESOURCE_EXHAUSTED'],
};

// Circuit breaker states
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

// Request priority levels
export enum RequestPriority {
  HIGH = 0,
  NORMAL = 1,
  LOW = 2,
}

// Request queue item
interface QueuedRequest<T> {
  id: string;
  priority: RequestPriority;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
  retryCount: number;
}

// Connection pool item
interface PooledConnection {
  client: GoogleGenAI;
  lastUsed: number;
  inUse: boolean;
  requestCount: number;
}

// Rate limiter token bucket
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens: number = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = (elapsed / 1000) * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

// Circuit breaker implementation
class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private successCount: number = 0;
  private readonly config: CircuitBreakerConfig;
  private readonly logger: CodeLoopsLogger;
  private readonly emitter: EventEmitter;

  constructor(config: CircuitBreakerConfig, logger: CodeLoopsLogger) {
    this.config = config;
    this.logger = logger;
    this.emitter = new EventEmitter();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.transitionToHalfOpen();
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenRequests) {
        this.transitionToClosed();
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.transitionToOpen();
    }
  }

  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.logger.warn('Circuit breaker transitioned to OPEN state');
    this.emitter.emit('stateChange', CircuitState.OPEN);
  }

  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.logger.info('Circuit breaker transitioned to HALF_OPEN state');
    this.emitter.emit('stateChange', CircuitState.HALF_OPEN);
  }

  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.logger.info('Circuit breaker transitioned to CLOSED state');
    this.emitter.emit('stateChange', CircuitState.CLOSED);
  }

  getState(): CircuitState {
    return this.state;
  }

  /**
   * Manually reset the circuit breaker to CLOSED state
   * This can be used to recover from OPEN state without waiting for the timeout
   */
  reset(): void {
    const previousState = this.state;
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    
    this.logger.info(`Circuit breaker manually reset from ${previousState} to CLOSED state`);
    this.emitter.emit('stateChange', CircuitState.CLOSED);
    this.emitter.emit('manualReset', { previousState, timestamp: Date.now() });
  }

  /**
   * Get detailed circuit breaker status including failure counts and timing
   */
  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      timeSinceLastFailure: this.lastFailureTime > 0 ? Date.now() - this.lastFailureTime : 0,
      config: this.config
    };
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.on(event, listener);
  }
}

// Main connection manager
export class GeminiConnectionManager {
  private readonly logger: CodeLoopsLogger;
  private readonly connectionPool: PooledConnection[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly requestQueue: QueuedRequest<any>[] = [];
  private readonly minuteBucket: TokenBucket;
  private readonly hourBucket: TokenBucket;
  private readonly circuitBreaker: CircuitBreaker;
  
  private readonly rateLimitConfig: RateLimitConfig;
  private readonly circuitBreakerConfig: CircuitBreakerConfig;
  private readonly connectionPoolConfig: ConnectionPoolConfig;
  private readonly retryConfig: RetryConfig;
  
  private processing = false;
  private maintenanceIntervals: NodeJS.Timeout[] = [];
  private metrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    retries: 0,
    queuedRequests: 0,
    averageLatency: 0,
  };

  constructor(
    apiKey: string,
    options: {
      rateLimit?: Partial<RateLimitConfig>;
      circuitBreaker?: Partial<CircuitBreakerConfig>;
      connectionPool?: Partial<ConnectionPoolConfig>;
      retry?: Partial<RetryConfig>;
      logger?: CodeLoopsLogger;
    } = {}
  ) {
    this.logger = options.logger || createLogger({ withDevStdout: true });
    
    // Initialize configurations
    this.rateLimitConfig = { ...DEFAULT_RATE_LIMIT, ...options.rateLimit };
    this.circuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER, ...options.circuitBreaker };
    this.connectionPoolConfig = { ...DEFAULT_CONNECTION_POOL, ...options.connectionPool };
    this.retryConfig = { ...DEFAULT_RETRY, ...options.retry };
    
    // Initialize rate limiters
    this.minuteBucket = new TokenBucket(
      this.rateLimitConfig.burstSize,
      this.rateLimitConfig.requestsPerMinute / 60
    );
    this.hourBucket = new TokenBucket(
      this.rateLimitConfig.requestsPerHour,
      this.rateLimitConfig.requestsPerHour / 3600
    );
    
    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(this.circuitBreakerConfig, this.logger);
    
    // Initialize connection pool
    this.initializeConnectionPool(apiKey);
    
    // Start background tasks
    this.startMaintenanceTasks();
  }

  private initializeConnectionPool(apiKey: string): void {
    for (let i = 0; i < this.connectionPoolConfig.maxConnections; i++) {
      this.connectionPool.push({
        client: new GoogleGenAI({ apiKey }),
        lastUsed: Date.now(),
        inUse: false,
        requestCount: 0,
      });
    }
  }

  private startMaintenanceTasks(): void {
    // Clean up idle connections
    const idleInterval = setInterval(() => {
      const now = Date.now();
      for (const conn of this.connectionPool) {
        if (!conn.inUse && now - conn.lastUsed > this.connectionPoolConfig.idleTimeout) {
          // Reset connection
          conn.requestCount = 0;
          this.logger.debug('Reset idle connection');
        }
      }
    }, 60000); // Every minute
    this.maintenanceIntervals.push(idleInterval);

    // Log metrics
    const metricsInterval = setInterval(() => {
      this.logger.info({ metrics: this.metrics }, 'Connection manager metrics');
    }, 300000); // Every 5 minutes
    this.maintenanceIntervals.push(metricsInterval);
  }

  /**
   * Execute a Gemini API request with full resilience patterns
   */
  async execute<T>(
    operation: (client: GoogleGenAI) => Promise<T>,
    options: {
      priority?: RequestPriority;
      retryable?: boolean;
      timeout?: number;
    } = {}
  ): Promise<T> {
    const {
      priority = RequestPriority.NORMAL,
      retryable = true,
      timeout = this.connectionPoolConfig.connectionTimeout,
    } = options;

    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: requestId,
        priority,
        execute: () => this.executeWithResilience(operation, retryable, timeout),
        resolve,
        reject,
        timestamp: Date.now(),
        retryCount: 0,
      };

      this.enqueueRequest(request);
    });
  }

  private enqueueRequest<T>(request: QueuedRequest<T>): void {
    // Add to queue based on priority
    const insertIndex = this.requestQueue.findIndex(
      (item) => item.priority > request.priority
    );
    
    if (insertIndex === -1) {
      this.requestQueue.push(request);
    } else {
      this.requestQueue.splice(insertIndex, 0, request);
    }
    
    this.metrics.queuedRequests = this.requestQueue.length;
    
    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      // Check rate limits
      if (!this.checkRateLimits()) {
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const request = this.requestQueue.shift()!;
      this.metrics.queuedRequests = this.requestQueue.length;

      // Check if request has timed out in queue
      if (Date.now() - request.timestamp > this.rateLimitConfig.queueTimeout) {
        request.reject(new Error('Request timed out in queue'));
        continue;
      }

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error as Error);
      }
    }

    this.processing = false;
  }

  private checkRateLimits(): boolean {
    return this.minuteBucket.tryConsume() && this.hourBucket.tryConsume();
  }

  private async executeWithResilience<T>(
    operation: (client: GoogleGenAI) => Promise<T>,
    retryable: boolean,
    timeout: number
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | null = null;
    
    // Increment total requests at the start
    this.metrics.totalRequests++;
    
    for (let attempt = 0; attempt <= (retryable ? this.retryConfig.maxRetries : 0); attempt++) {
      try {
        // Execute through circuit breaker
        const result = await this.circuitBreaker.execute(async () => {
          // Get connection from pool
          const connection = await this.getConnection();
          
          try {
            // Execute with timeout
            const result = await Promise.race([
              operation(connection.client),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout')), timeout)
              ),
            ]);
            
            // Update success metrics
            this.metrics.successfulRequests++;
            const latency = Date.now() - startTime;
            this.metrics.averageLatency =
              (this.metrics.averageLatency * (this.metrics.totalRequests - 1) + latency) /
              this.metrics.totalRequests;
            
            return result;
          } finally {
            // Release connection back to pool
            this.releaseConnection(connection);
          }
        });
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (!retryable || !this.isRetryableError(error as Error)) {
          this.metrics.failedRequests++;
          throw error;
        }
        
        // Calculate retry delay with exponential backoff
        if (attempt < this.retryConfig.maxRetries) {
          this.metrics.retries++;
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
            this.retryConfig.maxDelay
          );
          
          // Add jitter to prevent thundering herd
          const jitter = Math.random() * 0.3 * delay;
          
          this.logger.debug(
            { attempt, delay: delay + jitter, error: lastError.message },
            'Retrying request'
          );
          
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }
      }
    }
    
    // If we get here, the request failed after all retries
    this.metrics.failedRequests++;
    throw lastError || new Error('Request failed');
  }

  private async getConnection(): Promise<PooledConnection> {
    // Try to find an available connection
    for (const conn of this.connectionPool) {
      if (!conn.inUse) {
        conn.inUse = true;
        conn.lastUsed = Date.now();
        conn.requestCount++;
        return conn;
      }
    }
    
    // All connections in use, wait for one to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const conn of this.connectionPool) {
          if (!conn.inUse) {
            clearInterval(checkInterval);
            conn.inUse = true;
            conn.lastUsed = Date.now();
            conn.requestCount++;
            resolve(conn);
            return;
          }
        }
      }, 100);
    });
  }

  private releaseConnection(connection: PooledConnection): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();
  }

  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message || '';
    return this.retryConfig.retryableErrors.some((retryableError) =>
      errorMessage.includes(retryableError)
    );
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      circuitBreakerState: this.circuitBreaker.getState(),
      availableTokensMinute: this.minuteBucket.getAvailableTokens(),
      availableTokensHour: this.hourBucket.getAvailableTokens(),
      activeConnections: this.connectionPool.filter((c) => c.inUse).length,
      queueLength: this.requestQueue.length,
    };
  }

  /**
   * Get detailed circuit breaker status
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Manually reset the circuit breaker to recover from OPEN state
   * This should be used when you're confident the underlying issue has been resolved
   */
  resetCircuitBreaker(): { success: boolean; previousState: string; message: string } {
    const previousState = this.circuitBreaker.getState();
    
    try {
      this.circuitBreaker.reset();
      const message = `Circuit breaker successfully reset from ${previousState} to CLOSED`;
      this.logger.info(message);
      return {
        success: true,
        previousState,
        message
      };
    } catch (error) {
      const message = `Failed to reset circuit breaker: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      return {
        success: false,
        previousState,
        message
      };
    }
  }

  /**
   * Gracefully shutdown the connection manager
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down connection manager');
    
    // Clear all maintenance intervals
    for (const interval of this.maintenanceIntervals) {
      clearInterval(interval);
    }
    this.maintenanceIntervals = [];
    
    // Stop processing new requests
    this.processing = false;
    
    // Reject all queued requests
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()!;
      request.reject(new Error('Connection manager shutting down'));
    }
    
    // Wait for active connections to complete with timeout
    const shutdownTimeout = 5000; // 5 seconds
    const startTime = Date.now();
    
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        const activeConnections = this.connectionPool.filter((c) => c.inUse).length;
        if (activeConnections === 0 || Date.now() - startTime > shutdownTimeout) {
          clearInterval(checkInterval);
          if (activeConnections > 0) {
            this.logger.warn(`Shutdown timeout reached with ${activeConnections} active connections`);
            // Force release all connections
            for (const conn of this.connectionPool) {
              conn.inUse = false;
            }
          }
          resolve();
        }
      }, 100);
    });
    
    this.logger.info('Connection manager shutdown complete');
  }
}

// Export singleton factory
let connectionManager: GeminiConnectionManager | null = null;

export function getConnectionManager(apiKey?: string): GeminiConnectionManager {
  if (!connectionManager) {
    if (!apiKey) {
      // Check for unified CODELOOPS_KEY first, then fallback to provider-specific keys
      const codeloopsKey = process.env.CODELOOPS_KEY;
      const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
      
      apiKey = codeloopsKey || geminiKey;
      
      // Safe logging for debugging - log which key source was used and first 8 chars
      const logger = createLogger({ withDevStdout: true });
      if (codeloopsKey) {
        logger.info(`Using CODELOOPS_KEY: ${codeloopsKey.substring(0, 8)}...`);
      } else if (geminiKey) {
        const keySource = process.env.GOOGLE_GENAI_API_KEY ? 'GOOGLE_GENAI_API_KEY' : 'GEMINI_API_KEY';
        logger.info(`Using ${keySource}: ${geminiKey.substring(0, 8)}...`);
      }
      
      if (!apiKey) {
        const instructionalMessage = `
🔑 API Key Configuration Required

To use codeloops multi-critic consensus system, you need to configure an API key.

Option 1 - Unified Configuration (Recommended):
  Set CODELOOPS_KEY environment variable with your API key
  Set CODELOOPS_MODEL=gemini (or claude/openai for future support)

Option 2 - Provider-specific Configuration:
  Set GOOGLE_GENAI_API_KEY environment variable with your Gemini API key

Example .env file:
  CODELOOPS_MODEL=gemini
  CODELOOPS_KEY=your-api-key-here
  # OR
  GOOGLE_GENAI_API_KEY=your-api-key-here

Get a Gemini API key at: https://ai.google.dev/

Without an API key, the system will fall back to single-critic mode.
        `.trim();
        
        throw new Error(instructionalMessage);
      }
    }
    connectionManager = new GeminiConnectionManager(apiKey, {
      rateLimit: GEMINI_CONNECTION_CONFIG.rateLimit,
      circuitBreaker: GEMINI_CONNECTION_CONFIG.circuitBreaker,
      connectionPool: GEMINI_CONNECTION_CONFIG.connectionPool,
      retry: GEMINI_CONNECTION_CONFIG.retry,
    });
  }
  return connectionManager;
}

// For testing and recovery purposes
export async function resetConnectionManager(): Promise<void> {
  if (connectionManager) {
    await connectionManager.shutdown();
    connectionManager = null;
  }
}

/**
 * Reset the circuit breaker without shutting down the connection manager
 * Useful for recovery from OPEN circuit breaker state
 */
export function resetCircuitBreaker(): { success: boolean; previousState: string; message: string } {
  if (!connectionManager) {
    return {
      success: false,
      previousState: 'unknown',
      message: 'Connection manager not initialized'
    };
  }
  
  return connectionManager.resetCircuitBreaker();
}