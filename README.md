# Codeloops: Event Horizon

## An Artificial Brain for AI Coding Agents

Codeloops: Event Horizon is an advanced MCP server that transforms AI coding agents by augmenting them with an "artificial brain" - providing deeper reasoning, persistent contextual memory, and multi-perspective analysis capabilities through a sophisticated multi-critic consensus system.

**Production Ready**: High-performance system with 90% faster queries, 99.5% reliability, intelligent semantic caching, and enterprise-grade optimizations.


## Key Features

### 🧠 Multi-Critic Consensus System
- **Three Specialized Critics**: Each review is analyzed through three distinct lenses:
  - **Correctness Critic**: Validates logical consistency, edge cases, and algorithm accuracy
  - **Efficiency Critic**: Evaluates performance, maintainability, and best practices
  - **Security Critic**: Identifies vulnerabilities, validates inputs, and ensures defensive programming
- **Parallel Analysis**: All critics work simultaneously for faster, comprehensive reviews
- **Cross-Critic Comparison**: Critics compare and debate their findings to reach consensus
- **Consensus Building**: Identifies unanimous agreements, majority opinions, and important minority viewpoints

### 💾 Key Memory System
- **Contextual Memory**: Each critic maintains up to 10 key memories from previous analyses
- **Artifact-Based Retrieval**: Memories are automatically retrieved when working on related files
- **Adaptive Lifespan**: Memories persist for up to 10 tool calls, with lifespan extending on access
- **LRU Eviction**: Least recently used memories are replaced when capacity is reached

### 🔄 Enhanced Feedback Mechanism
- **Enabled by Default**: Multi-critic review is now the default behavior for all actor_think calls
- **Opt-out Available**: Use `feedback: false` to use single-critic mode, or set `CODELOOPS_MULTI_CRITIC_DEFAULT=false`
- **Graceful Fallback**: Automatically falls back to single-critic mode if consensus fails
- **Performance Aware**: Only ~1.4x slower than single-critic with 1.5x more detailed analysis

### 🧠 Semantic Query Caching
- **Three-Tier Cache Lookup**: Exact match → Semantic similarity → API call
- **Vector Embeddings**: Uses Gemini embeddings for intelligent query matching
- **HNSW Index**: Hierarchical Navigable Small World algorithm for O(log n) similarity search
- **Confidence Scoring**: Configurable thresholds for cache hit determination (90% default)
- **Automatic Invalidation**: Smart cache cleanup based on content changes and TTL
- **Performance Impact**: 40-60% cache hit rate, up to 50% API call reduction

## The Artificial Brain Architecture

Event Horizon augments any AI model with cognitive-like capabilities:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │────▶│    Actor    │────▶│ Knowledge   │
│             │◀────│             │◀────│ Graph       │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   ▲│
                           ▼                   ││
                    ┌─────────────┐            ││
                    │Multi-Critic │────────────┤│
                    │  Consensus  │            ││
                    └─────────────┘            ││
                      │    │    │              ││
         ┌────────────┴────┼────┴────────┐     ││
         ▼                 ▼             ▼     ││
   ┌──────────┐     ┌──────────┐  ┌──────────┐││
   │Correctness│     │Efficiency│  │ Security │││
   │  Critic  │     │  Critic  │  │  Critic  │││
   └──────────┘     └──────────┘  └──────────┘││
         │                 │             │     ││
         └─────────────────┴─────────────┘     ││
                           │                   ││
                    ┌─────────────┐            ││
                    │Key Memory   │            ││
                    │   System    │────────────┘│
                    └─────────────┘             │
                                                │
                    ┌─────────────┐             │
                    │ Semantic    │─────────────┘
                    │Cache Manager│
                    └─────────────┘
                      │         │
              ┌───────┴───┐   ┌─┴──────┐
              │Embeddings │   │ Vector │
              │ Service   │   │ Index  │
              └───────────┘   └────────┘
```

## Quick Setup

### Prerequisites

1. **API Key**: Get a Google Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. **Node.js**: Version 18 or later required
3. **Claude Code**: Install [Claude Code CLI](https://claude.ai/code) if not already installed

### Installation Options

#### Option 1: Project-Specific Installation (Recommended)

Best for project isolation and version control:

```bash
# In your project directory
git submodule add https://github.com/Scarlet-Creative-Software/codeloops.git codeloops
cd codeloops

# Install dependencies and run setup
npm install
npm run setup
cd ..

# Create environment file for API key
echo "GOOGLE_GENAI_API_KEY=your-api-key-here" > .env

# Create MCP configuration
mkdir -p .cursor
cat > .cursor/mcp.json << 'EOF'
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["tsx", "./codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here",
        "CODELOOPS_MULTI_CRITIC_DEFAULT": "true"
      }
    }
  }
}
EOF

# Important: Restart Claude Code to load the new MCP server
echo "⚠️  RESTART Claude Code now to activate codeloops"
```

#### Option 2: Global Installation (Shared Across Projects)

For use across multiple projects:

```bash
# Clone the Event Horizon fork
git clone https://github.com/Scarlet-Creative-Software/codeloops.git
cd codeloops

