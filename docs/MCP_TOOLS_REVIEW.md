# CodeLoops MCP Tools Comprehensive Review

## Overview

This document provides a comprehensive review of all available MCP tools in the CodeLoops Event Horizon system, including their parameters, usage, and the multi-critic consensus system.

## Available MCP Tools (10 total)

### 1. actor_think
**Purpose**: Primary tool for adding thoughts to the knowledge graph and triggering critic reviews

**Parameters**:
- `text` (string, required): The thought content to add
- `tags` (array of TagEnum, required): At least one tag from ["requirement", "task", "design", "risk", "task-complete", "summary"]
- `artifacts` (array of objects, required): Array of {name: string, content: string} objects
- `projectContext` (string, required): Full path to the project directory
- `parents` (array of strings, optional): Parent node IDs to link to
- `diff` (string, optional): Diff content for code changes
- `feedback` (boolean, optional): Enable multi-critic consensus review (default: false)

**Key Features**:
- Automatically triggers critic review when appropriate
- With feedback:true, activates 3 parallel critics (correctness, efficiency, security)
- Falls back to single critic if multi-critic fails
- Returns actor node or critic node depending on review trigger

### 2. critic_review
**Purpose**: Manually trigger critic evaluation on a specific actor node

**Parameters**:
- `actorNodeId` (string, required): ID of the actor node to critique
- `projectContext` (string, required): Full path to the project directory

**Usage Note**: Rarely needed as actor_think handles reviews automatically

### 3. get_node
**Purpose**: Retrieve a specific node by its ID

**Parameters**:
- `id` (string, required): ID of the node to retrieve

### 4. get_neighbors
**Purpose**: Get a node along with its parents and children

**Parameters**:
- `id` (string, required): ID of the central node
- `projectContext` (string, required): Full path to the project directory
- `depth` (number, optional): Levels of neighbors to include (default: 1)

### 5. resume
**Purpose**: Load recent nodes from the current project to continue work

**Parameters**:
- `projectContext` (string, required): Full path to the project directory
- `limit` (number, optional): Number of nodes to return (default: 20)

### 6. export
**Purpose**: Export the knowledge graph for the current project

**Parameters**:
- `projectContext` (string, required): Full path to the project directory
- `limit` (number, optional): Limit number of nodes returned

### 7. search_nodes
**Purpose**: Search nodes by tags and/or text content

**Parameters**:
- `projectContext` (string, required): Full path to the project directory
- `tags` (array of TagEnum, optional): Tags to filter by
- `query` (string, optional): Text to search for in thoughts
- `limit` (number, optional): Limit results

### 8. artifact_history
**Purpose**: Get all nodes that reference a specific file/artifact

**Parameters**:
- `projectContext` (string, required): Full path to the project directory
- `path` (string, required): Artifact path to look up
- `limit` (number, optional): Limit results

### 9. list_open_tasks
**Purpose**: List all tasks that haven't been marked complete

**Parameters**:
- `projectContext` (string, required): Full path to the project directory

### 10. list_projects
**Purpose**: List all available knowledge graph projects

**Parameters**:
- `projectContext` (string, optional): Current project path to highlight

## Multi-Critic Consensus System

### Overview
When `feedback: true` is passed to actor_think, the system activates three specialized critics that work in parallel:

1. **Correctness Critic**: Validates logic, edge cases, and algorithm accuracy
2. **Efficiency Critic**: Evaluates performance, maintainability, and best practices
3. **Security Critic**: Identifies vulnerabilities and ensures defensive programming

### How It Works

1. **Context Gathering**: Retrieves relevant context including:
   - Parent and child nodes
   - Recent project activity
   - Artifact history
   - Key memories from previous analyses

2. **Parallel Analysis**: All three critics analyze simultaneously

3. **Cross-Critic Comparison**: Critics review each other's findings

4. **Consensus Building**: System identifies:
   - Unanimous agreements
   - Majority opinions
   - Important minority viewpoints

5. **Final Synthesis**: Produces unified feedback with:
   - Consensus score (0-100)
   - Prioritized recommendations
   - Structured improvement suggestions

### Key Memory System

- Each critic maintains up to 10 contextual memories
- Memories persist for 10 actor_think calls
- Retrieved automatically when working on related artifacts
- LRU eviction when memory slots are full
- Extends lifespan when memories are accessed

### Performance Characteristics

- ~1.4x slower than single-critic mode
- Generates ~1.5x more detailed analysis
- Catches ~40% more issues in testing
- Graceful fallback to single critic on failure

## Tools Not Available as MCP

The following tools are mentioned in documentation but not exposed as MCP tools:
- `update_node` - Not implemented
- `delete_node` - Not implemented
- `create_project` - Projects created automatically on first use
- `switch_project` - Handled via projectContext parameter
- `list_branches` - Not implemented
- `summarize` - Internal functionality, not exposed

## Best Practices

1. **Always use actor_think** as the primary interaction method
2. **Enable feedback:true** for critical decisions and security-sensitive code
3. **Include meaningful tags** to enable search and proper critic activation
4. **Attach code as artifacts** rather than embedding in text
5. **Keep text under 600 words** to avoid parser errors
6. **Use projectContext consistently** to maintain project isolation

## Common Workflows

### Starting a New Feature
```javascript
actor_think({
  text: "Planning user authentication system",
  tags: ["requirement", "design"],
  artifacts: [],
  projectContext: "/path/to/project",
  feedback: true  // Get comprehensive multi-critic analysis
})
```

### Implementing Code
```javascript
actor_think({
  text: "Implementing login endpoint with JWT",
  tags: ["task"],
  artifacts: [
    {name: "src/auth/login.ts", content: "...code..."}
  ],
  projectContext: "/path/to/project",
  parents: ["previous-node-id"],
  feedback: true  // Security-critical code
})
```

### Completing a Task
```javascript
actor_think({
  text: "Login functionality complete with tests",
  tags: ["task-complete"],
  artifacts: [
    {name: "src/auth/login.ts", content: "...final code..."},
    {name: "tests/auth/login.test.ts", content: "...tests..."}
  ],
  projectContext: "/path/to/project",
  parents: ["task-node-id"]
})
```