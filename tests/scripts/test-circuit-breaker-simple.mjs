// Simple test for circuit breaker reset functionality
import { resetCircuitBreaker, getConnectionManager, resetConnectionManager } from '../../src/utils/GeminiConnectionManager.ts';

console.log('🔧 Testing circuit breaker reset functionality...');

async function runTests() {
    try {
        // Test 1: Reset without initialized manager
        console.log('Test 1: Reset without initialized manager');
        const result1 = resetCircuitBreaker();
        console.log('Result:', JSON.stringify(result1, null, 2));
        if (!result1.success && result1.message.includes('not initialized')) {
            console.log('✅ Test 1 passed: Correctly handles uninitialized manager');
        } else {
            console.log('❌ Test 1 failed');
            process.exit(1);
        }

        // Test 2: Initialize manager and test reset
        console.log('\nTest 2: Reset with initialized manager');
        const manager = getConnectionManager('test-api-key');
        const result2 = resetCircuitBreaker();
        console.log('Result:', JSON.stringify(result2, null, 2));
        if (result2.success) {
            console.log('✅ Test 2 passed: Successfully reset circuit breaker');
        } else {
            console.log('❌ Test 2 failed');
            process.exit(1);
        }

        // Test 3: Test circuit breaker status
        console.log('\nTest 3: Check circuit breaker status');
        const status = manager.getCircuitBreakerStatus();
        console.log('Status:', JSON.stringify(status, null, 2));
        if (status && status.state === 'CLOSED') {
            console.log('✅ Test 3 passed: Circuit breaker is in CLOSED state');
        } else {
            console.log('❌ Test 3 failed');
            process.exit(1);
        }

        // Test 4: Test metrics include circuit breaker info
        console.log('\nTest 4: Check metrics include circuit breaker info');
        const metrics = manager.getMetrics();
        console.log('Metrics keys:', Object.keys(metrics));
        if (metrics.circuitBreakerState === 'CLOSED') {
            console.log('✅ Test 4 passed: Metrics include circuit breaker state');
        } else {
            console.log('❌ Test 4 failed');
            process.exit(1);
        }

        console.log('\n🎉 All tests passed! Circuit breaker reset functionality is working correctly.');
        
        // Cleanup
        await resetConnectionManager();
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        process.exit(1);
    }
}

runTests();