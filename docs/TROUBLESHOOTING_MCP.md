# Troubleshooting Codeloops MCP Server

This guide helps resolve common issues when using the codeloops MCP server in Claude Code projects.

## Common Issue: Server Crashes on `actor_think`

### Symptoms
- Server appears to start successfully
- Crashes with `TypeError: Cannot read properties of undefined (reading 'addThought')` when calling `actor_think`
- Tools are not available even though server is configured

### Root Causes

1. **Multiple Server Instances**
   - Multiple codeloops processes running simultaneously can cause conflicts
   - Old cached versions may interfere with current code

2. **Missing Environment Variables**
   - `GOOGLE_GENAI_API_KEY` is required but not configured

3. **Stale NPX Cache**
   - NPX may cache old versions of the codeloops server

### Solution Steps

#### 1. Kill All Running Instances
```bash
# Find all running codeloops processes
ps aux | grep "tsx.*codeloops/src"

# Kill all instances
pkill -f "tsx.*codeloops/src"
```

#### 2. Clear NPX Cache
```bash
# Remove the entire npx cache
rm -rf ~/.npm/_npx/

# Or specifically target tsx cache
rm -rf ~/.npm/_npx/*tsx*
```

#### 3. Configure MCP Server Properly

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

**Important**: The API key MUST be included in the MCP configuration, not just in your shell environment.

#### 4. Ensure Dependencies Are Installed

In the codeloops directory:
```bash
cd /Users/matthewamann/codeloops
npm install
npm run setup  # Sets up Python agents
```

#### 5. Restart Claude Code

After making configuration changes, you must restart Claude Code for the changes to take effect.

## Verification Steps

1. **Check Server Configuration**
   ```bash
   claude mcp list
   # Should show: codeloops: npx -y tsx /Users/matthewamann/codeloops/src
   ```

2. **Test the Server**
   After restarting Claude Code, test with a simple actor_think call:
   ```javascript
   mcp__codeloops__actor_think({
     text: "Test thought",
     tags: ["task"],
     artifacts: [],
     projectContext: "/your/project/path"
   })
   ```

## Prevention Tips

1. **Always Kill Old Processes** before starting new sessions
2. **Use Absolute Paths** in MCP configuration
3. **Set API Keys in MCP Config** not just shell environment
4. **Clear NPX Cache Regularly** when switching between versions

## Debug Commands

```bash
# Check if server is running
ps aux | grep codeloops

# View server logs
tail -f /Users/matthewamann/codeloops/logs/codeloops.log.*

# Test API key
echo $GOOGLE_GENAI_API_KEY

# Check npm/npx versions
npm --version
npx --version
```

## Still Having Issues?

1. Check the [GitHub Issues](https://github.com/Scarlet-Creative-Software/codeloops/issues)
2. Ensure you're using the latest version from the `dev` branch
3. Try running the server directly: `cd /Users/matthewamann/codeloops && npm start`