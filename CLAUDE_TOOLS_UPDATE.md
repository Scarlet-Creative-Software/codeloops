# Updated CodeLoops MCP Tools Section

Replace the tools section in CLAUDE.md with:

### CodeLoops – (Always invoke when starting a task)  
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

## Non-existent Tools (mentioned in docs but not implemented)
- `create_project` - Projects are created automatically when first used
- `switch_project` - Use projectContext parameter instead
- `list_branches` - Not implemented
- `summarize` - Internal functionality, not exposed as MCP tool
- `update_node` - Not implemented
- `delete_node` - Not implemented