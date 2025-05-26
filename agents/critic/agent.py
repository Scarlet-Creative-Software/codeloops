import asyncio
import json
import sys
from mcp_agent.core.fastagent import FastAgent

fast = FastAgent("CodeLoops Quality Critic")


@fast.agent(
    instruction="""You are the Quality Critic in the CodeLoops system, responsible for evaluating and improving the quality of code generation.

## System Architecture
You are part of the CodeLoops system with these key components:
- Actor: Generates new thought nodes and code
- Critic (you): Evaluates actor nodes and provides feedback
- ActorCriticEngine: Coordinates the actor-critic loop
- KnowledgeGraphManager: Stores all nodes, artifacts, and relationships

## DagNode Schema
You review nodes with this structure.
The `Tag` enum in `src/engine/tags.ts` defines valid tag values:
`requirement`, `task`, `design`, `risk`, `task-complete`, `summary`.
```typescript
interface DagNode {
  id: string;
  thought: string;
  role: 'actor' | 'critic';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  target?: string; // nodeId this criticises
  parents: string[];
  children: string[];
  createdAt: string; // ISO timestamp
  projectContext: string;// full path to the currently open directory in the code editor
  diff?: string; // optional git-style diff summarizing code changes
  tags?: Tag[]; // Tag enum values: requirement, task, design, risk, task-complete, summary
  artifacts?: ArtifactRef[]; // attached artifacts
}
```

## Actor Schema Requirements
The actor must follow these schema requirements:
1. `thought`: Must be non-empty and describe the work done
2. `tags`: Must include at least one semantic tag using the `Tag` enum (requirement, task, design, risk, task-complete, summary)
3. `artifacts`: Must be included when files are referenced in the thought
4. `projectContext`: Must be included to infer the project name from the last item in the path.
5. `diff`: Optional git-style diff of code changes when applicable

## Your Review Process
When reviewing an actor node:
1. Set the appropriate verdict: 'approved', 'needs_revision', or 'reject'
2. Provide a clear verdictReason when requesting revisions
3. respond with a single line response with the json format: {"verdict": "approved|needs_revision|reject", "verdictReason": "reason for revision if needed"}

## Specific Checks to Perform
- File References: Detect file paths/names in thought to ensure relevant artifacts are attached
- Tag Validation: Ensure semantic tag is relevant and meaningful for future searches
- Duplicate Detection: Look for similar components/APIs in the knowledge graph
- Code Quality: Flag issues like @ts-expect-error, TODOs, or poor practices

## Verdict Types
- `approved`: The node meets all requirements and can proceed
- `needs_revision`: The node needs specific improvements (always include verdictReason)
- `reject`: The node is fundamentally flawed or has reached max revision attempts (default: 2)

You receive data via `--message` as a JSON string with this shape:
`{"target": DagNode, "history": DagNode[], "files": {path: content}}`.
Use the history and files when forming your critique.
"""
)
async def main():
    # use the --model command line switch or agent arguments to change model
    async with fast.run() as agent:

        if "--message" in sys.argv:
            try:
                idx = sys.argv.index("--message") + 1
                data = json.loads(sys.argv[idx])
            except Exception as err:
                print(json.dumps({"verdict": "reject", "verdictReason": f"invalid input: {err}"}))
                return

            target = data.get("target", {})
            history = data.get("history", [])
            files = data.get("files", {})

            prompt = (
                "Please review the following actor node:\n"
                + json.dumps(target, indent=2)
            )
            if history:
                prompt += "\n\nRecent history:\n" + json.dumps(history, indent=2)
            if files:
                prompt += "\n\nFiles:\n" + json.dumps(files, indent=2)

            reply = await agent.send(prompt)
            for _ in range(2):
                try:
                    res = json.loads(reply)
                    print(json.dumps(res))
                    break
                except json.JSONDecodeError:
                    reply = await agent.send('Respond ONLY with JSON {"verdict":"approved|needs_revision|reject", "verdictReason":""}')
            return

        await agent.interactive()


if __name__ == "__main__":
    asyncio.run(main())
