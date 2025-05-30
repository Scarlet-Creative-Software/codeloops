/**
 * Integration test for circuit breaker reset functionality
 * Tests the manual reset capability for recovering from OPEN circuit breaker state
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiConnectionManager, resetConnectionManager, resetCircuitBreaker, getConnectionManager } from '../../src/utils/GeminiConnectionManager.ts';

describe('Circuit Breaker Reset Functionality', () => {
  let connectionManager: GeminiConnectionManager;
  const testApiKey = 'test-api-key-for-circuit-breaker-testing';

  beforeEach(async () => {
    // Reset any existing connection manager
    await resetConnectionManager();
    
    // Create a new connection manager with test settings
    connectionManager = new GeminiConnectionManager(testApiKey, {
      circuitBreaker: {
        failureThreshold: 2, // Lower threshold for testing
        resetTimeout: 5000, // 5 seconds
        halfOpenRequests: 1,
        monitoringPeriod: 10000
      },
      rateLimit: {
        requestsPerMinute: 60,
        requestsPerHour: 1000,
        burstSize: 10,
        queueTimeout: 5000
      }
    });
  });

  afterEach(async () => {
    if (connectionManager) {
      await connectionManager.shutdown();
    }
  });

  it('should provide circuit breaker status information', () => {
    const status = connectionManager.getCircuitBreakerStatus();
    
    expect(status).toHaveProperty('state');
    expect(status).toHaveProperty('failures');
    expect(status).toHaveProperty('successCount');
    expect(status).toHaveProperty('lastFailureTime');
    expect(status).toHaveProperty('timeSinceLastFailure');
    expect(status).toHaveProperty('config');
    
    expect(status.state).toBe('CLOSED');
    expect(status.failures).toBe(0);
  });

  it('should manually reset circuit breaker from any state', () => {
    // Initially the circuit breaker should be CLOSED
    expect(connectionManager.getCircuitBreakerStatus().state).toBe('CLOSED');
    
    // Reset should work even when already CLOSED
    const resetResult = connectionManager.resetCircuitBreaker();
    
    expect(resetResult.success).toBe(true);
    expect(resetResult.previousState).toBe('CLOSED');
    expect(resetResult.message).toContain('successfully reset');
    
    // Circuit breaker should still be CLOSED
    expect(connectionManager.getCircuitBreakerStatus().state).toBe('CLOSED');
    expect(connectionManager.getCircuitBreakerStatus().failures).toBe(0);
  });

  it('should reset circuit breaker through singleton function', async () => {
    // Reset the global singleton first
    await resetConnectionManager();
    
    // Initialize the singleton with a test API key
    const singletonManager = getConnectionManager(testApiKey);
    expect(singletonManager).toBeDefined();
    
    // Verify initial state
    const initialStatus = singletonManager.getCircuitBreakerStatus();
    expect(initialStatus.state).toBe('CLOSED');
    
    // Test the standalone reset function
    const resetResult = resetCircuitBreaker();
    
    expect(resetResult.success).toBe(true);
    expect(resetResult.message).toContain('successfully reset');
    
    // Clean up the singleton for other tests
    await resetConnectionManager();
  });

  it('should handle reset when connection manager is not initialized', async () => {
    // Shutdown the connection manager
    await resetConnectionManager();
    
    // Try to reset when no manager exists
    const resetResult = resetCircuitBreaker();
    
    expect(resetResult.success).toBe(false);
    expect(resetResult.message).toContain('Connection manager not initialized');
  });

  it('should simulate circuit breaker failure and recovery', async () => {
    // Mock a failing operation that will trigger circuit breaker
    const failingOperation = vi.fn().mockRejectedValue(new Error('DEADLINE_EXCEEDED'));
    
    try {
      // Execute the operation multiple times to trigger circuit breaker
      await connectionManager.execute(failingOperation, { retryable: false });
    } catch {
      // Expected to fail
    }
    
    try {
      await connectionManager.execute(failingOperation, { retryable: false });
    } catch {
      // Expected to fail
    }
    
    // After two failures, circuit breaker might be in different state
    // Note: Actual state depends on internal timing and implementation
    const statusAfterFailures = connectionManager.getCircuitBreakerStatus();
    const initialFailures = statusAfterFailures.failures;
    
    // Reset the circuit breaker
    const resetResult = connectionManager.resetCircuitBreaker();
    expect(resetResult.success).toBe(true);
    
    // Verify reset worked
    const statusAfterReset = connectionManager.getCircuitBreakerStatus();
    expect(statusAfterReset.state).toBe('CLOSED');
    expect(statusAfterReset.failures).toBe(0);
    expect(statusAfterReset.failures).toBeLessThan(initialFailures);
  });

  it('should include circuit breaker details in metrics', () => {
    const metrics = connectionManager.getMetrics();
    
    expect(metrics).toHaveProperty('circuitBreakerState');
    expect(metrics.circuitBreakerState).toBe('CLOSED');
    
    // Additional metrics should be present
    expect(metrics).toHaveProperty('totalRequests');
    expect(metrics).toHaveProperty('successfulRequests');
    expect(metrics).toHaveProperty('failedRequests');
  });

  it('should emit events when circuit breaker is reset', async () => {
    let eventReceived = false;
    
    // Access the circuit breaker through the internal property
    // Note: This is testing internal implementation, but necessary for thorough testing
    const circuitBreaker = (connectionManager as unknown as { circuitBreaker: { on: (event: string, callback: (data: unknown) => void) => void } }).circuitBreaker;
    
    // Listen for reset events
    circuitBreaker.on('manualReset', (event: unknown) => {
      expect(event).toHaveProperty('previousState');
      expect(event).toHaveProperty('timestamp');
      eventReceived = true;
    });
    
    // Reset the circuit breaker
    connectionManager.resetCircuitBreaker();
    
    // Wait for event to be emitted
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify event was emitted
    expect(eventReceived).toBe(true);
  });
});

describe('Circuit Breaker Reset Integration with Health Check', () => {
  // These tests would require the full MCP server setup
  // For now, we'll create unit tests that verify the integration points
  
  it('should export resetCircuitBreaker function for health check tool', () => {
    expect(typeof resetCircuitBreaker).toBe('function');
  });

  it('should return proper response structure for health check integration', () => {
    const result = resetCircuitBreaker();
    
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('previousState');
    expect(result).toHaveProperty('message');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.previousState).toBe('string');
    expect(typeof result.message).toBe('string');
  });
});