# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Source**: Event Horizon fork at https://github.com/Scarlet-Creative-Software/codeloops (dev branch)

## ✅ RECENT RESOLUTIONS

**RESOLVED**: Gemini SDK structured output implementation (Latest)
- **Root Cause**: Critics using prompt-based JSON generation with manual parsing and retry logic
- **Solution**: Implemented native `responseSchema` with zodToJsonSchema conversion (no name parameter to avoid $ref)
- **Status**: All critics now use Gemini's native structured output for guaranteed valid JSON
- **Performance**: Eliminated JSON parsing errors, reduced API calls, improved reliability

**RESOLVED**: Multi-critic consensus system working correctly
- **Root Cause**: Request timeout errors (original timeout too short for variable critic analysis times)
- **Solution**: Increased timeout to 120s for multi-critic operations, improved schema validation
- **Status**: Multi-critic system operational, 3 specialized critics working in parallel
- **Performance**: 60-90s total execution time with 120s timeout buffer for complex analysis

## Essential Guidelines

- **SDK**: Use `@google/genai` (NEW) not `@google/generative-ai` (DEPRECATED - ends Aug 31, 2025). See genai-node-reference.md
- **Release Notes**: All release notes MUST go in CHANGELOG.md
- **Documentation**: Update existing docs rather than creating new files
- **Testing**: Always run `npm test` and `npm run lint:all` after changes

## Development Roadmap

Local documentation in `/dev_roadmap/` (excluded from git): Development_Roadmap.md, phase1/, phase2/, plans/, summaries/

## Essential Commands

**Development**: `npm install` | `npm start` | `npm test` | `npm run lint:all` | `npm run setup`
**Python Agents**: `cd agents/critic && uv run agent` | `cd agents/summarize && uv run agent`

## Architecture

MCP server implementing Actor-Critic RL approach for AI coding agents.

**Core Components**:
- **ActorCriticEngine**: Orchestrates Actor/Critic/Summarization interaction and reward tracking
- **KnowledgeGraph**: Persistent NDJSON storage (`./data/knowledge_graph.ndjson`) with semantic tags
- **Tag System**: requirement, task, design, risk, task-complete, summary
- **Python Agents**: Critic (reviews) and Summarize (summaries) using fast-agent framework

**Key Tools**: `actor_think` | `critic_review` | `resume` | `export` | `search_nodes` | `get_node` | `get_neighbors` | `artifact_history` | `list_open_tasks` | `list_projects` | `get_cache_stats` | `cleanup_caches` | `check_multi_critic_health`

**Environment Variables**: `GOOGLE_GENAI_API_KEY` (required) | `LOG_LEVEL` | `OLLAMA_BASE_URL` | `FASTAGENT_BASE_URL` | `CODELOOPS_DATA_DIR` | `CODELOOPS_MULTI_CRITIC_DEFAULT`

**Model**: All Gemini API calls use `gemini-2.5-flash-preview-05-20` (standardized per genai-node-reference.md)

## MCP Servers Reference

### Primary Tools
1. **CodeLoops** (Always start here): Task planning with `actor_think` - supports multi-critic consensus (3 parallel critics), knowledge graph storage, artifact management
2. **Context7**: Library documentation via `resolve-library-id` and `get-library-docs`
3. **WCGW**: File operations via `Initialize`, `ReadFiles`, `FileEdit`, `BashCommand`
4. **Jinni**: Multi-file context via `read_context` (100MB limit)

### Specialized Tools  
5. **Firebase MCP**: Firebase services (requires `SERVICE_ACCOUNT_KEY_PATH`)
6. **Playwright**: Modern browser automation (`npx @playwright/mcp@latest`)
7. **Fetch MCP**: Static web content (`mcp__fetch__fetch`)
8. **Puppeteer**: Fallback browser automation

### CodeLoops Workflow
**Core Tool**: `actor_think(text, tags, artifacts, projectContext, parents?, diff?, feedback?)`
- **Tags**: At least one of [Requirement, Task, Design, Risk, TaskComplete, Summary]
- **Artifacts**: `[{"name": "file.ext", "content": "..."}]`
- **Feedback**: `true` (3 critics) or `false` (single critic)
- **Hygiene**: ≤600 words per text, no backticks in JSON, plain quotes

**Workflow**: `list_projects` → `actor_think` → iterate until approved → `export`

### Installation Commands
```bash
# CodeLoops (this project)
npx -y tsx /Users/matthewamann/codeloops/src

# Others
npx -y @upstash/context7-mcp@latest                    # Context7
uv tool run --python 3.12 wcgw@latest                 # WCGW  
uvx jinni-server                                       # Jinni
SERVICE_ACCOUNT_KEY_PATH="/path/key.json" npx -y @gannonh/firebase-mcp  # Firebase
npx @playwright/mcp@latest                             # Playwright
claude mcp add fetch uvx mcp-server-fetch             # Fetch
npx -y @modelcontextprotocol/server-puppeteer         # Puppeteer
```

## Event Horizon Features

| Feature | Status | Key Benefits |
|---------|--------|--------------|
| **Multi-Critic Consensus** | ✅ COMPLETED | 3 parallel critics (Correctness, Efficiency, Security), 13-67s execution |
| **Key Memory System** | ✅ COMPLETED | 10 memories per critic, artifact-based retrieval, LRU eviction |
| **Artifact Content Loading** | ✅ COMPLETED | Auto-loads file contents (3000 lines max), comprehensive review |
| **Semantic Query Caching** | ✅ COMPLETED | 40-60% cache hit rate, vector embeddings, <10ms similarity search |

## Troubleshooting

### Multi-Critic Issues
**Problem**: Basic feedback instead of detailed consensus analysis
**Solution**: Check `check_multi_critic_health`, verify `GOOGLE_GENAI_API_KEY`, ensure `feedback: true`

### Server Crashes  
**Problem**: `Cannot read properties of undefined` in `actor_think`
**Solution**: Kill processes (`pkill -f "tsx.*codeloops/src"`), clear npx cache, restart Claude Code

### Large File Limitations
**Note**: Some core files like `KnowledgeGraph.ts` and `IndexSystem.ts` are too large to read with wcgw ReadFiles tool
**Solution**: Use targeted searches, smaller file sections, or BashCommand with head/tail for large file analysis

## ⚙️ MCP CONFIGURATION FOR THIS PROJECT

**IMPORTANT**: This project uses a **stable MCP installation** to avoid development disruption.

### Current Configuration (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "codeloops": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/matthewamann/.codeloops-stable/src"],
      "env": {
        "GOOGLE_GENAI_API_KEY": "...",
        "CODELOOPS_MULTI_CRITIC_DEFAULT": "true",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### Deployment Process
When development changes need to be deployed to the active MCP server:
1. **Test changes thoroughly** with `npm run lint:all` and `npm test`
2. **Deploy to stable installation**: `cp -r /Users/matthewamann/codeloops/* ~/.codeloops-stable/`
3. **Restart Claude Code** to pick up changes

**Rationale**: Using `~/.codeloops-stable/src` instead of live development source prevents MCP server crashes during development work.

