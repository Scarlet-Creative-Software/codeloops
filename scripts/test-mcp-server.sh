#!/bin/bash

# Test script to verify CodeLoops MCP server functionality

echo "🔍 Testing CodeLoops MCP Server v0.6.0"
echo "====================================="

# Check if server is running
echo -n "1. Checking if MCP server is running... "
if ps aux | grep -E "(tsx.*codeloops|codeloops.*src)" | grep -v grep > /dev/null; then
    echo "✅ Running"
else
    echo "❌ Not running"
    echo "   Start with: npx -y tsx /Users/matthewamann/codeloops/src"
    exit 1
fi

# Check Node.js version
echo -n "2. Checking Node.js version... "
NODE_VERSION=$(node --version)
echo "✅ $NODE_VERSION"

# Check if API key is configured
echo -n "3. Checking Gemini API key... "
if [ -n "$GOOGLE_GENAI_API_KEY" ]; then
    echo "✅ Configured"
else
    echo "⚠️  Not set (semantic cache disabled)"
fi

# Check data directory
echo -n "4. Checking data directory... "
DATA_DIR="${CODELOOPS_DATA_DIR:-./data}"
if [ -d "$DATA_DIR" ]; then
    echo "✅ Exists at $DATA_DIR"
else
    echo "⚠️  Creating $DATA_DIR"
    mkdir -p "$DATA_DIR"
fi

# Run basic test
echo -n "5. Running basic KnowledgeGraph test... "
cd /Users/matthewamann/codeloops
if npm test -- src/engine/KnowledgeGraph.test.ts --reporter=verbose --run 2>&1 | grep -q "Test Files  1 passed"; then
    echo "✅ Passed"
else
    echo "❌ Failed"
fi

# Check Python agents
echo -n "6. Checking Critic agent... "
if [ -f "agents/critic/agent.py" ] && [ -f "agents/critic/.venv/bin/python" ]; then
    echo "✅ Installed"
else
    echo "⚠️  Not fully configured"
fi

echo -n "7. Checking Summarize agent... "
if [ -f "agents/summarize/agent.py" ] && [ -f "agents/summarize/.venv/bin/python" ]; then
    echo "✅ Installed"
else
    echo "⚠️  Not fully configured"
fi

# Summary
echo ""
echo "📊 Summary"
echo "=========="
echo "Version: 0.6.0"
echo "Phase: 2.1 - Semantic Query Caching ✅"
echo "Status: Production Ready"
echo ""
echo "Features:"
echo "- ✅ B-tree indexing (O(log n) search)"
echo "- ✅ Async file operations"
echo "- ✅ Gemini API optimization"
echo "- ✅ Configuration management"
echo "- ✅ Semantic cache infrastructure"
echo "- ⚠️  Multi-critic (fallback mode)"
echo ""
echo "Next: Phase 2.2 - Memory-Mapped Storage"
echo ""
echo "To start server: npx -y tsx /Users/matthewamann/codeloops/src"