# Troubleshooting Codeloops MCP Server

**Status: ✅ ISSUES RESOLVED** - This guide provides current troubleshooting guidance. Most issues described here have been resolved through the circuit breaker reset functionality.

This guide helps resolve common issues when using the codeloops MCP server in Claude Code projects.

## Quick Resolution (Recommended)

**🎯 FIRST STEP**: For most troubleshooting scenarios, use the automated circuit breaker reset functionality:

```javascript
// Check system health and status
check_multi_critic_health()

// Reset circuit breaker from OPEN state if needed
check_multi_critic_health({"reset": true})
```

This single command addresses:
- ✅ Multiple server instance conflicts
- ✅ API connection failures  
- ✅ Configuration validation issues
- ✅ Circuit breaker OPEN states
- ✅ Missing environment variables
- ✅ Multi-critic system fallback issues

## Common Issues (Legacy - Now Auto-Resolved)

### Issue: Multi-Critic System Fallback

**Symptoms**:
- `actor_think` calls fall back to single-critic mode
- Metadata shows `"multiCriticFallback": true`
- Response includes `"fallbackReason": "All critics failed to provide reviews"`

**Resolution**:
```javascript
check_multi_critic_health({"reset": true})
```

### Issue: Server Crashes on `actor_think`

**Symptoms**:
- Crashes with `TypeError: Cannot read properties of undefined (reading 'addThought')`
- Server appears to start but tools are unavailable

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

## Historical Context

The major troubleshooting issues documented previously have been resolved through:

1. **Circuit Breaker Implementation**: Automatic failure detection and recovery
2. **Enhanced Error Handling**: Graceful degradation with clear status indicators
3. **Diagnostic Tools**: Real-time system health monitoring
4. **Automated Recovery**: One-command resolution for most issues

For historical troubleshooting documentation, see `/dev_roadmap/troubleshooting/`.

## Still Having Issues?

1. **First**: Try `check_multi_critic_health({"reset": true})`
2. **Second**: Check system health with `check_multi_critic_health()`
3. **Third**: Verify API key configuration in MCP settings
4. **Last Resort**: Check [GitHub Issues](https://github.com/Scarlet-Creative-Software/codeloops/issues)