import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { ConfigurationSchema, Configuration, HotReloadableSettings, type DeepPartial } from './schema.js';
import { ConfigurationWatcher } from './ConfigurationWatcher.js';
import { EventEmitter } from 'events';
import type { Logger } from '../logger.js';

interface ConfigChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error' | 'log';

export class ConfigurationManager extends EventEmitter {
  private configuration: Configuration;
  private configPath: string;
  private watcher?: ConfigurationWatcher;
  private envPrefix = 'CODELOOPS_';
  private logger: Logger | null = null;

  constructor(configPath?: string) {
    super();
    this.configPath = configPath || this.findConfigFile();
    this.configuration = this.loadConfiguration();
  }

  /**
   * Lazy logger initialization to avoid circular dependency
   */
  private log(level: string, message: string, ...args: unknown[]): void {
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

  private async ensureLogger(): Promise<void> {
    if (!this.logger) {
      const loggerModule = await import('../logger.js');
      this.logger = loggerModule.getInstance();
    }
  }

  /**
   * Find configuration file in standard locations
   */
  private findConfigFile(): string {
    const locations = [
      './codeloops.config.yaml',
      './codeloops.config.json',
      './.codeloops/config.yaml',
      './.codeloops/config.json',
      join(process.env.HOME || '', '.codeloops/config.yaml'),
      join(process.env.HOME || '', '.codeloops/config.json'),
    ];

    for (const location of locations) {
      if (existsSync(location)) {
        this.log('info', `Found configuration file at: ${location}`);
        return location;
      }
    }

    this.log('debug', 'No configuration file found, using defaults');
    return '';
  }

  /**
   * Load configuration from all sources with cascading
   */
  private loadConfiguration(): Configuration {
    // Start with empty config objects
    let config: DeepPartial<Configuration> = {
      system: {},
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    };

    // Load from file if exists
    if (this.configPath && existsSync(this.configPath)) {
      const fileConfig = this.loadFromFile(this.configPath);
      config = this.deepMerge(config, fileConfig);
    }

    // Override with environment variables
    const envConfig = this.loadFromEnvironment();
    config = this.deepMerge(config as Record<string, unknown>, envConfig as Record<string, unknown>) as DeepPartial<Configuration>;

    // Validate and apply defaults from schema
    try {
      return ConfigurationSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.log('error', 'Configuration validation failed:', error.errors);
        throw new Error(`Invalid configuration: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Load configuration from file
   */
  private loadFromFile(path: string): Partial<Configuration> {
    try {
      const content = readFileSync(path, 'utf-8');
      
      if (path.endsWith('.yaml') || path.endsWith('.yml')) {
        return parseYaml(content) || {};
      } else if (path.endsWith('.json')) {
        return JSON.parse(content);
      } else {
        throw new Error('Unsupported configuration file format');
      }
    } catch (error) {
      this.log('error', `Failed to load configuration from ${path}:`, error);
      return {};
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): DeepPartial<Configuration> {
    const config: DeepPartial<Configuration> = {};

    // Map specific environment variables to configuration paths
    const envMappings = [
      { env: 'CODELOOPS_DATA_DIR', path: 'system.dataDir' },
      { env: 'LOG_LEVEL', path: 'system.logLevel' },
      { env: 'GOOGLE_GENAI_API_KEY', path: 'model.gemini.apiKey' },
      { env: 'OLLAMA_BASE_URL', path: 'model.ollama.baseUrl' },
      { env: 'FASTAGENT_BASE_URL', path: 'agent.critic.baseUrl' },
      { env: 'CODELOOPS_MULTI_CRITIC_DEFAULT', path: 'engine.actorCritic.multiCriticDefault' },
      // Add more mappings as needed
    ];

    for (const { env, path } of envMappings) {
      const value = process.env[env];
      if (value !== undefined) {
        this.setNestedValue(config, path, this.parseEnvValue(value));
      }
    }

    return config as DeepPartial<Configuration>;
  }

  /**
   * Parse environment variable value
   */
  private parseEnvValue(value: string): unknown {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, return as string
      return value;
    }
  }

  /**
   * Deep merge configurations
   */
  private deepMerge<T extends Record<string, unknown>>(target: T, source: T): T {
    const result = { ...target };

    for (const key in source) {
      if (source[key] !== undefined) {
        if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
          result[key] = this.deepMerge(
            (result[key] || {}) as Record<string, unknown>,
            source[key] as Record<string, unknown>
          ) as T[Extract<keyof T, string>];
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Set nested value in object
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Get configuration value by path
   */
  get<T = unknown>(path: string): T {
    const parts = path.split('.');
    let value: unknown = this.configuration;

    for (const part of parts) {
      if (typeof value === 'object' && value !== null && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        throw new Error(`Configuration key not found: ${path}`);
      }
    }

    return value as T;
  }

  /**
   * Get entire configuration
   */
  getAll(): Configuration {
    return { ...this.configuration };
  }

  /**
   * Enable hot reload for configuration file
   */
  enableHotReload(): void {
    if (!this.configPath || !existsSync(this.configPath)) {
      this.log('warn', 'Cannot enable hot reload: no configuration file found');
      return;
    }

    this.watcher = new ConfigurationWatcher(this.configPath);
    this.watcher.on('change', () => {
      this.log('info', 'Configuration file changed, reloading...');
      
      try {
        const newConfig = this.loadConfiguration();
        
        this.log('debug', 'Old config logLevel:', this.configuration.system.logLevel);
        this.log('debug', 'New config logLevel:', newConfig.system.logLevel);
        
        const changes = this.detectChanges(this.configuration, newConfig);
        
        this.log('debug', 'All detected changes:', changes);
        this.log('debug', 'Hot-reloadable settings:', HotReloadableSettings);
        
        // Only apply hot-reloadable changes
        const safeChanges = changes.filter(change => 
          HotReloadableSettings.includes(change.path)
        );

        if (safeChanges.length > 0) {
          // Only apply the safe changes to the current configuration
          for (const change of safeChanges) {
            this.setNestedValue(this.configuration, change.path, change.newValue);
          }
          this.emit('change', safeChanges);
          this.log('info', `Applied ${safeChanges.length} configuration changes`);
        } else {
          this.log('info', 'No hot-reloadable settings changed');
        }
      } catch (error) {
        this.log('error', 'Failed to reload configuration:', error);
      }
    });
  }

  /**
   * Detect changes between configurations
   */
  private detectChanges(oldConfig: DeepPartial<Configuration>, newConfig: DeepPartial<Configuration>, path = ''): ConfigChange[] {
    const changes: ConfigChange[] = [];

    for (const key in newConfig) {
      const currentPath = path ? `${path}.${key}` : key;
      const oldValue = oldConfig?.[key as keyof Configuration];
      const newValue = newConfig[key as keyof Configuration];
      
      if (typeof newValue === 'object' && !Array.isArray(newValue) && newValue !== null) {
        changes.push(...this.detectChanges(
          (oldValue || {}) as DeepPartial<Configuration>,
          newValue as DeepPartial<Configuration>,
          currentPath
        ));
      } else if (oldValue !== newValue) {
        changes.push({
          path: currentPath,
          oldValue,
          newValue
        });
      }
    }

    return changes;
  }

  /**
   * Disable hot reload
   */
  disableHotReload(): void {
    this.watcher?.stop();
    this.watcher = undefined;
  }

  /**
   * Reload configuration manually
   */
  reload(): void {
    this.configuration = this.loadConfiguration();
    this.emit('reload', this.configuration);
  }
}