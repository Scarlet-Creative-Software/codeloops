import { Logger } from 'pino';
import { getInstance as getLogger } from '../logger.ts';

const PROJECT_CONTEXT_CACHE = new Map<string, string>();

/**
 * Extracts a valid project name from a project context (typically a file path).
 *
 * @param projectContext The project context, typically a file path
 * @returns A valid project name or null if the context is invalid
 */
export function extractProjectName(
  projectContext: string,
  { logger }: { logger: Logger } = { logger: getLogger() },
): string | null {
  if (!projectContext || typeof projectContext !== 'string' || projectContext.trim() === '') {
    logger.info(`Invalid projectContext: ${projectContext}`);
    return null;
  }

  if (PROJECT_CONTEXT_CACHE.has(projectContext)) {
    return PROJECT_CONTEXT_CACHE.get(projectContext) ?? null;
  }

  // For Windows-style paths, we need to handle backslashes
  // Convert all backslashes to forward slashes for consistent handling
  const normalizedInput = projectContext.replace(/\\/g, '/');

  // For paths with mixed separators, split by both types and get the last non-empty segment
  const segments = normalizedInput.split('/').filter(Boolean);
  const lastSegment = segments.length > 0 ? segments[segments.length - 1] : '';

  if (!lastSegment) {
    logger.info(`Invalid projectContext (no valid segments): ${projectContext}`);
    return null;
  }

  // Check if the segment contains any valid characters (letters, numbers, hyphen, underscore)
  const hasValidChars = /[a-zA-Z0-9_-]/.test(lastSegment);
  if (!hasValidChars) {
    logger.info(`Invalid project name (no valid characters): ${lastSegment}`);
    return null;
  }

  // Replace special characters with underscores
  let cleanedProjectName = lastSegment.replace(/[^a-zA-Z0-9_-]/g, '_');

  // Clean up multiple consecutive underscores but preserve trailing underscore
  const hasTrailingUnderscore = cleanedProjectName.endsWith('_');
  cleanedProjectName = cleanedProjectName.replace(/_+/g, '_');

  // Remove leading underscores but keep trailing if it was there
  cleanedProjectName = cleanedProjectName.replace(/^_+/, '');
  if (hasTrailingUnderscore && !cleanedProjectName.endsWith('_')) {
    cleanedProjectName += '_';
  }

  // Truncate to maximum length
  cleanedProjectName = cleanedProjectName.substring(0, 50);

  // Check if the name is empty or contains only invalid characters
  if (!cleanedProjectName) {
    logger.info(`Invalid project name (empty after cleaning): ${lastSegment}`);
    return null;
  }

  const validNameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!validNameRegex.test(cleanedProjectName)) {
    logger.info(`Invalid project name: ${cleanedProjectName}`);
    return null;
  }

  PROJECT_CONTEXT_CACHE.set(projectContext, cleanedProjectName);
  return cleanedProjectName;
}
