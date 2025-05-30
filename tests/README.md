# CodeLoops Testing Framework

This directory contains all tests for the CodeLoops project, organized by test type and purpose for better maintainability and clarity.

## Directory Structure

```
tests/
├── README.md                          # This file - testing overview and guidelines
├── unit/                              # Unit tests for individual components
│   └── config-system.test.ts         # Configuration system unit tests
├── integration/                       # Integration tests for multi-component features
│   ├── multi-critic.test.ts          # Comprehensive multi-critic system tests
│   ├── multi-critic-rate-limit.test.ts # Rate limiting behavior tests
│   └── semantic-cache.test.ts        # Semantic cache integration tests
├── e2e/                              # End-to-end tests (future)
├── scripts/                          # Test utility scripts and runners
│   ├── test-multi-critic.js          # MCP server test script
│   ├── test-multi-critic.mjs         # ESM version of test script
│   ├── test-multi-critic-direct.mjs  # Direct API test script
│   └── test-multi-critic-simple.sh   # Shell script for simple testing
├── utils/                            # Test utilities and helpers (future)
├── fixtures/                         # Test data and sample files (future)
├── docs/                             # Test documentation and reports
│   ├── multi-critic-testing-guide.md # Multi-critic testing instructions
│   └── test-reports/                 # Historical test reports and summaries
│       ├── v0.6.0-test-summary.md    # Phase 2.1 test results
│       └── *.json                    # Raw test result data
└── archive/                          # Archived/deprecated tests
    ├── direct-multi-critic.ts        # Legacy direct test (API key sanitized)
    ├── multi-critic-demo.ts          # Demo test file with intentional issues
    ├── multi-critic-final.ts         # Outdated "final" test
    ├── test-multi-critic-fixed.ts    # Superseded by comprehensive test
    └── temperature-experiments/       # Temperature configuration experiments
        ├── config.ts                 # Temperature config test
        ├── critic.ts                 # Critic temperature test
        ├── debug.ts                  # Debug temperature test
        └── multi-critic.ts           # Multi-critic temperature test
```

## Test Categories

### Unit Tests (`unit/`)
- **Purpose**: Test individual components in isolation
- **Naming**: `component-name.test.ts`
- **Current Tests**:
  - `config-system.test.ts`: Tests configuration management, environment variables, hot reload

### Integration Tests (`integration/`)
- **Purpose**: Test multi-component interactions and workflows
- **Naming**: `feature-name.test.ts`
- **Current Tests**:
  - `multi-critic.test.ts`: Comprehensive multi-critic consensus system testing
  - `multi-critic-rate-limit.test.ts`: Rate limiting and circuit breaker behavior
  - `semantic-cache.test.ts`: Semantic cache system integration

### End-to-End Tests (`e2e/`)
- **Purpose**: Test complete user workflows from MCP client perspective
- **Status**: Future implementation
- **Planned**: Full MCP server interaction tests

## Running Tests

### Prerequisites
```bash
# Install dependencies
npm install

# Set up environment (optional for some tests)
export GOOGLE_GENAI_API_KEY="your-api-key-here"
```

### Individual Tests
```bash
# Run specific test files
npx tsx tests/unit/config-system.test.ts
npx tsx tests/integration/multi-critic.test.ts
npx tsx tests/integration/semantic-cache.test.ts

# Run integration tests with API key (for full multi-critic testing)
GOOGLE_GENAI_API_KEY="your-key" npx tsx tests/integration/multi-critic.test.ts
```

### Test Scripts
```bash
# MCP server integration test
node tests/scripts/test-multi-critic.js

# Simple shell-based test
bash tests/scripts/test-multi-critic-simple.sh

# ESM module tests
node tests/scripts/test-multi-critic.mjs
```

### All Tests (Future)
```bash
# Run all unit tests
npm run test:unit

# Run all integration tests  
npm run test:integration

# Run all tests
npm test
```

## Test Standards

### File Naming
- Unit tests: `component-name.test.ts`
- Integration tests: `feature-name.test.ts`
- E2E tests: `workflow-name.e2e.ts`
- Scripts: `test-description.js/.mjs/.sh`

### Test Structure
All TypeScript tests should follow this structure:
```typescript
#!/usr/bin/env npx tsx

/**
 * Description of what this test validates
 */

import { /* dependencies */ } from '../../src/...';

// Test data and fixtures
const testData = { /* ... */ };

// Main test function
async function testFeatureName() {
  console.log('🧪 Feature Name Test\n');
  
  try {
    // Setup
    // Test execution
    // Assertions
    // Cleanup
    
    console.log('✅ Test PASSED');
    return 0;
  } catch (error) {
    console.error('❌ Test FAILED:', error);
    return 1;
  }
}

// Export for programmatic use
export { testFeatureName };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testFeatureName()
    .then(code => process.exit(code))
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}
```

### Multi-Critic Testing

The multi-critic system requires special consideration:

#### API Key Requirements
- **With API Key**: Full 3-critic consensus testing
- **Without API Key**: Single-critic fallback testing
- Both modes should be tested for robustness

#### Performance Expectations
- **Multi-critic mode**: 15-30s for complex reviews
- **Single-critic mode**: 8-12s for the same reviews
- **Log growth**: ~1.5x increase in multi-critic mode

#### Test Artifacts
Multi-critic tests should include code with intentional issues across all three critic specializations:
- **Security issues**: SQL injection, hardcoded secrets, missing auth
- **Performance issues**: O(n²) algorithms, memory leaks, blocking operations
- **Correctness issues**: Missing error handling, race conditions, validation gaps

## Archived Tests

The `archive/` directory contains older test versions that have been superseded:

- **Legacy multi-critic tests**: Replaced by comprehensive `multi-critic.test.ts`
- **Temperature experiments**: Configuration testing that led to implemented features
- **Demo files**: Sample code with intentional issues for manual testing

### Security Note
All archived files have been sanitized to remove hardcoded API keys or sensitive information.

## Contributing to Tests

### Adding New Tests
1. Determine the appropriate category (unit/integration/e2e)
2. Follow naming conventions
3. Use the standard test structure
4. Include proper error handling and cleanup
5. Add documentation to this README

### Updating Existing Tests
1. Maintain backward compatibility where possible
2. Update test documentation
3. Preserve historical test results in `docs/test-reports/`

### Test Data and Fixtures
- Place reusable test data in `fixtures/`
- Use meaningful, realistic examples
- Include edge cases and error conditions
- Document any dependencies or setup requirements

## Troubleshooting

### Common Issues

#### "Cannot read properties of undefined" in multi-critic tests
- **Cause**: Multiple MCP server instances or cache issues
- **Solution**: Kill all codeloops processes and clear npx cache:
  ```bash
  pkill -f "tsx.*codeloops/src"
  rm -rf ~/.npm/_npx/
  ```

#### Tests timing out
- **Cause**: Network issues or API rate limiting
- **Solution**: Check API key, network connectivity, and rate limits

#### Import path errors after reorganization
- **Cause**: Moved files may have outdated import paths
- **Solution**: Update relative import paths based on new structure

### Getting Help
- Check `docs/test-reports/` for historical test behavior
- Review `docs/multi-critic-testing-guide.md` for detailed multi-critic instructions
- Consult main project documentation in `/docs`

## Future Enhancements

- [ ] Automated test runner with npm scripts
- [ ] Test coverage reporting
- [ ] Performance regression testing
- [ ] Automated test report generation
- [ ] CI/CD integration
- [ ] Parallel test execution
- [ ] Test environment isolation
- [ ] Mock data generators