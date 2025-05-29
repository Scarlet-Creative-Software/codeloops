# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm install` - Install dependencies
- `npm start` - Start the MCP server
- `npm test` - Run all tests with Vitest
- `npm test -- path/to/test.ts` - Run a specific test file
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm run lint:all` - Run both ESLint and TypeScript checks
- `npm run format` - Format code with Prettier
- `npm run setup` - Run initial setup script

### Python Agents
- `cd agents/critic && uv run agent` - Run the Critic agent
- `cd agents/summarize && uv run agent` - Run the Summarize agent

## Architecture

This is a Model Context Protocol (MCP) server implementing an Actor-Critic reinforcement learning approach for AI coding agents.

### Core Components

1. **ActorCriticEngine** (`src/engine/ActorCriticEngine.ts`)
   - Orchestrates interaction between Actor (you), Critic, and Summarization agents
   - Manages action proposals, reviews, and refinements
   - Tracks temporal difference learning rewards

2. **KnowledgeGraph** (`src/engine/KnowledgeGraph.ts`)
   - Persistent NDJSON storage for maintaining context across sessions
   - Stores nodes with semantic tags (requirement, task, design, risk, task-complete, summary)
   - Implements cycle detection and relationship management
   - Located at `./data/knowledge_graph.ndjson`

3. **Tag System** (`src/engine/tags.ts`)
   - Semantic categorization for knowledge nodes
   - Tags: requirement, task, design, risk, task-complete, summary

4. **Python Agents** (in `agents/` directory)
   - **Critic**: Reviews and provides feedback on Actor proposals
   - **Summarize**: Creates concise summaries of completed work
   - Built with fast-agent framework

### MCP Tools Available

- `actor_think` - Propose actions with reasoning (supports feedback:true for multi-critic)
- `critic_review` - Get Critic feedback on proposals
- `resume` - Resume from previous session
- `export` - Export knowledge graph
- `search_nodes` - Search knowledge by tag/content
- `get_node` - Retrieve specific node by ID
- `get_neighbors` - Find connected nodes (parents/children)
- `artifact_history` - Get history for specific file
- `list_open_tasks` - List incomplete tasks
- `list_projects` - List all available projects

### Testing

- Tests use Vitest framework
- Test files are colocated with source files (`.test.ts`)
- Mock implementations in test files for external dependencies

### Key Environment Variables

- `LOG_LEVEL` - Logging level (default: "info")
- `GOOGLE_GENAI_API_KEY` - Required for Google AI integration
- `OLLAMA_BASE_URL` - Optional Ollama endpoint
- `FASTAGENT_BASE_URL` - Optional fast-agent endpoint

### Model Configuration

- **IMPORTANT**: All Gemini API calls use `gemini-2.5-flash-preview-05-20` model
- This includes MultiCriticEngine, geminiCache, and any generateObject calls
- Model version is standardized across the codebase per genai-node-reference.md

## MCP Servers Reference

This section documents all available MCP (Model Context Protocol) servers and their usage.

### CodeLoops – (Always invoke when starting a task)  
For iterative development, planning, and knowledge management in coding tasks.
- `actor_think(text, tags, artifacts, parents?, diff?)`  
  • Add a new thought, plan, design, requirement, etc., to the knowledge graph.  
  • **tags** — include **at least one** **Tag** enum value:
    `[Tag.Requirement, Tag.Task, Tag.Design, Tag.Risk, Tag.TaskComplete, Tag.Summary]`  
  • **artifacts** — pass an array of inline objects:  
    `{ "name": "<filename.ext>", "content": "<full or stub file contents>" }`  
  • **payload hygiene** — to avoid parser errors:  
    1. Keep each `text` ≤ 600 words; split very long analyses across multiple calls.  
    2. Attach code via `artifacts`; do **not** embed triple back-ticks inside the JSON.  
    3. Ensure `text` starts with a plain quote (`"`), with no leading backslashes or whitespace.  
  • Auto-critic feedback runs automatically; use `critic_review(node_id)` only for a manual re-audit.
