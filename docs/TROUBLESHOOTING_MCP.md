# Troubleshooting Codeloops MCP Server

This guide helps resolve common issues when using the codeloops MCP server in Claude Code projects.

## Quick Resolution

**🎯 FIRST STEP**: For most troubleshooting scenarios, use the automated diagnostic and reset functionality:

```javascript
// Check system health and status
check_multi_critic_health()

// Reset circuit breaker from OPEN state if needed
check_multi_critic_health({"reset": true})
```

This automated tool addresses:
- ✅ Multiple server instance conflicts
- ✅ API connection failures  
- ✅ Configuration validation issues
- ✅ Circuit breaker OPEN states
- ✅ Missing environment variables
- ✅ Multi-critic system fallback issues

## Current Issues & Solutions

### Multi-Critic System Not Running

**Symptoms**:
- Getting basic "✔ Approved" instead of detailed consensus
- Metadata shows `"multiCriticFallback": true`
- Response includes fallback reason

**Resolution**:
```javascript
check_multi_critic_health({"reset": true})
```

### Server Connection Issues

**Symptoms**:
- Tools are unavailable or return errors
- Connection timeouts or failures

**Resolution**:
```javascript
check_multi_critic_health({"reset": true})
```

## Manual Setup (If Automated Reset Fails)

### 1. Configure MCP Server

Create or update `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/matthewamann/codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-gemini-api-key-here"
      }
    }
  }
}
```

### 2. Ensure Dependencies

```bash
cd /Users/matthewamann/codeloops
npm install
npm run setup
```

### 3. Restart Claude Code

After configuration changes, restart Claude Code for changes to take effect.

## Verification Steps

1. **Check System Health**:
   ```javascript
   check_multi_critic_health()
   ```

2. **Test Basic Functionality**:
   ```javascript
   actor_think({
     text: "Test system functionality",
     tags: ["task"],
     artifacts: [],
     projectContext: "/your/project/path"
   })
   ```

## System Health Monitoring

The system includes comprehensive health monitoring:

1. **Circuit Breaker Implementation**: Automatic failure detection and recovery
2. **Enhanced Error Handling**: Graceful degradation with clear status indicators
3. **Diagnostic Tools**: Real-time system health monitoring
4. **Automated Recovery**: One-command resolution for most issues

For detailed development documentation, see `/dev_roadmap/summaries/`.

## Still Having Issues?

1. **First**: Try `check_multi_critic_health({"reset": true})`
2. **Second**: Check system health with `check_multi_critic_health()`
3. **Third**: Verify API key configuration in MCP settings
4. **Last Resort**: Check [GitHub Issues](https://github.com/Scarlet-Creative-Software/codeloops/issues)