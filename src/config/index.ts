export * from './schema.js';
export * from './ConfigurationManager.js';
export * from './ConfigurationWatcher.js';
export * from './ConfigurationExporter.js';

import { ConfigurationManager } from './ConfigurationManager.js';

// Global configuration instance
let globalConfigManager: ConfigurationManager | null = null;

/**
 * Get the global configuration manager instance
 */
export function getConfigurationManager(): ConfigurationManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigurationManager();
  }
  return globalConfigManager;
}

/**
 * Initialize configuration manager with optional config path
 */
export function initializeConfiguration(configPath?: string): ConfigurationManager {
  globalConfigManager = new ConfigurationManager(configPath);
  return globalConfigManager;
}

/**
 * Get configuration value by path
 */
export function getConfig<T = unknown>(path: string): T {
  return getConfigurationManager().get<T>(path);
}

/**
 * Get all configuration
 */
export function getAllConfig() {
  return getConfigurationManager().getAll();
}