- `critic_review(node_id)` — manually re-run the critic on a specific thought.
- `list_projects()` — list available projects.
- `create_project(name)` — start a new project.
- `switch_project(project_id)` — change the active project context.
- `list_branches()` — show all branches in the current project.
- `resume(limit?)` — load the last *n* thoughts (default 20) from the active branch.
- `summarize(tag?)` — generate a compact summary of the active branch, optionally filtered by a tag.
- `export(tag?)` — export the current plan in a structured format, optionally filtered by a tag.
- `search_nodes(query, tags?)` — filter nodes by free-text query or list of enum tags.
- `artifact_history(path)` — retrieve all nodes referencing the given artifact path.
- `get_neighbors(node_id, depth?)` — retrieve a node along with its parents and children up to the specified depth.
- `list_open_tasks()` — list all actor nodes tagged `Task` that aren’t marked `TaskComplete`.
**Recommended Loop:**  
1. `create_project` (or `switch_project` to resume an existing project).  
2. `actor_think` → automatic critic feedback.  
3. Iterate step 2 until the critic reports no issues.  
4. Optional `critic_review` for a deeper manual audit.  
5. `summarize` and/or `export` to review or share your progress.  

### Context7 - Use for verifying accuracy of library methods before writing code
- Use `resolve-library-id` to identify the correct library or module based on its name or identifier.
- Use `get-library-docs` to retrieve documentation for the specified library or module.
- Always verify the accuracy of methods and syntax used for project libraries using these tools.

### WCGW - Use for efficiently browsing the codebase and reading files
- Use `Initialize` at the start of a session—or to resume a saved checkpoint—to set the workspace (`any_workspace_path`), preload `initial_files_to_read`, choose `mode_name` (`"wcgw"`, `"architect"`, or `"code_writer"`), and optionally supply `task_id_to_resume`.
- Run shell commands with `BashCommand`; provide a single `command` per call, add `wait_for_seconds` when the command may take time, and avoid chaining multiple commands in one string.
- Always read a file first with `ReadFiles` before modifying it; create new empty files with `WriteIfEmpty` and update existing files using `FileEdit` with search-replace blocks.
- Call `ContextSave` to checkpoint work or transfer knowledge, including a succinct `description` and `relevant_file_globs` array.
- Treat every `BashCommand` as potentially destructive: review the `command` carefully, never run irreversible operations unless explicitly instructed, and respect the single-command execution model enforced by wcgw.
- Default to `"wcgw"` mode unless the user directs otherwise; switch to `"architect"` for planning or `"code_writer"` to restrict edits to specified paths and commands.
- For long-running or interactive commands, use short polling intervals via `wait_for_seconds` to maintain responsive feedback, and never attempt to exit the underlying screen session.
- Leverage `ReadImage` when an image file’s contents are needed, but prefer textual data whenever possible.

### Jinni - For tasks that need multi-file or whole-project visibility; prefer simpler file readers for single-file queries.
- Use the `read_context` tool to generate concatenated content (or a file list when `list_only` is `true`) from one or more project paths.
- Always include `project_root` (absolute path), `targets` (array of file or directory paths; pass `[]` to include the entire project), and `rules` (array of `.gitignore`-style patterns; use `[]` to rely on defaults and any `.contextfiles`).
- Set `list_only` to `true` when you only need file paths; omit or `false` when you need full content.
- Respect the default 100 MB context ceiling; override with `size_limit_mb` only when explicitly justified.
- Ensure all requested paths resolve inside `project_root`; if extra isolation is required, configure the server or CLI with the `--root` flag.

