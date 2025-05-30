/**
 * JSON Sanitizer for Multi-Critic System
 * Handles proper escaping of code examples and special characters
 */

/**
 * Sanitizes a string to ensure it can be safely included in JSON
 * without breaking parsing, especially for code examples.
 */
export function sanitizeForJson(text: string): string {
  if (!text) return '';
  
  // Replace problematic characters that can break JSON parsing
  return text
    // Escape backslashes first to avoid double-escaping
    .replace(/\\/g, '\\\\')
    // Escape double quotes
    .replace(/"/g, '\\"')
    // Escape newlines
    .replace(/\n/g, '\\n')
    // Escape carriage returns
    .replace(/\r/g, '\\r')
    // Escape tabs
    .replace(/\t/g, '\\t')
    // Remove or escape other control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F]/g, (char) => {
      const code = char.charCodeAt(0);
      return `\\u${code.toString(16).padStart(4, '0')}`;
    });
}

/**
 * Validates that a string can be safely parsed as JSON
 */
export function isJsonSafe(text: string): boolean {
  try {
    // Try to create a JSON string with the text
    JSON.parse(`"${sanitizeForJson(text)}"`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wraps code examples in a format that's safe for JSON
 * while preserving readability
 */
export function wrapCodeExample(code: string, language = 'typescript'): string {
  if (!code) return '';
  
  // Use base64 encoding for complex code that might break JSON
  if (!isJsonSafe(code)) {
    const encoded = Buffer.from(code).toString('base64');
    return `[BASE64_CODE:${language}]${encoded}[/BASE64_CODE]`;
  }
  
  // For simple code, just sanitize it
  return sanitizeForJson(code);
}

/**
 * Unwraps code examples that were wrapped for JSON safety
 */
export function unwrapCodeExample(wrapped: string): { code: string; language?: string } {
  if (!wrapped) return { code: '' };
  
  // Check for base64 encoded code
  const base64Match = wrapped.match(/\[BASE64_CODE:(\w+)\](.*?)\[\/BASE64_CODE\]/);
  if (base64Match) {
    const [, language, encoded] = base64Match;
    const code = Buffer.from(encoded, 'base64').toString('utf-8');
    return { code, language };
  }
  
  // Otherwise, it's just sanitized code
  return { code: wrapped };
}

/**
 * Preprocesses critic responses to ensure JSON safety
 */
export function preprocessCriticResponse(response: unknown): unknown {
  if (typeof response !== 'object' || response === null) {
    return response;
  }
  
  // Handle arrays
  if (Array.isArray(response)) {
    return response.map(item => {
      if (typeof item === 'string') {
        return sanitizeForJson(item);
      }
      return preprocessCriticResponse(item);
    });
  }
  
  // Handle objects
  const processed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(response)) {
    if (key === 'codeExample' && typeof value === 'string') {
      // Special handling for code examples
      processed[key] = wrapCodeExample(value);
    } else if (typeof value === 'string') {
      // Sanitize all string values
      processed[key] = sanitizeForJson(value);
    } else {
      // Recursively process nested objects
      processed[key] = preprocessCriticResponse(value);
    }
  }
  
  return processed;
}