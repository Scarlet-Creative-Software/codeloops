import { execa } from 'execa';
import { to } from 'await-to-js';
import { v4 as uuid } from 'uuid';
import { KnowledgeGraphManager, DagNode } from '../engine/KnowledgeGraph.ts';
import { getInstance as getLogger } from '../logger.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const CriticSchema = {
  actorNodeId: z.string().describe('ID of the actor node to critique.'),
};

/**
 * FILE_RX — detects a file path or filename with a wide range of extensions.
 *
 * • Accepts relative or nested paths: `src/utils/index.ts`, `./foo/bar.py`
 * • Case‑insensitive
 * • Captures extension families:
 *   - Code:  ts, tsx, js, jsx, mjs, cjs, py, go, java, kt, swift, rb, c, cpp, h, hpp,
 *            cs, rs, php, scala, sh, bat, ps1
 *   - Markup / styles: html, htm, css, scss, sass, less, xml, svg
 *   - Config / data: json, yaml, yml, toml, sql, csv, lock
 *   - Docs: md, markdown, txt, rst
 *   - Assets: png, jpg, jpeg, gif, pdf
 */
const FILE_RX =
  /(?:^|\\s)([\\w./-]+\\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|swift|rb|c|cpp|h|hpp|cs|rs|php|scala|sh|bat|ps1|html?|css|scss|sass|less|xml|svg|json|ya?ml|toml|sql|csv|lock|md|markdown|rst|txt|png|jpe?g|gif|pdf))(?:\\s|$)/i;

function missingArtifactGuard(actorNode: DagNode): { needsFix: boolean; reason?: string } {
  const mentionsFile = FILE_RX.test(actorNode.thought);
  const hasArtifacts = !!actorNode.artifacts?.length;
  if (mentionsFile && !hasArtifacts) {
    return {
      needsFix: true,
      reason:
        'Thought references a file but provided no artifacts array.  Add an artifacts array with a durable link.',
    };
  }
  return { needsFix: false };
}

export class Critic {
  constructor(private readonly kg: KnowledgeGraphManager) {}

  async review({
    actorNodeId,
    project,
    projectContext,
  }: {
    actorNodeId: string;
    project: string;
    projectContext: string;
  }): Promise<DagNode> {
    const target = await this.kg.getNode(actorNodeId);
    if (!target || (target as DagNode).role !== 'actor')
      throw new Error('invalid target for critic');

    let verdict: DagNode['verdict'] = 'approved';
    let reason: DagNode['verdictReason'] | undefined;

    if ((target as DagNode).thought.trim() === '') verdict = 'needs_revision';
    const artifactGuard = missingArtifactGuard(target as DagNode);
    if (artifactGuard.needsFix) verdict = 'needs_revision';
    if (artifactGuard.reason) reason = artifactGuard.reason;

    if (verdict === 'approved') {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const criticDir = path.resolve(__dirname, '..', '..', 'agents', 'critic');
      const targetJson = JSON.stringify(target);
      const [criticError, output] = await to(
        execa('uv', ['run', 'agent.py', '--quiet', '--agent', 'default', '--message', targetJson], {
          cwd: criticDir,
        }),
      );

      if (criticError) {
        throw criticError;
      }
      try {
        const json = JSON.parse(output.stdout) as {
          verdict: DagNode['verdict'];
          verdictReason?: string;
        };
        verdict = json.verdict;
        reason = json.verdictReason;
      } catch (err) {
        getLogger().error({ err }, 'Failed to parse JSON from uv mcp-server-fetch');
      }
    }

    // Generate more detailed feedback for single critic mode
    const generateDetailedFeedback = (verdict: DagNode['verdict'], reason?: string, target?: DagNode) => {
      const timestamp = new Date().toISOString();
      const artifactCount = target?.artifacts?.length || 0;
      const thoughtLength = target?.thought?.length || 0;
      
      let feedback = `## Single Critic Review\n\n`;
      
      if (verdict === 'approved') {
        feedback += `### ✅ **APPROVED**\n\n`;
        feedback += `**Assessment**: This thought meets the basic requirements and can proceed.\n\n`;
        feedback += `**Details**:\n`;
        feedback += `- Thought length: ${thoughtLength} characters\n`;
        feedback += `- Artifacts provided: ${artifactCount}\n`;
        feedback += `- Review timestamp: ${timestamp}\n`;
        if (reason) {
          feedback += `- Additional notes: ${reason}\n`;
        }
        feedback += `\n**Note**: This was a single-critic review. For more detailed consensus analysis, use \`feedback: true\`.\n`;
      } else if (verdict === 'needs_revision') {
        feedback += `### ⚠️ **NEEDS REVISION**\n\n`;
        feedback += `**Issues identified**:\n`;
        if (reason) {
          feedback += `- ${reason}\n`;
        }
        feedback += `\n**Next steps**: Please address the issues above and resubmit.\n`;
        feedback += `\n**Note**: This was a single-critic review. For more detailed analysis, use \`feedback: true\`.\n`;
      } else {
        feedback += `### ❌ **REJECTED**\n\n`;
        feedback += `**Critical issues**:\n`;
        if (reason) {
          feedback += `- ${reason}\n`;
        }
        feedback += `\n**Action required**: Significant changes needed before this can be approved.\n`;
        feedback += `\n**Note**: This was a single-critic review. For more detailed analysis, use \`feedback: true\`.\n`;
      }
      
      return feedback;
    };

    const detailedThought = generateDetailedFeedback(verdict, reason, target as DagNode);

    const criticNode: DagNode = {
      id: uuid(),
      project,
      thought: detailedThought,
      role: 'critic',
      verdict,
      ...(reason && { verdictReason: reason }),
      target: actorNodeId,
      parents: [actorNodeId],
      children: [],
      tags: [],
      artifacts: [],
      createdAt: '', // Will be set by appendEntity
      projectContext,
      metadata: {
        singleCritic: true,
        reviewType: 'basic',
        artifactCount: (target as DagNode)?.artifacts?.length || 0,
        reviewTimestamp: new Date().toISOString(),
      },
    };

    // Update the target node's children to include this critic node
    if (target && !target.children.includes(criticNode.id)) {
      target.children.push(criticNode.id);
      // Update the target node in the knowledge graph
      await this.kg.appendEntity(target);
    }

    // Persist the critic node
    await this.kg.appendEntity(criticNode);

    return criticNode;
  }
}