### Firebase MCP – Use when tasks require direct access to Firebase services (Firestore, Storage, Authentication)
- **When to use**: any coding or data-management task that needs to create, read, update, or delete Firebase resources.  
- **Client configuration (Cursor)**: add a `firebase-mcp` block to `[project root]/.cursor/mcp.json`, pointing `"command": "npx"` at `@gannonh/firebase-mcp` for a zero-install workflow.  
- **Required environment variable**: set `SERVICE_ACCOUNT_KEY_PATH` to an **absolute** path for the Firebase service-account JSON key generated in *Firebase Console → Project Settings → Service Accounts → “Generate new private key”*.  
- **Optional environment variables**:  
  • `FIREBASE_STORAGE_BUCKET` – override default bucket `[projectId].appspot.com`  
  • `MCP_TRANSPORT` – `"stdio"` (default) or `"http"`  
  • `MCP_HTTP_PORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PATH` – ports/host/path when using HTTP transport  
  • `DEBUG_LOG_FILE` – `true` or a file path to enable debug logging.  
- **Local installation alternative**: if you clone the repo and build locally, use `"command": "node"` with the path to `dist/index.js` instead of `npx`.  
- **Quick test**: after launching the server, ask the assistant “Please test all Firebase MCP tools.” to verify the connection.  
- **Known issue**: `firestore_list_collections` may log a Zod validation error; the call still succeeds and returns correct data.  
- **Security note**: never commit the service-account JSON to version control—keep it outside the repo and reference it only through the environment variable.

### Playwright MCP - Browser automation for navigating and testing website elements
- **Command**: `npx @playwright/mcp@latest [options]`
- **Key options**:
  - `--browser <browser>` - Browser to use (chrome, firefox, webkit, msedge)
  - `--headless` - Run in headless mode (headed by default)
  - `--device <device>` - Device to emulate (e.g., "iPhone 15")
  - `--viewport-size <size>` - Browser viewport size (e.g., "1280, 720")
  - `--vision` - Use screenshots instead of accessibility snapshots
- **Key tools**:
  - `browser_navigate` - Navigate to URL
  - `browser_snapshot` - Get accessibility snapshot (preferred over screenshot)
  - `browser_click/hover/type` - Interact with elements
  - `browser_take_screenshot` - Visual capture
  - `browser_tab_*` - Tab management
  - `browser_wait_for` - Wait for conditions
- **Best for**: JavaScript-heavy sites, form interactions, multi-step workflows

### Fetch MCP - Web content fetching server for retrieving and processing web pages
- Use `mcp__fetch__fetch` to retrieve web content and convert HTML to markdown
- Installation: `claude mcp add fetch uvx mcp-server-fetch`
- Parameters:
  - `url` (required): The URL to fetch content from
  - `max_length` (optional): Maximum number of characters to return
  - `start_index` (optional): Character index to start reading from
  - `raw` (optional): Set to true to get raw HTML instead of converted markdown
- Usage examples:
  ```
  # Fetch and convert to markdown (default)
  mcp__fetch__fetch(url="https://example.com")
  
  # Fetch with length limit
  mcp__fetch__fetch(url="https://example.com", max_length=5000)
  
  # Fetch raw HTML
  mcp__fetch__fetch(url="https://example.com", raw=true)
  
  # Fetch with pagination
  mcp__fetch__fetch(url="https://example.com", start_index=1000, max_length=2000)
  ```
- Best for: Static web pages, documentation sites, articles
- Not suitable for: JavaScript-heavy sites (use Playwright/Puppeteer instead)

### Puppeteer - Fallback browser automation MCP only to be used if Playwright is having persistent issues
- Use `puppeteer_navigate` to load a URL in a headless browser when interactive steps or visual review are required.
- Chain additional calls (`puppeteer_click`, `puppeteer_fill`, `puppeteer_select`, `puppeteer_hover`, `puppeteer_evaluate`) to progress through JavaScript-heavy flows.
- Prefer `puppeteer_evaluate` to extract DOM text; call `puppeteer_screenshot` only when visual confirmation is essential.
- Reserve puppeteer for situations where simpler tools (`fetch` or `markdown-downloader`) cannot access the necessary data.

