import fs from 'node:fs/promises';
import { lock, unlock } from 'proper-lockfile';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import readline from 'node:readline';
import { dataDir } from '../config.ts';
import { CodeLoopsLogger } from '../logger.ts';
import { ActorThinkInput } from './ActorCriticEngine.ts';
import { TagEnum, Tag } from './tags.ts';

// -----------------------------------------------------------------------------
// Interfaces & Schemas --------------------------------------------------------
// -----------------------------------------------------------------------------

export interface WithProjectContext {
  project: string;
  projectContext: string;
}

export const FILE_REF = z.object({
  name: z.string(), // human label ("UML‑AuthSeq")
  uri: z.string().optional(), // optional external link or S3 key
  /** Absolute or repo‑relative path, e.g. "QuickRecorder/CameraOverlay.swift" */
  path: z.string(),
  /** Optional hash to lock content for provenance */
  hash: z.string().optional(),
  /** Optional MIME, e.g. "text/x-swift" */
  contentType: z.string().optional(),
});
export type ArtifactRef = z.infer<typeof FILE_REF>;

export interface DagNode extends ActorThinkInput, WithProjectContext {
  id: string;
  thought: string;
  role: 'actor' | 'critic' | 'summary';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string; // nodeId this criticises
  /** Optional git-style diff summarizing code changes. */
  diff?: string;
  parents: string[];
  children: string[];
  createdAt: string; // ISO timestamp
  summarizedSegment?: string[]; // IDs of nodes summarized (for summary nodes)
}

export interface SummaryNode extends DagNode {
  role: 'summary';
  summarizedSegment: string[]; // IDs of nodes summarized
}

// -----------------------------------------------------------------------------
// KnowledgeGraphManager -------------------------------------------------------
// -----------------------------------------------------------------------------

export class KnowledgeGraphManager {
  private logFilePath: string = path.resolve(dataDir, 'knowledge_graph.ndjson');
  private logger: CodeLoopsLogger;
  private hasLoggedParseError = false;
  private nodeCache = new Map<string, DagNode | null>();

  private static CACHE_TTL = (() => {
    const env = process.env.KG_NODE_CACHE_TTL;
    const parsed = env ? parseInt(env, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  })();

  private cacheNode(id: string, node: DagNode) {
    const cloned = JSON.parse(JSON.stringify(node)) as DagNode;
    this.nodeCache.set(id, cloned);
    setTimeout(() => this.nodeCache.delete(id), KnowledgeGraphManager.CACHE_TTL * 1000);
  }

  // Schema for validating DagNode entries
  private static DagNodeSchema = z.object({
    id: z.string(),
    project: z.string(),
    projectContext: z.string(),
    thought: z.string(),
    role: z.enum(['actor', 'critic', 'summary']),
    createdAt: z.string().datetime(),
    parents: z.array(z.string()),
    children: z.array(z.string()),
    verdict: z.enum(['approved', 'needs_revision', 'reject']).optional(),
    verdictReason: z.string().optional(),
    verdictReferences: z.array(z.string()).optional(),
    target: z.string().optional(),
    summarizedSegment: z.array(z.string()).optional(),
    diff: z.string().optional(),
    tags: z.array(TagEnum).optional(),
    artifacts: z.array(FILE_REF).optional(),
  });

  constructor(logger: CodeLoopsLogger) {
    this.logger = logger;
  }

  async init() {
    this.logger.info(`[KnowledgeGraphManager] Initializing from ${this.logFilePath}`);
    await this.loadLog();
  }

  private async loadLog() {
    if (!(await fs.stat(this.logFilePath).catch(() => null))) {
      this.logger.info(`[KnowledgeGraphManager] Creating new log file at ${this.logFilePath}`);
      await fs.mkdir(path.dirname(this.logFilePath), { recursive: true });
      await fs.writeFile(this.logFilePath, '');
      return;
    }
  }

  private parseDagNode(line: string): DagNode | null {
    try {
      const parsed = JSON.parse(line);

      // Handle legacy nodes with invalid tag enums gracefully
      if (parsed.tags && Array.isArray(parsed.tags)) {
        const validTags = ['requirement', 'task', 'design', 'risk', 'task-complete', 'summary'];
        parsed.tags = parsed.tags.filter((tag: string) => validTags.includes(tag));

        // If no valid tags remain, assign a default tag
        if (parsed.tags.length === 0) {
          parsed.tags = ['task']; // Default fallback
        }
      }

      const validated = KnowledgeGraphManager.DagNodeSchema.parse(parsed);
      return validated as DagNode;
    } catch (err) {
      // Only log parsing errors once per session to prevent log spam
      if (!this.hasLoggedParseError) {
        this.logger.error(
          { err, line: line.slice(0, 200) + '...' },
          'Invalid DagNode entry (subsequent errors suppressed)',
        );
        this.hasLoggedParseError = true;
      }
      return null;
    }
  }

  async appendEntity(entity: DagNode, retries = 3) {
    if (await this.wouldCreateCycle(entity)) {
      throw new Error(`Appending node ${entity.id} would create a cycle`);
    }

    entity.createdAt = new Date().toISOString();
    const line = JSON.stringify(entity) + '\n';
    let err: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await lock(this.logFilePath, { retries: 0 });
        await fs.appendFile(this.logFilePath, line, 'utf8');
        this.cacheNode(entity.id, entity);
        return;
      } catch (e: unknown) {
        err = e as Error;
        this.logger.warn({ err, attempt }, `Retry ${attempt} failed appending entity`);
        if (attempt === retries) break;
        await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
      } finally {
        try {
          await unlock(this.logFilePath);
        } catch (unlockErr) {
          this.logger.error({ err: unlockErr }, 'Failed to unlock file');
        }
      }
    }

