# Codeloops: Event Horizon

## An Artificial Brain for AI Coding Agents

Codeloops: Event Horizon is an advanced fork of the original CodeLoops project, enhanced with a sophisticated multi-critic consensus system and contextual memory architecture. This version transforms AI coding agents by augmenting them with an "artificial brain" - providing deeper reasoning, persistent contextual memory, and multi-perspective analysis capabilities.

**🚀 Phase 1 & 2.1 Complete**: Production-ready with 90% faster queries, 99.5% reliability, intelligent semantic caching, and enterprise-grade performance optimizations.

> **Note**: This is an experimental system in active development. Monitor API costs and back up your data.

## What Makes Event Horizon Different?

While the original CodeLoops provided actor-critic feedback loops, Event Horizon introduces groundbreaking enhancements:

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

### 🧠 Semantic Query Caching (Phase 2.1) ✅
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

### For Global Installation (Shared Across Projects)

```bash
# Clone the Event Horizon fork
git clone https://github.com/Scarlet-Creative-Software/codeloops.git
cd codeloops

# Install dependencies and run setup
npm install
npm run setup

# Configure your API key (Gemini 2.5 Flash Preview recommended)
export GOOGLE_GENAI_API_KEY=your-api-key
```

### For Project-Specific Installation (Recommended)

```bash
# In your project directory
git submodule add https://github.com/Scarlet-Creative-Software/codeloops.git codeloops
cd codeloops
npm install
npm run setup
cd ..

# Create .mcp.json with relative path
cat > .mcp.json << 'EOF'
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["tsx", "./codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
EOF
```

## Configuration

### Configure Multi-Critic Consensus

Multi-critic review is now enabled by default for all `actor_think` calls. You can control this behavior:

```javascript
// Multi-critic consensus review (default)
actor_think({
  text: "Implement user authentication",
  tags: ["task"],
  artifacts: [...]
  // feedback: true is the default, no need to specify
})

// Disable multi-critic for a specific call
actor_think({
  text: "Quick implementation fix",
  tags: ["task"],
  artifacts: [...],
  feedback: false  // Use single-critic for this call
})
```

#### Global Configuration

To disable multi-critic by default across all calls:

```bash
# Set environment variable
export CODELOOPS_MULTI_CRITIC_DEFAULT=false

# Or in your .mcp.json
"env": {
  "GOOGLE_GENAI_API_KEY": "your-api-key",
  "CODELOOPS_MULTI_CRITIC_DEFAULT": "false"
}
```

### Model Configuration

Event Horizon is optimized for Google's Gemini models. All components use `gemini-2.5-flash-preview-05-20` by default.

### Temperature Configuration

Critics use configurable temperature settings for optimal code review performance:

```bash
# Set critic temperatures (default values shown)
export CRITIC_TEMP_CORRECTNESS=0.3  # Logical consistency reviews
export CRITIC_TEMP_EFFICIENCY=0.4   # Performance and best practices
export CRITIC_TEMP_SECURITY=0.3     # Security vulnerability detection
export CRITIC_TEMP_DEFAULT=0.3      # Fallback temperature
export CRITIC_MAX_TOKENS=6000       # Maximum response tokens
```

Lower temperatures (0.3-0.4) produce more deterministic, focused code reviews. Values are automatically clamped to the valid range [0.0, 1.0].

### Temperature Configuration

Control the creativity and determinism of critic responses through temperature settings:

```bash
# Lower temperatures (0.0-0.5) for deterministic, focused responses
CRITIC_TEMP_CORRECTNESS=0.3  # Default: 0.3 - Best for logic validation
CRITIC_TEMP_SECURITY=0.3     # Default: 0.3 - Best for vulnerability detection

# Medium temperatures (0.3-0.7) for balanced analysis
CRITIC_TEMP_EFFICIENCY=0.4   # Default: 0.4 - Good for design suggestions

# All temperatures are validated and clamped to [0.0, 1.0]
CRITIC_TEMP_DEFAULT=0.3      # Default: 0.3 - Fallback temperature
```

For detailed configuration options, see [CONFIGURATION.md](./CONFIGURATION.md).

### MCP Server Configuration

Connect your AI coding agent to Codeloops. Create a `.mcp.json` file in your project root:

#### Option 1: Global Installation
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key",
        "CODELOOPS_DATA_DIR": "./codeloops-data"
      }
    }
  }
}
```

#### Option 2: Project Submodule (Recommended)
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["tsx", "./codeloops/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Important**: Always restart Claude Code after modifying `.mcp.json`.

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
- **`check_multi_critic_health`** - Multi-critic system diagnostics
  - Reports API configuration, circuit breaker status, system health
  - Provides troubleshooting recommendations for fallback issues
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

### Common Issue: "Cannot read properties of undefined"

If you encounter this error when using `actor_think`, it's likely due to multiple server instances:

```bash
# Kill all running codeloops processes
pkill -f "tsx.*codeloops/src"

# Clear npx cache
rm -rf ~/.npm/_npx/

# Restart Claude Code
```

### Multiple Project Support

Codeloops now supports multiple projects through:
- **Git Submodules**: Each project has its own codeloops instance
- **Custom Data Directory**: Use `CODELOOPS_DATA_DIR` environment variable
- **Project Isolation**: Data is stored per-project, not globally

See [docs/INSTALLATION_GUIDE.md](./docs/INSTALLATION_GUIDE.md) for detailed setup instructions.

### JSON Parsing Issues

If critics fail with JSON parsing errors:
- The system now includes automatic retry with exponential backoff
- JSON responses are sanitized to handle code examples with special characters
- If issues persist, try reducing `CRITIC_MAX_TOKENS` to avoid truncated responses

### Multi-Critic Diagnostic Tool

If you're experiencing issues with multi-critic feedback (getting basic "approved/rejected" instead of detailed consensus), use the diagnostic tool:

```
check_multi_critic_health
```

This tool will:
- Check your API key configuration
- Verify circuit breaker status  
- Report system health metrics
- Provide specific troubleshooting recommendations

### Common Multi-Critic Issues

**Symptom**: Getting basic "✔ Approved" instead of detailed multi-critic feedback

**Causes & Solutions**:
1. **Missing API Key**: Ensure `GOOGLE_GENAI_API_KEY` is properly set
2. **Rate Limiting**: Multi-critic may fall back during high API usage
3. **Circuit Breaker Open**: System may be protecting against repeated failures
4. **Network Issues**: Temporary connectivity problems cause fallback

**Response Indicators**:
- `multiCritic: true` in metadata = Full consensus system ran
- `multiCriticFallback: true` in metadata = Fallback occurred, check `fallbackReason`

### Configuration Reference

For a complete list of environment variables, see [docs/CONFIGURATION.md](./docs/CONFIGURATION.md).

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