## Current Task Status

### Multi-Critic Consensus System Implementation
**Status**: In Progress

**Completed**:
1. ✅ Fixed existing test failures in KnowledgeGraph.test.ts and ActorCriticEngine.test.ts
2. ✅ Added feedback parameter to ActorThinkSchema 
3. ✅ Created MultiCriticEngine class with:
   - Parallel critic invocation
   - Context gathering module
   - Three specialized critic prompts (correctness, efficiency, security)
   - Cross-critic comparison logic
   - Consensus building algorithm
   - Final synthesis module
   - Structured response parsing
   - Fallback to single-critic mode on failure
4. ✅ Integrated MultiCriticEngine into ActorCriticEngine

**Current Status**:
✅ MULTI-CRITIC SYSTEM FULLY IMPLEMENTED AND TESTED!
- Fixed all import paths to use .js extensions
- generateObject function implemented and working
- DagNode already has metadata field
- All unit tests for MultiCriticEngine are passing
- Integration with ActorCriticEngine is complete
- Tested feedback:true feature with real scenarios

**Test Results**:
- Single critic: 9.64s, 5.23 KB log growth
- Multi-critic: 13.38s, 7.72 KB log growth  
- Multi-critic is 1.4x slower and generates 1.5x more log data
- Log file growth is sustainable (current: 10.22 MB)
- Fallback to single critic works when multi-critic fails

**Next Steps**:
1. Add integration tests with real coding scenarios
2. Performance testing to ensure <30s response time
3. Add configuration schema for multi-critic settings
4. Create monitoring/metrics for consensus rates
5. Documentation for multi-critic feature usage

**Pending Tasks**:
- Re-enable cycle detection in KnowledgeGraph
- Fix summarization functionality
- Add configuration schema for multi-critic settings
- Create monitoring/metrics for consensus rates
- Documentation for multi-critic feature usage

### Key Memory System ✅
**Purpose**: Enable critics to maintain contextual memory across actor_think calls

**Status**: COMPLETED

**Features Implemented**:
1. Each critic can include a `store_memory` field in their response
2. Each critic maintains up to 10 key memories independently
3. Memories expire after 10 actor_think calls without being referenced
4. When artifacts match stored memories, those memories are retrieved and their lifespan incremented by 1 (max 10)
5. When memory slots are full, least recently used memories are evicted
6. Only thought content, artifacts, tags, and critic responses are stored (to conserve tokens)

**Key Components**:
- `KeyMemorySystem` class handles all memory operations
- Integrated into `MultiCriticEngine` with automatic memory context injection
- Memory statistics available via `getMemoryStats()` method
- Full unit test coverage (9 tests, all passing)

## MCP Server Summary

### Quick Reference
1. **CodeLoops** - Always use for task planning and tracking with `actor_think`
2. **Context7** - Library documentation lookup (`resolve-library-id`, `get-library-docs`)
3. **WCGW** - Efficient file browsing and editing (`Initialize`, `ReadFiles`, `FileEdit`)
4. **Jinni** - Whole-project context reading (`read_context`)
5. **Firebase MCP** - Firebase services (Firestore, Storage, Auth)
6. **Playwright** - Modern browser automation (preferred)
7. **Puppeteer** - Fallback browser automation
8. **Fetch MCP** - Simple web content fetching

### Installation Commands
```bash
# Context7
npx -y @upstash/context7-mcp@latest

# Puppeteer
npx -y @modelcontextprotocol/server-puppeteer

# WCGW
uv tool run --python 3.12 wcgw@latest

# Jinni
uvx jinni-server

# CodeLoops (this project)
npx -y tsx /Users/matthewamann/codeloops/src

# Firebase MCP
SERVICE_ACCOUNT_KEY_PATH="/path/to/key.json" npx -y @gannonh/firebase-mcp

# Playwright
npx @playwright/mcp@latest

# Fetch MCP
claude mcp add fetch uvx mcp-server-fetch
```