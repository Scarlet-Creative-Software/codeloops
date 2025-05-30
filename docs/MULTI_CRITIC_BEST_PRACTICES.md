# Multi-Critic System Best Practices

This guide provides best practices for effectively using the Codeloops Event Horizon multi-critic consensus system.

## When to Use Multi-Critic (`feedback: true`)

### ✅ Recommended For:
- **Security-critical code**: Authentication, authorization, data validation
- **Performance-sensitive algorithms**: Database queries, data processing, caching
- **Complex business logic**: Multi-step workflows, state machines, financial calculations
- **API design**: Public interfaces, breaking changes, backward compatibility
- **Architecture decisions**: System design, module boundaries, dependency management

### ❌ Not Recommended For:
- Simple formatting changes
- Documentation updates
- Test file modifications
- Configuration changes
- Trivial bug fixes

## Optimal Configuration

### Temperature Settings

The default temperatures are optimized for code review:

```bash
# Conservative settings for critical code
export CRITIC_TEMP_CORRECTNESS=0.2  # Very deterministic
export CRITIC_TEMP_EFFICIENCY=0.3   # Focused analysis
export CRITIC_TEMP_SECURITY=0.2     # Zero tolerance

# Balanced settings (default)
export CRITIC_TEMP_CORRECTNESS=0.3
export CRITIC_TEMP_EFFICIENCY=0.4
export CRITIC_TEMP_SECURITY=0.3

# Creative settings for exploration
export CRITIC_TEMP_CORRECTNESS=0.5
export CRITIC_TEMP_EFFICIENCY=0.6
export CRITIC_TEMP_SECURITY=0.5
```

### Token Limits

Adjust based on code complexity:

```bash
# For simple reviews
export CRITIC_MAX_TOKENS=1000

# For complex reviews (default)
export CRITIC_MAX_TOKENS=6000

# For detailed architectural reviews
export CRITIC_MAX_TOKENS=8000
```

## Effective Usage Patterns

### 1. Iterative Refinement

```javascript
// First pass: Get initial feedback
actor_think({
  text: "Initial implementation of user authentication",
  tags: ["task"],
  artifacts: [{ name: "auth.ts", content: authCode }],
  feedback: true
})

// Second pass: Address critic feedback
actor_think({
  text: "Addressed security concerns: added input validation and rate limiting",
  tags: ["task"],
  artifacts: [{ name: "auth.ts", content: updatedAuthCode }],
  feedback: true
})
```

### 2. Focused Reviews

Break large changes into smaller, focused reviews:

```javascript
// Review security aspects
actor_think({
  text: "Review security implementation of payment processing",
  tags: ["security", "task"],
  artifacts: [{ name: "payment.ts", content: paymentCode }],
  feedback: true
})

// Review performance separately
actor_think({
  text: "Optimize payment processing for high-volume transactions",
  tags: ["performance", "task"],
  artifacts: [{ name: "payment.ts", content: paymentCode }],
  feedback: true
})
```

### 3. Context Building

Provide comprehensive context for better reviews:

```javascript
actor_think({
  text: "Implement caching layer for API responses. Context: This service handles 10k requests/second during peak hours. Current p99 latency is 200ms, target is 50ms.",
  tags: ["task", "performance"],
  artifacts: [
    { name: "cache.ts", content: cacheImplementation },
    { name: "cache.test.ts", content: cacheTests },
    { name: "benchmarks.md", content: performanceData }
  ],
  feedback: true
})
```

## Interpreting Results

### Consensus Levels

1. **Unanimous Agreement**: All critics agree - high confidence in the feedback
2. **Majority Opinion**: 2/3 critics agree - consider the feedback carefully
3. **Minority Opinion**: 1/3 critics raise concern - may indicate edge cases

### Priority Levels

- **Critical**: Must be addressed before deployment
- **High**: Should be addressed in current iteration
- **Medium**: Can be addressed in follow-up
- **Low**: Nice-to-have improvements

## Common Pitfalls to Avoid

### 1. Overusing Multi-Critic

Don't use `feedback: true` for every change. It's resource-intensive and unnecessary for simple tasks.

### 2. Ignoring Minority Opinions

Even if only one critic raises a concern, investigate it. Security critics often catch subtle vulnerabilities.

### 3. Not Providing Enough Context

Critics perform better with context. Include:
- Related files
- Test cases
- Performance requirements
- Security constraints

### 4. Expecting Perfect Code

Critics provide guidance, not prescriptions. Use their feedback as input for your decisions.

## Performance Tips

### 1. Batch Related Changes

Review related changes together for better context:

```javascript
// Good: Review the complete feature
actor_think({
  text: "Implement complete authentication flow",
  artifacts: [
    { name: "auth.controller.ts", content: controllerCode },
    { name: "auth.service.ts", content: serviceCode },
    { name: "auth.middleware.ts", content: middlewareCode }
  ],
  feedback: true
})
```

### 2. Use Artifact History

Leverage the memory system by reviewing files consistently:

```javascript
// The system will remember previous reviews of auth.ts
artifact_history({
  projectContext: "/path/to/project",
  path: "src/auth.ts",
  limit: 5
})
```

### 3. Monitor Execution Time

If reviews take > 60 seconds, consider:
- Reducing artifact size
- Lowering token limits
- Breaking into smaller reviews

## Integration with Development Workflow

### 1. Pre-Commit Reviews

Use multi-critic for final review before committing:

```bash
# In your pre-commit hook
node scripts/review-changes.js --feedback=true
```

### 2. PR Reviews

Include critic feedback in pull request descriptions:

```markdown
## Critic Consensus

- ✅ **Security**: No vulnerabilities detected
- ⚠️ **Efficiency**: Consider caching database queries (lines 45-67)
- ✅ **Correctness**: Logic validated, edge cases handled
```

### 3. Continuous Improvement

Track critic feedback over time to identify patterns:
- Common security issues
- Performance bottlenecks
- Code quality trends

## Troubleshooting

### Critics Timing Out

- Reduce `CRITIC_MAX_TOKENS`
- Simplify artifact content
- Check API rate limits

### Inconsistent Feedback

- Lower temperature settings
- Provide more specific prompts
- Include more context

### JSON Parsing Errors

- Check for special characters in code
- Ensure artifacts are properly escaped
- Monitor log files for details

## Summary

The multi-critic system is a powerful tool for improving code quality. Use it strategically for complex, critical code where multiple perspectives add value. Configure it appropriately for your use case, and interpret the results as guidance rather than gospel.