    this.logger.error({ err }, 'Error appending entity after retries');
    throw err;
  }

  private async wouldCreateCycle(entity: DagNode): Promise<boolean> {
    const existing = await this.getNode(entity.id);
    const newParents = existing
      ? entity.parents.filter((p) => !existing.parents.includes(p))
      : entity.parents;

    if (newParents.length === 0) return false;

    const targets = new Set(newParents);
    const visited = new Set<string>();
    const stack = [entity.id];

    while (stack.length > 0) {
      const currentId = stack.pop() as string;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      if (currentId !== entity.id && targets.has(currentId)) {
        return true;
      }

      const children =
        currentId === entity.id
          ? entity.children
          : ((await this.getNode(currentId))?.children ?? []);

      for (const childId of children) {
        if (!visited.has(childId)) stack.push(childId);
      }
    }

    return false;
  }

  private async readNodeFromFile(id: string): Promise<DagNode | undefined> {
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let found: DagNode | undefined;
    try {
      for await (const line of rl) {
        const entry = this.parseDagNode(line);
        if (entry?.id === id) {
          found = entry; // keep scanning for the latest entry
        }
      }
      return found;
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  async getCachedNode(id: string): Promise<DagNode | undefined> {
    if (this.nodeCache.has(id)) {
      return this.nodeCache.get(id) ?? undefined;
    }
    const node = await this.readNodeFromFile(id);
    if (node) {
      this.cacheNode(id, node);
    }
    return node;
  }

  async getNode(id: string): Promise<DagNode | undefined> {
    return this.getCachedNode(id);
  }

  async getNeighbors(id: string, depth = 1): Promise<DagNode[]> {
    if (depth < 0) depth = 0;
    const start = await this.getNode(id);
    if (!start) return [];
    const result = new Map<string, DagNode>();
    result.set(start.id, start);

    const traverse = async (node: DagNode, currentDepth: number) => {
      if (currentDepth >= depth) return;
      const neighborIds = [...node.parents, ...node.children];
      for (const nid of neighborIds) {
        if (result.has(nid)) continue;
        const neighbor = await this.getNode(nid);
        if (neighbor) {
          result.set(nid, neighbor);
          await traverse(neighbor, currentDepth + 1);
        }
      }
    };

    await traverse(start, 0);
    return Array.from(result.values());
  }

  async *streamDagNodes(project: string): AsyncGenerator<DagNode, void, unknown> {
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const node = this.parseDagNode(line);
        if (node?.project === project) {
          yield node;
        }
      }
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  async allDagNodes(project: string): Promise<DagNode[]> {
    const nodes: DagNode[] = [];
    for await (const node of this.streamDagNodes(project)) {
      nodes.push(node);
    }
    return nodes;
  }

  async resume({ project, limit = 5 }: { project: string; limit?: number }): Promise<DagNode[]> {
    if (limit) {
      return this.getRecentNodes(project, limit);
    }
    return this.export({ project });
  }

  async export({
    project,
    filterFn,
    limit,
  }: {
    project: string;
    filterFn?: (node: DagNode) => boolean;
    limit?: number;
  }): Promise<DagNode[]> {
    const nodes: DagNode[] = [];
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const node = this.parseDagNode(line);
        if (!node || node.project !== project) continue;
        if (filterFn && !filterFn(node)) continue;
        nodes.push(node);
        if (limit && nodes.length > limit) nodes.shift();
      }
      return nodes;
    } finally {
      rl.close();
      fileStream.close();
    }
  }

  private async getRecentNodes(project: string, limit: number): Promise<DagNode[]> {
    const nodes: DagNode[] = [];
    const fileSize = (await fs.stat(this.logFilePath)).size;

    if (fileSize === 0) return nodes;

    const chunkSize = Math.min(8192, fileSize);
    let position = fileSize;
    let buffer = '';
    let foundNodes = 0;
    let fileHandle: fs.FileHandle | undefined;

    try {
      fileHandle = await fs.open(this.logFilePath, 'r');

      while (position > 0 && foundNodes < limit) {
        const readSize = Math.min(chunkSize, position);
        position -= readSize;

        const { buffer: chunk } = await fileHandle.read({
          buffer: Buffer.alloc(readSize),
          offset: 0,
          length: readSize,
          position,
        });

        buffer = chunk.toString('utf8') + buffer;

        const lines = buffer.split('\n');
        buffer = lines.shift() || '';

        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim();
          if (!line) continue;

          const node = this.parseDagNode(line);
          if (node && node.project === project) {
            nodes.unshift(node);
            foundNodes++;
            if (foundNodes >= limit) break;
          }
        }
      }

      if (nodes.length < limit && buffer.trim()) {
        const node = this.parseDagNode(buffer.trim());
        if (node && node.project === project) {
          nodes.unshift(node);
        }
      }
    } finally {
      await fileHandle?.close();
    }

    return nodes;
  }

  async search({
    project,
    tags,
    query,
    limit,
  }: {
    project: string;
    tags?: Tag[];
    query?: string;
    limit?: number;
  }): Promise<DagNode[]> {
    const q = query?.toLowerCase();
    return this.export({
      project,
      limit,
      filterFn: (node) => {
        if (tags && (!node.tags || !tags.every((t) => node.tags!.includes(t)))) {
          return false;
        }
        if (q && !node.thought.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      },
    });
  }

  async getArtifactHistory(project: string, path: string, limit?: number): Promise<DagNode[]> {
    return this.export({
      project,
      limit,
      filterFn: (node) => !!node.artifacts?.some((a) => a.path === path),
    });
  }

  async listOpenTasks(project: string, limit?: number): Promise<DagNode[]> {
    const filterFn = (node: DagNode) =>
      node.role === 'actor' &&
      node.tags?.includes(Tag.Task) &&
      !node.tags?.includes(Tag.TaskComplete);

    if (limit) {
      const recent = await this.getRecentNodes(project, limit);
      return recent.filter(filterFn);
    }

    return this.export({
      project,
      filterFn,
    });
  }

  async getHeads(project: string, limit?: number): Promise<DagNode[]> {
    const filterFn = (node: DagNode) => node.children.length === 0;

    if (limit) {
      const recent = await this.getRecentNodes(project, limit);
      return recent.filter(filterFn);
    }

    return this.export({
      project,
      filterFn,
    });
  }

  async listProjects(): Promise<string[]> {
    const projects = new Set<string>();
    const fileStream = fsSync.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        const entry = this.parseDagNode(line);
        if (entry?.project && !projects.has(entry.project)) {
          projects.add(entry.project);
        }
      }
      return Array.from(projects);
    } finally {
      rl.close();
      fileStream.close();
    }
  }
}