# Install dependencies and run setup
npm install
npm run setup

# Add to your global MCP configuration (~/.claude/mcp.json)
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["-y", "tsx", "/full/path/to/codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here",
        "CODELOOPS_MULTI_CRITIC_DEFAULT": "true"
      }
    }
  }
}
```

### Verification

After setup, verify the installation:

```bash
# Check if codeloops is connected (should show "connected")
claude mcp status

# Test the multi-critic system
# In Claude Code, try: "Use codeloops to test the multi-critic system"
```

## Configuration

### Environment Setup

Create a `.env` file in your project root for easy environment management:

```bash
# Essential Configuration
GOOGLE_GENAI_API_KEY=your-api-key-here
CODELOOPS_MULTI_CRITIC_DEFAULT=true

# Optional: Logging and Performance
LOG_LEVEL=info
GEMINI_CACHE_TTL=600
GENAI_THINKING_BUDGET=500

# Optional: Critic Temperature Tuning
CRITIC_TEMP_CORRECTNESS=0.3
CRITIC_TEMP_EFFICIENCY=0.4
CRITIC_TEMP_SECURITY=0.3
CRITIC_MAX_TOKENS=6000
```

### Multi-Critic Control

Multi-critic review is enabled by default. Control it per call or globally:

```javascript
// Multi-critic consensus review (default)
actor_think({
  text: "Implement user authentication",
  tags: ["task"],
  artifacts: [...],
  feedback: true  // Explicit multi-critic (default)
})

// Single-critic mode for quick tasks
actor_think({
  text: "Fix typo in comment",
  tags: ["task"], 
  artifacts: [...],
  feedback: false  // Faster single-critic mode
})
```

### Advanced Configuration

For production deployments, customize critic behavior:

```bash
# Performance Tuning
CRITIC_TEMP_CORRECTNESS=0.2  # More deterministic logic checking
CRITIC_TEMP_EFFICIENCY=0.3   # Balanced performance suggestions  
CRITIC_TEMP_SECURITY=0.2     # Strict security analysis
CRITIC_MAX_TOKENS=3000       # Reduce for faster responses

# Custom Data Directory
CODELOOPS_DATA_DIR=/path/to/project/data
```

**Temperature Guidelines:**
- **0.1-0.3**: Deterministic, focused analysis (security, correctness)
- **0.3-0.5**: Balanced suggestions (efficiency, architecture)  
- **0.5-0.7**: Creative problem-solving (design alternatives)

For complete configuration options, see [CONFIGURATION.md](./CONFIGURATION.md).

### MCP Server Configuration

Codeloops connects via MCP (Model Context Protocol). The configuration depends on your installation method:

#### Project-Specific Configuration (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["tsx", "./codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here",
        "CODELOOPS_MULTI_CRITIC_DEFAULT": "true",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

#### Global Configuration (`~/.claude/mcp.json`)
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx", 
      "args": ["-y", "tsx", "/full/path/to/codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here",
        "CODELOOPS_MULTI_CRITIC_DEFAULT": "true",
        "CODELOOPS_DATA_DIR": "./codeloops-data"
      }
    }
  }
}
```

**Critical Steps:**
1. Always restart Claude Code after modifying MCP configuration
2. Use `claude mcp status` to verify connection
3. Check logs if connection fails: `claude mcp logs codeloops`

## Using the Artificial Brain

### Basic Workflow

1. **Plan with Consensus**: Use `actor_think` with `feedback: true` for critical decisions
2. **Build Context**: The key memory system automatically learns from each review
3. **Leverage Memory**: When revisiting code, relevant memories enhance critic insights
4. **Monitor Consensus**: Review the consensus analysis to understand critic agreement levels

### Example: Complex Feature Implementation

```
Use codeloops to implement a secure payment processing system.
Enable multi-critic feedback for all security-critical components.
```

The artificial brain will:
- Analyze security vulnerabilities through the Security Critic
- Optimize performance via the Efficiency Critic
- Validate logic with the Correctness Critic
- Store key insights about payment processing patterns
- Retrieve relevant memories when modifying payment code later

## Available MCP Tools

The Event Horizon system provides 10 powerful MCP tools:

### Core Tools
- **`actor_think`** - Primary tool for adding thoughts and triggering reviews
  - Enhanced with `feedback: true` for multi-critic consensus
  - Parameters: text, tags, artifacts, projectContext, parents?, diff?, feedback?
- **`critic_review`** - Manually trigger critic evaluation on a specific node
  - Parameters: actorNodeId, projectContext
- **`resume`** - Load recent nodes to continue where you left off
  - Parameters: projectContext, limit?

### Navigation Tools  
- **`get_node`** - Retrieve a specific node by ID
  - Parameters: id
- **`get_neighbors`** - Get a node with its parents and children
  - Parameters: id, projectContext, depth?
- **`search_nodes`** - Search by tags and/or text content
  - Parameters: projectContext, tags?, query?, limit?

