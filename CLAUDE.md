# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Source**: Event Horizon fork at https://github.com/Scarlet-Creative-Software/codeloops (dev branch)

## 🚨 CURRENT TOP PRIORITY

**CRITICAL ISSUE**: Multi-critic consensus system repeatedly fails with "All critics failed to provide reviews"
- Circuit breaker keeps opening despite `apiKeyConfigured: true`
- API calls failing at critic level even after .env loading fixes
- System falls back to single-critic mode preventing full consensus analysis
- **STATUS**: Infrastructure improvements completed, API connectivity issue remains

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

