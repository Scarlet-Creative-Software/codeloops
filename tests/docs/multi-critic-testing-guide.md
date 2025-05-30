# Testing Multi-Critic Consensus System

## Setup
1. Ensure GOOGLE_GENAI_API_KEY is set in your environment
2. Restart Claude to load the updated MCP server
3. Open a terminal to monitor log file growth:
   ```bash
   ./monitor-log-size.sh
   ```

## Test Scenario

Use the Codeloops MCP tool with feedback:true to analyze the test file:

```
Use actor_think with:
- text: "Review and improve the UserAuthentication class in test-multi-critic-demo.ts. The class has various security, performance, and code quality issues that need to be addressed."
- tags: [Tag.Task, Tag.Design]
- artifacts: [{
    "name": "test-multi-critic-demo.ts",
    "path": "/Users/matthewamann/codeloops/test-multi-critic-demo.ts"
  }]
- feedback: true
```

## Expected Results

With feedback:true, you should see:
1. **Three parallel critics** providing specialized feedback:
   - Correctness Critic: Identifying logical errors, missing validation
   - Efficiency Critic: Spotting performance issues, O(n) algorithms
   - Security Critic: Finding vulnerabilities like plain text passwords, SQL injection

2. **Consensus building**: The system will synthesize the three critics' feedback

3. **Artifact content loading**: Critics will receive the full file content (automatically loaded from filesystem)

4. **Log file growth**: Monitor shows ~1.5x more data than single critic

## Monitoring

The monitor script will show:
- Initial log file size
- Real-time size updates every 2 seconds
- Growth in MB since start

## Without Multi-Critic

To compare, run the same test without feedback:true to see single critic behavior.

## Key Memory Test

After the first review, modify the file and run again. The critics should remember their previous reviews of this file and reference them in the new review.