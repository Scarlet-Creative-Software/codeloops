import { writeFileSync, readFileSync } from 'fs';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { Configuration, ConfigurationSchema, type DeepPartial } from './schema.js';
import type { Logger } from '../logger.js';

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error' | 'log';

export class ConfigurationExporter {
  private static logger: Logger | null = null;

  /**
   * Lazy logger initialization to avoid circular dependency
   */
  private static log(level: string, message: string, ...args: unknown[]): void {
    // Use void operator to handle async logger loading without blocking
    void this.ensureLogger().then(() => {
      if (this.logger && level in this.logger && typeof this.logger[level as keyof Logger] === 'function') {
        (this.logger[level as keyof Logger] as (...args: unknown[]) => void)(message, ...args);
      }
    }).catch(() => {
      // Fallback to console if logger loading fails
      const consoleMethods: Record<string, ConsoleMethod> = {
        debug: 'debug',
        info: 'info',
        warn: 'warn',
        error: 'error'
      };
      const method = consoleMethods[level] || 'log';
      console[method](message, ...args);
    });
  }

  private static async ensureLogger(): Promise<void> {
    if (!this.logger) {
      const loggerModule = await import('../logger.js');
      this.logger = loggerModule.getInstance();
    }
  }
  /**
   * Export configuration to file
   */
  static export(config: Configuration, filePath: string, options?: {
    format?: 'json' | 'yaml';
    maskSecrets?: boolean;
    pretty?: boolean;
  }): void {
    const { 
      format = filePath.endsWith('.yaml') || filePath.endsWith('.yml') ? 'yaml' : 'json',
      maskSecrets = true,
      pretty = true
    } = options || {};

    try {
      // Clone configuration to avoid modifying original
      const exportConfig = this.prepareForExport(config, maskSecrets);

      // Serialize based on format
      let content: string;
      if (format === 'yaml') {
        content = stringifyYaml(exportConfig, {
          indent: pretty ? 2 : 0,
          lineWidth: 120,
        });
      } else {
        content = JSON.stringify(exportConfig, null, pretty ? 2 : 0);
      }

      // Write to file
      writeFileSync(filePath, content, 'utf-8');
      this.log('info', `Configuration exported to: ${filePath}`);
    } catch (error) {
      this.log('error', `Failed to export configuration:`, error);
      throw error;
    }
  }

  /**
   * Import configuration from file
   */
  static import(filePath: string): Configuration {
    try {
      const content = readFileSync(filePath, 'utf-8');
      let rawConfig: unknown;

      // Parse based on file extension
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        rawConfig = parseYaml(content);
      } else if (filePath.endsWith('.json')) {
        rawConfig = JSON.parse(content);
      } else {
        throw new Error('Unsupported file format. Use .json or .yaml');
      }

      // Validate imported configuration
      const config = ConfigurationSchema.parse(rawConfig);
      this.log('info', `Configuration imported from: ${filePath}`);
      return config;
    } catch (error) {
      this.log('error', `Failed to import configuration:`, error);
      throw error;
    }
  }

  /**
   * Merge imported configuration with existing
   */
  static merge(existing: Configuration, imported: DeepPartial<Configuration>): Configuration {
    const merged = this.deepMerge(existing, imported);
    
    // Validate merged configuration
    return ConfigurationSchema.parse(merged);
  }

  /**
   * Prepare configuration for export
   */
  private static prepareForExport(config: Configuration, maskSecrets: boolean): DeepPartial<Configuration> {
    const exported = JSON.parse(JSON.stringify(config)) as Configuration; // Deep clone

    if (maskSecrets) {
      // Mask sensitive values
      if (exported.model?.gemini?.apiKey) {
        exported.model.gemini.apiKey = this.maskValue(exported.model.gemini.apiKey);
      }
      
      // Add more secret masking as needed
    }

    return exported;
  }

  /**
   * Mask sensitive value
   */
  private static maskValue(value: string): string {
    if (!value || value.length < 8) {
      return '***';
    }
    
    const visibleChars = 4;
    const prefix = value.substring(0, visibleChars);
    const suffix = value.substring(value.length - visibleChars);
    return `${prefix}...${suffix}`;
  }

  /**
   * Deep merge objects
   */
  private static deepMerge<T extends Record<string, unknown>>(target: T, source: DeepPartial<T>): T {
    const result = { ...target } as T;

    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
          (result as Record<string, unknown>)[key] = this.deepMerge(
            (result[key] || {}) as Record<string, unknown>,
            source[key] as DeepPartial<Record<string, unknown>>
          );
        } else {
          (result as Record<string, unknown>)[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Generate configuration template
   */
  static generateTemplate(format: 'json' | 'yaml' = 'yaml'): string {
    // Create a configuration with all defaults
    const template = ConfigurationSchema.parse({
      system: {},
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    });
    
    // Add helpful comments (for YAML)
    const templateWithComments = {
      _comment: 'Codeloops Configuration File',
      _version: '1.0',
      ...template,
    };

    if (format === 'yaml') {
      return stringifyYaml(templateWithComments, {
        indent: 2,
        lineWidth: 120,
        commentString: (str: string) => `# ${str}`,
      });
    } else {
      return JSON.stringify(template, null, 2);
    }
  }
}