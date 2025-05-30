# Multi-Critic System Fix Plan

## Overview
This document outlines the plan to address issues discovered during multi-critic system testing.

## Issues to Address

### 1. JSON Parsing Errors with Code Examples
**Problem**: Critics occasionally include code examples that break JSON parsing due to special characters, quotes, and escape sequences.

**Solutions**:
- Option A: Modify the schema to use base64 encoding for code examples
- Option B: Add a preprocessing step to escape code examples before JSON generation
- Option C: Use a more robust parsing mechanism with better error recovery
- **Recommended**: Implement Option B with a fallback to Option C

**Implementation Steps**:
1. Add a `sanitizeCodeExample` function that properly escapes special characters
2. Implement retry logic with incremental parsing attempts
3. Add validation to ensure code examples don't break JSON structure
4. Consider using markdown code blocks within string fields

### 2. Temperature Configuration Validation
**Problem**: No validation ensures temperature values are within valid ranges (0.0-1.0).

**Solutions**:
- Add runtime validation in config.ts
- Add type guards to ensure values are within range
- Log warnings for out-of-range values with automatic clamping

**Implementation Steps**:
1. Create a `validateTemperature` function
2. Apply validation to all temperature configurations
3. Add unit tests for temperature validation
4. Update documentation with valid ranges

### 3. Test Script Organization
**Problem**: Multiple test scripts scattered in the root directory instead of organized in a dedicated folder.

**Files to Move**:
- test-multi-critic-demo.ts
- test-temperature-config.ts
- test-multi-critic-temperature.ts
- test-multi-critic-temperature-debug.ts
- test-multi-critic-final.ts
- test-critic-temperature.ts
- direct-test-multi-critic.ts

**New Structure**:
```
tests/
├── integration/
│   ├── multi-critic-demo.ts
│   ├── multi-critic-final.ts
│   └── direct-multi-critic.ts
├── temperature/
│   ├── config.ts
│   ├── critic.ts
│   ├── debug.ts
│   └── multi-critic.ts
└── scripts/
    └── quickstart.sh
```

### 4. Documentation Updates
**Problem**: Temperature configuration details are not fully documented.

**Updates Needed**:
1. Add temperature configuration section to README.md
2. Create CONFIGURATION.md with all environment variables
3. Update CLAUDE.md with temperature guidance
4. Add examples of optimal temperature settings

### 5. JSON Parsing Retry Logic
**Problem**: No retry mechanism when JSON parsing fails.

**Implementation**:
1. Add exponential backoff retry mechanism
2. Implement partial parsing recovery
3. Log detailed error information for debugging
4. Add metrics to track parsing failure rates

## Implementation Priority

1. **High Priority** (Immediate fixes):
   - JSON parsing error handling
   - Temperature validation
   - Basic retry logic

2. **Medium Priority** (Next sprint):
   - Test script organization
   - Documentation updates
   - Enhanced error recovery

3. **Low Priority** (Future enhancements):
   - Metrics and monitoring
   - Advanced parsing strategies
   - Performance optimizations

## Task Breakdown

### Task 1: Fix JSON Parsing (2-3 hours)
- [ ] Implement code example sanitization
- [ ] Add retry logic with fallback
- [ ] Create unit tests for edge cases
- [ ] Update error messages

### Task 2: Add Temperature Validation (1 hour)
- [ ] Create validation function
- [ ] Apply to all temperature configs
- [ ] Add warning logs
- [ ] Write unit tests

### Task 3: Organize Test Scripts (1 hour)
- [ ] Create directory structure
- [ ] Move and rename files
- [ ] Update package.json scripts
- [ ] Update documentation references

### Task 4: Update Documentation (2 hours)
- [ ] Create CONFIGURATION.md
- [ ] Update README.md
- [ ] Update CLAUDE.md
- [ ] Add examples and best practices

### Task 5: Implement Retry Logic (2 hours)
- [ ] Design retry strategy
- [ ] Implement exponential backoff
- [ ] Add circuit breaker pattern
- [ ] Create integration tests

## Success Criteria

1. Multi-critic system successfully handles code examples without JSON parsing errors
2. All temperature values are validated and within valid ranges
3. Test scripts are organized in a logical directory structure
4. Documentation clearly explains all configuration options
5. System gracefully handles and recovers from parsing failures

## Testing Plan

1. **Unit Tests**:
   - JSON sanitization function
   - Temperature validation
   - Retry logic components

2. **Integration Tests**:
   - Multi-critic with complex code examples
   - Edge cases with special characters
   - Temperature boundary conditions

3. **E2E Tests**:
   - Full actor-critic cycle with problematic inputs
   - Stress testing with concurrent critics
   - Performance benchmarks

## Rollout Plan

1. Implement fixes in feature branch
2. Run comprehensive test suite
3. Code review with focus on error handling
4. Deploy to staging environment
5. Monitor for 24 hours
6. Deploy to production with feature flag