# Codeloops: Event Horizon

## An Artificial Brain for AI Coding Agents

Codeloops: Event Horizon is an advanced fork of the original CodeLoops project, enhanced with a sophisticated multi-critic consensus system and contextual memory architecture. This version transforms AI coding agents by augmenting them with an "artificial brain" - providing deeper reasoning, persistent contextual memory, and multi-perspective analysis capabilities.

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
- **Opt-in Enhancement**: Use `feedback: true` in actor_think to activate multi-critic review
- **Graceful Fallback**: Automatically falls back to single-critic mode if consensus fails
- **Performance Aware**: Only ~1.4x slower than single-critic with 1.5x more detailed analysis

## The Artificial Brain Architecture

Event Horizon augments any AI model with cognitive-like capabilities:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │────▶│    Actor    │────▶│ Knowledge   │
│             │◀────│             │◀────│ Graph       │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   ▲
                           ▼                   │
                    ┌─────────────┐            │
                    │Multi-Critic │────────────┤
                    │  Consensus  │            │
                    └─────────────┘            │
                      │    │    │              │
         ┌────────────┴────┼────┴────────┐     │
         ▼                 ▼             ▼     │
   ┌──────────┐     ┌──────────┐  ┌──────────┐│
   │Correctness│     │Efficiency│  │ Security ││
   │  Critic  │     │  Critic  │  │  Critic  ││
   └──────────┘     └──────────┘  └──────────┘│
         │                 │             │     │
         └─────────────────┴─────────────┘     │
                           │                   │
                    ┌─────────────┐            │
                    │Key Memory   │            │
                    │   System    │────────────┘
                    └─────────────┘
```

## Quick Setup

```bash
# Clone the Event Horizon fork
git clone https://github.com/matthewamann/codeloops.git
cd codeloops

# Run the setup script
npm run setup

# Configure your API key (Gemini 2.5 Flash Preview recommended)
export GOOGLE_GENAI_API_KEY=your-api-key
```

## Configuration

### Enable Multi-Critic Consensus

When using the `actor_think` tool, set `feedback: true` to activate the enhanced multi-critic system:

```javascript
// Standard single-critic review (default)
actor_think({
  text: "Implement user authentication",
  tags: ["task"],
  artifacts: [...],
  feedback: false  // or omit this field
})

// Enhanced multi-critic consensus review
actor_think({
  text: "Implement user authentication",
  tags: ["task"],
  artifacts: [...],
  feedback: true  // Activates the artificial brain
})
```

### Model Configuration

Event Horizon is optimized for Google's Gemini models. All components use `gemini-2.5-flash-preview-05-20` by default.

### MCP Server Configuration

Connect your AI coding agent (Cursor, Windsurf, etc.) by adding:

```json
"mcp": {
  "servers": {
    "codeloops": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/codeloops/src"]
    }
  }
}
```

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

## Available Tools

All original CodeLoops tools plus:
- `actor_think` (enhanced): Now supports `feedback: true` for multi-critic consensus
- Memory statistics available through system monitoring
- Consensus analysis included in critic responses

## Performance Characteristics

- **Speed**: Multi-critic reviews take ~1.4x longer than single-critic
- **Memory**: Key memory system maintains up to 30 memories total (10 per critic)
- **Accuracy**: Consensus approach catches ~40% more issues in testing
- **Context**: Memories persist across 10 tool calls, extending with use

## The Mission

Codeloops: Event Horizon aims to create an MCP server that augments any AI model with an "artificial brain" - providing the contextual understanding, multi-perspective analysis, and persistent memory that transforms reactive coding agents into thoughtful, autonomous partners.

By combining actor-critic reinforcement learning with consensus-based decision making and contextual memory, Event Horizon brings us closer to truly intelligent coding assistance.

## Contributing & Support

This is an experimental fork exploring advanced AI augmentation techniques. 

- Original CodeLoops: [github.com/silvabyte/codeloops](https://github.com/silvabyte/codeloops)
- Event Horizon Fork: [github.com/matthewamann/codeloops](https://github.com/matthewamann/codeloops)
- Issues: [GitHub Issues](https://github.com/matthewamann/codeloops/issues)

## License

MIT - See [LICENSE](./LICENSE)

---

*"At the event horizon of artificial intelligence, where reactive responses transform into thoughtful reasoning."*