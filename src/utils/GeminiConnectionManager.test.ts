import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiConnectionManager, RequestPriority, getConnectionManager, resetConnectionManager } from './GeminiConnectionManager.js';

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn().mockResolvedValue({ 
        text: 'test response',
        response: {
          text: () => 'test response'
        }
      }),
    },
    caches: {
      create: vi.fn().mockResolvedValue({ name: 'cache-123' }),
    },
  })),
}));

describe('GeminiConnectionManager', () => {
  let manager: GeminiConnectionManager;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    manager = new GeminiConnectionManager(mockApiKey, {
      rateLimit: {
        requestsPerMinute: 10,
        requestsPerHour: 100,
        burstSize: 3,
        queueTimeout: 5000,
      },
      circuitBreaker: {
        failureThreshold: 3,
        resetTimeout: 5000,
        halfOpenRequests: 2,
        monitoringPeriod: 10000,
      },
      connectionPool: {
        maxConnections: 2,
        connectionTimeout: 2000,
        idleTimeout: 10000,
        keepAlive: true,
      },
      retry: {
        maxRetries: 2,
        baseDelay: 100,
        maxDelay: 2000,
        backoffMultiplier: 2,
        retryableErrors: ['UNAVAILABLE', 'DEADLINE_EXCEEDED'],
      },
    });
  });

  afterEach(async () => {
    await manager.shutdown();
    await resetConnectionManager();
    vi.useRealTimers();
  }, 15000); // Increase timeout for cleanup

  describe('Connection Pooling', () => {
    it('should reuse connections from pool', async () => {
      const operation = vi.fn().mockResolvedValue('result');
      
      const promise1 = manager.execute(operation);
      const promise2 = manager.execute(operation);
      
      await Promise.all([promise1, promise2]);
      
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should queue requests when all connections are in use', async () => {
      const operations = Array(5).fill(null).map(() => 
        vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('result'), 100)))
      );
      
      const promises = operations.map(op => manager.execute(op));
      
      // Start processing the promises
      const allPromises = Promise.all(promises);
      
      // Advance time to allow processing
      await vi.advanceTimersByTimeAsync(1000);
      
      await allPromises;
      
      operations.forEach(op => expect(op).toHaveBeenCalled());
    });
  });

  describe('Rate Limiting', () => {
    it('should respect rate limits', async () => {
      const operation = vi.fn().mockResolvedValue('result');
      
      // Execute burst size (3) requests
      await Promise.all([
        manager.execute(operation),
        manager.execute(operation),
        manager.execute(operation),
      ]);
      
      expect(operation).toHaveBeenCalledTimes(3);
      
      // Next request should be queued
      const promise4 = manager.execute(operation);
      
      // Start the 4th request
      const promise4Started = promise4;
      
      // Advance time to refill tokens
      await vi.advanceTimersByTimeAsync(6000); // 1 minute / 10 requests = 6 seconds per token
      
      await promise4Started;
      expect(operation).toHaveBeenCalledTimes(4);
    });

    it('should timeout requests in queue', async () => {
      const operation = vi.fn().mockResolvedValue('result');
      
      // Fill burst capacity
      await Promise.all([
        manager.execute(operation),
        manager.execute(operation),
        manager.execute(operation),
      ]);
      
      // This should timeout
      const timeoutPromise = manager.execute(operation);
      
      // Advance past queue timeout
      await vi.advanceTimersByTimeAsync(6000);
      
      await expect(timeoutPromise).rejects.toThrow('Request timed out in queue');
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after failure threshold', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockRejectedValueOnce(new Error('UNAVAILABLE'));
      
      // First 3 failures should open circuit
      for (let i = 0; i < 3; i++) {
        await expect(manager.execute(operation, { retryable: false })).rejects.toThrow('UNAVAILABLE');
      }
      
      // Circuit should be open now
      await expect(manager.execute(operation)).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should transition to half-open after reset timeout', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockResolvedValue('success');
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(manager.execute(operation, { retryable: false })).rejects.toThrow();
      }
      
      // Advance past reset timeout
      vi.advanceTimersByTime(6000);
      
      // Should work now (half-open state)
      await expect(manager.execute(operation)).resolves.toBe('success');
    });

    it('should allow manual circuit breaker reset', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockResolvedValue('success');
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(manager.execute(operation, { retryable: false })).rejects.toThrow();
      }
      
      // Verify circuit is OPEN
      expect(manager.getCircuitBreakerStatus().state).toBe('OPEN');
      
      // Manual reset
      const resetResult = manager.resetCircuitBreaker();
      
      expect(resetResult.success).toBe(true);
      expect(resetResult.previousState).toBe('OPEN');
      expect(resetResult.message).toContain('successfully reset from OPEN to CLOSED');
      
      // Should work immediately after manual reset (not requiring timeout)
      await expect(manager.execute(operation)).resolves.toBe('success');
      expect(manager.getCircuitBreakerStatus().state).toBe('CLOSED');
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('Retry Logic', () => {
    it('should retry on retryable errors', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockResolvedValue('success');
      
      const result = await manager.execute(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('INVALID_ARGUMENT'));
      
      await expect(manager.execute(operation)).rejects.toThrow('INVALID_ARGUMENT');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockResolvedValue('success');
      
      const promise = manager.execute(operation);
      
      // Start the promise
      const promiseStarted = promise;
      
      // First retry after ~100ms + jitter
      await vi.advanceTimersByTimeAsync(200);
      // Second retry after ~200ms (100 * 2) + jitter
      await vi.advanceTimersByTimeAsync(300);
      
      await promiseStarted;
      
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Request Priority', () => {
    it('should process high priority requests first', async () => {
      const results: string[] = [];
      
      // Fill burst capacity
      await Promise.all([
        manager.execute(() => Promise.resolve('initial-1')),
        manager.execute(() => Promise.resolve('initial-2')),
        manager.execute(() => Promise.resolve('initial-3')),
      ]);
      
      // Queue requests with different priorities
      const promises = [
        manager.execute(() => Promise.resolve('low'), { priority: RequestPriority.LOW })
          .then(r => results.push(r)),
        manager.execute(() => Promise.resolve('high'), { priority: RequestPriority.HIGH })
          .then(r => results.push(r)),
        manager.execute(() => Promise.resolve('normal'), { priority: RequestPriority.NORMAL })
          .then(r => results.push(r)),
      ];
      
      // Start all promises
      const allPromises = Promise.all(promises);
      
      // Advance time to process queue
      await vi.advanceTimersByTimeAsync(20000);
      
      await allPromises;
      
      // High priority should be processed first
      expect(results[0]).toBe('high');
      expect(results[1]).toBe('normal');
      expect(results[2]).toBe('low');
    });
  });

  describe('Metrics', () => {
    it('should track metrics correctly', async () => {
      const operation = vi.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('UNAVAILABLE'))
        .mockResolvedValueOnce('success');
      
      await manager.execute(operation);
      await expect(manager.execute(operation, { retryable: false })).rejects.toThrow();
      
      const metrics = manager.getMetrics();
      
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successfulRequests).toBe(1);
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.circuitBreakerState).toBe('CLOSED');
    });
  });

  describe('Singleton Factory', () => {
    it('should return same instance', () => {
      const instance1 = getConnectionManager('test-key');
      const instance2 = getConnectionManager();
      
      expect(instance1).toBe(instance2);
    });

    it('should throw if no API key provided initially', async () => {
      // Reset the singleton first
      await resetConnectionManager();
      
      const originalEnv = process.env;
      process.env = { ...originalEnv };
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_GENAI_API_KEY;
      
      expect(() => getConnectionManager()).toThrow('environment variable not set');
      
      process.env = originalEnv;
    });
  });
});