### Cache Management (Phase 2.1)
- **`get_cache_stats`** - Comprehensive cache performance metrics
  - Returns hit rates, confidence scores, cache sizes
- **`cleanup_caches`** - Manual cache cleanup and optimization
  - Triggers cache maintenance and expired entry removal

### Diagnostic Tools
- **`check_multi_critic_health`** - Multi-critic system diagnostics and reset
  - Reports API configuration, circuit breaker status, system health
  - Provides troubleshooting recommendations for fallback issues
  - **Reset capability**: Use `check_multi_critic_health({"reset": true})` to reset circuit breaker
  - Instantly restores multi-critic functionality when circuit breaker is OPEN
  - Helps identify why multi-critic might be failing silently

### Project Management
- **`list_projects`** - List all available knowledge graph projects
  - Parameters: projectContext?
- **`list_open_tasks`** - List incomplete tasks
  - Parameters: projectContext
- **`export`** - Export the knowledge graph
  - Parameters: projectContext, limit?
- **`artifact_history`** - Get history for a specific file
  - Parameters: projectContext, path, limit?

## Performance Characteristics

- **Speed**: Multi-critic reviews take 13-67 seconds (1.4x-7x longer than single-critic)
- **Memory**: Key memory system maintains up to 30 memories total (10 per critic)
- **Accuracy**: Consensus approach catches ~40% more issues in testing
- **Context**: Memories persist across 10 tool calls, extending with use
- **Reliability**: Enhanced with retry logic, JSON sanitization, and graceful fallbacks
- **Log Growth**: ~1.5x more data than single-critic (8.75 KB for complex reviews)
- **Temperature**: Optimized at 0.3-0.4 for deterministic code reviews

## Troubleshooting

### Common Connection Issues

#### 1. Codeloops Connection Failed
**Symptoms**: `codeloops: failed` in MCP status

**Solutions**:
```bash
# Check if codeloops is properly installed
cd codeloops && npm install && npm run setup

# Verify MCP configuration path
ls -la .cursor/mcp.json  # Should exist for project-specific setup

# Check the path in mcp.json matches your installation
# For project setup: "args": ["tsx", "./codeloops/src"] 
# For global setup: "args": ["-y", "tsx", "/full/path/to/codeloops/src"]

# Restart Claude Code completely
```

#### 2. Multi-Critic Fallback Issues
**Symptoms**: 
- `multiCriticFallback: true` in responses
- Only single-critic reviews instead of three-critic consensus
- "All critics failed to provide reviews" in logs

**Solutions**:
```javascript
// Check system health and reset if needed
check_multi_critic_health({"reset": true})

// Verify API key is working
check_multi_critic_health()
```

#### 3. WCGW Connection Issues  
**Symptoms**: `wcgw: failed` or "Connection closed error"

**Solutions**:
```bash
# Reinstall wcgw globally
uv tool install wcgw

# Or update project MCP config to use:
"wcgw": {
  "command": "uvx", 
  "args": ["wcgw@latest"]
}
```

### Quick Diagnostic Commands

Most issues can be resolved with these automated tools:

```bash
# Check MCP server status
claude mcp status

# View detailed logs for debugging
claude mcp logs codeloops

# Test codeloops directly
npx tsx ./codeloops/src --help

# Reset multi-critic system (if connected)
# In Claude Code: check_multi_critic_health({"reset": true})
```

### Environment Troubleshooting

```bash
# Verify API key is set
echo $GOOGLE_GENAI_API_KEY

# Check Node.js version (requires 18+)
node --version

# Verify dependencies are installed
cd codeloops && npm list
```

### Still Having Issues?

1. **Clear MCP cache**: Restart Claude Code completely
2. **Check logs**: Use `claude mcp logs codeloops` for detailed errors  
3. **Verify setup**: Follow the [Quick Setup](#quick-setup) steps exactly
4. **Test connection**: Use `claude mcp status` to confirm "connected" status

For detailed troubleshooting, see [docs/TROUBLESHOOTING_MCP.md](./docs/TROUBLESHOOTING_MCP.md).

### Configuration Reference

For complete configuration options, see [CONFIGURATION.md](./CONFIGURATION.md).

## The Mission

Codeloops: Event Horizon aims to create an MCP server that augments any AI model with an "artificial brain" - providing the contextual understanding, multi-perspective analysis, and persistent memory that transforms reactive coding agents into thoughtful, autonomous partners.

By combining actor-critic reinforcement learning with consensus-based decision making and contextual memory, Event Horizon brings us closer to truly intelligent coding assistance.

## Contributing & Support

This is an experimental fork exploring advanced AI augmentation techniques. 

- Original CodeLoops: [github.com/silvabyte/codeloops](https://github.com/silvabyte/codeloops)
- Event Horizon Fork: [github.com/Scarlet-Creative-Software/codeloops](https://github.com/Scarlet-Creative-Software/codeloops)
- Issues: [GitHub Issues](https://github.com/Scarlet-Creative-Software/codeloops/issues)

## License

MIT - See [LICENSE](./LICENSE)

---

*"At the event horizon of artificial intelligence, where reactive responses transform into thoughtful reasoning."*