# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Source Branch**: This is the Event Horizon fork maintained at https://github.com/Scarlet-Creative-Software/codeloops (dev branch)

## Important Guidelines

- **Release Notes**: All release notes MUST go in CHANGELOG.md. Never create separate release notes files.
- **Documentation**: Update existing docs rather than creating new files unless absolutely necessary.
- **Testing**: Always run tests after making changes (`npm test` and `npm run lint:all`).

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
- `CODELOOPS_DATA_DIR` - Optional custom data directory (default: `./data` relative to codeloops installation)

### Model Configuration

- **IMPORTANT**: All Gemini API calls use `gemini-2.5-flash-preview-05-20` model
- This includes MultiCriticEngine, geminiCache, and any generateObject calls
- Model version is standardized across the codebase per genai-node-reference.md

## MCP Servers Reference

This section documents all available MCP (Model Context Protocol) servers and their usage.

**Codeloops** – (Always invoke when starting a task)  
For iterative development, planning, and knowledge management in coding tasks.
- `actor_think(text, tags, artifacts, projectContext, parents?, diff?, feedback?)`  
  • Add a new thought, plan, design, requirement, etc., to the knowledge graph.  
  • **tags** — include **at least one** **Tag** enum value:
    `[Tag.Requirement, Tag.Task, Tag.Design, Tag.Risk, Tag.TaskComplete, Tag.Summary]`  
  • **artifacts** — pass an array of inline objects:  
    `{ "name": "<filename.ext>", "content": "<full or stub file contents>" }`  
  • **feedback** — set to `true` to enable multi-critic consensus review (3 parallel critics)
  • **payload hygiene** — to avoid parser errors:  
    1. Keep each `text` ≤ 600 words; split very long analyses across multiple calls.  
    2. Attach code via `artifacts`; do **not** embed triple back-ticks inside the JSON.  
    3. Ensure `text` starts with a plain quote (`"`), with no leading backslashes or whitespace.  
  • Auto-critic feedback runs automatically; use `critic_review(node_id)` only for a manual re-audit.
- `critic_review(actorNodeId, projectContext)` — manually re-run the critic on a specific thought.
- `list_projects(projectContext?)` — list available projects.
- `resume(projectContext, limit?)` — load the last *n* thoughts (default 20) from the project.
- `export(projectContext, limit?)` — export the current plan in a structured format.
- `search_nodes(projectContext, query?, tags?)` — filter nodes by free-text query or list of enum tags.
- `artifact_history(projectContext, path, limit?)` — retrieve all nodes referencing the given artifact path.
- `get_neighbors(id, projectContext, depth?)` — retrieve a node along with its parents and children up to the specified depth.
- `get_node(id)` — retrieve a specific node by its ID.
- `list_open_tasks(projectContext)` — list all actor nodes tagged `Task` that aren't marked `TaskComplete`.

**Recommended Loop:**  
1. Use `list_projects` to see available projects (new projects created automatically on first use).  
2. `actor_think` → automatic critic feedback.  
3. Iterate step 2 until the critic reports no issues.  
4. Optional `critic_review` for a deeper manual audit.  
5. Use `export` to review your progress.

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

## Event Horizon Features

### Multi-Critic Consensus System ✅
**Status**: COMPLETED

The multi-critic consensus system provides parallel review by three specialized critics when using `feedback:true`:

**Critics**:
1. **Correctness Critic**: Logical consistency, edge cases, algorithm accuracy
2. **Efficiency Critic**: Performance, maintainability, best practices  
3. **Security Critic**: Vulnerabilities, input validation, defensive programming

**Features**:
- Parallel critic invocation for faster reviews
- Cross-critic comparison and debate
- Consensus building with confidence-weighted voting
- Structured response parsing with Zod validation
- Graceful fallback to single-critic on failure

**Performance**:
- Multi-critic: ~13-67s depending on complexity (within reasonable targets)
- Single-critic: ~9.64s
- Log growth: 1.5x increase (sustainable)
- Real-world test: 67.6s execution time with 8.75 KB log growth

### Key Memory System ✅
**Status**: COMPLETED

Critics maintain contextual memory across actor_think calls:

**Features**:
- Each critic stores up to 10 key memories
- Memories expire after 10 unused tool calls
- Artifact-based retrieval with automatic lifespan extension
- LRU eviction when memory slots are full
- Memory statistics via `getMemoryStats()`
- **Memory isolation**: Memories are only visible to critic models, never sent to the actor model

**Implementation**:
- `KeyMemorySystem` class in `src/engine/KeyMemorySystem.ts`
- Integrated into `MultiCriticEngine`
- Full unit test coverage (9 tests passing)

### Artifact Content Loading ✅
**Status**: COMPLETED

Critics automatically receive full file contents for proper context:

**Features**:
- Automatic loading of artifact contents from filesystem
- Max 3000 lines per file (truncated with notification if larger)
- Supports both inline content and filesystem reading
- Graceful error handling for missing/unreadable files
- File contents included in critic prompts for comprehensive review

**Implementation**:
- `loadArtifactContents` method in `MultiCriticEngine`
- Integrated into `gatherContext` workflow
- Full unit test coverage (5 tests passing)

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

### Troubleshooting Codeloops MCP

If the codeloops MCP server crashes with `Cannot read properties of undefined` when calling `actor_think`:

1. **Check for multiple server instances** - Kill all running codeloops processes:
   ```bash
   pkill -f "tsx.*codeloops/src"
   ```

2. **Clear npx cache** if using codeloops from other projects:
   ```bash
   rm -rf ~/.npm/_npx/
   ```

3. **Configure the MCP server properly** in your `.mcp.json`:
   
   **Option A: For External Projects** (using absolute path):
   ```json
   {
     "mcpServers": {
       "codeloops": {
         "command": "npx",
         "args": ["-y", "tsx", "/Users/matthewamann/codeloops/src"],
         "env": {
           "GOOGLE_GENAI_API_KEY": "your-api-key-here"
         }
       }
     }
   }
   ```
   
   **Option B: For Local Installation** (when codeloops is in your project):
   ```json
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
   ```
   
   **Option C: Published NPM Package** (future):
   ```json
   {
     "mcpServers": {
       "codeloops": {
         "command": "npx",
         "args": ["-y", "@codeloops/mcp-server"],
         "env": {
           "GOOGLE_GENAI_API_KEY": "your-api-key-here"
         }
       }
     }
   }
   ```

4. **Restart Claude Code** after making configuration changes

5. **Verify dependencies** are installed in the codeloops directory:
   ```bash
   cd /Users/matthewamann/codeloops
   npm install
   npm run setup
   ```