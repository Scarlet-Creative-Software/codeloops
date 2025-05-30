import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigurationManager } from './ConfigurationManager.js';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { stringify as stringifyYaml } from 'yaml';

describe('ConfigurationManager', () => {
  let tempConfigPath: string;
  let configManager: ConfigurationManager;
  
  beforeEach(() => {
    // Create a temporary config file path
    tempConfigPath = join(tmpdir(), `test-config-${Date.now()}.yaml`);
    
    // Clear environment variables
    delete process.env.CODELOOPS_DATA_DIR;
    delete process.env.LOG_LEVEL;
    delete process.env.GOOGLE_GENAI_API_KEY;
  });

  afterEach(() => {
    // Clean up temp files
    if (existsSync(tempConfigPath)) {
      unlinkSync(tempConfigPath);
    }
    
    // Disable hot reload if enabled
    configManager?.disableHotReload();
  });

  it('should load default configuration when no file exists', () => {
    configManager = new ConfigurationManager('/non-existent-path.yaml');
    const config = configManager.getAll();
    
    expect(config.system.dataDir).toBe('./data');
    expect(config.system.logLevel).toBe('info');
    expect(config.model.gemini.model).toBe('gemini-2.5-flash-preview-05-20');
  });

  it('should load configuration from YAML file', () => {
    const testConfig = {
      system: {
        dataDir: '/custom/data',
        logLevel: 'debug'
      },
      model: {
        gemini: {
          temperature: 0.8
        }
      }
    };
    
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    configManager = new ConfigurationManager(tempConfigPath);
    
    expect(configManager.get('system.dataDir')).toBe('/custom/data');
    expect(configManager.get('system.logLevel')).toBe('debug');
    expect(configManager.get('model.gemini.temperature')).toBe(0.8);
  });

  it('should load configuration from JSON file', () => {
    const jsonPath = tempConfigPath.replace('.yaml', '.json');
    const testConfig = {
      system: {
        logLevel: 'warn'
      }
    };
    
    writeFileSync(jsonPath, JSON.stringify(testConfig));
    configManager = new ConfigurationManager(jsonPath);
    
    expect(configManager.get('system.logLevel')).toBe('warn');
    
    // Cleanup
    unlinkSync(jsonPath);
  });

  it('should override file config with environment variables', () => {
    process.env.LOG_LEVEL = 'error';
    process.env.GOOGLE_GENAI_API_KEY = 'test-api-key';
    
    const testConfig = {
      system: {
        logLevel: 'debug'
      }
    };
    
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    configManager = new ConfigurationManager(tempConfigPath);
    
    expect(configManager.get('system.logLevel')).toBe('error');
    expect(configManager.get('model.gemini.apiKey')).toBe('test-api-key');
  });

  it('should handle nested path access', () => {
    configManager = new ConfigurationManager();
    
    expect(configManager.get('engine.actorCritic.maxIterations')).toBe(10);
    expect(configManager.get('performance.cache.strategy')).toBe('lru');
  });

  it('should throw error for non-existent configuration keys', () => {
    configManager = new ConfigurationManager();
    
    expect(() => configManager.get('non.existent.key')).toThrow(
      'Configuration key not found: non.existent.key'
    );
  });

  it('should validate configuration against schema', () => {
    const invalidConfig = {
      system: {
        logLevel: 'invalid-level' // Should be one of: debug, info, warn, error
      }
    };
    
    writeFileSync(tempConfigPath, stringifyYaml(invalidConfig));
    
    expect(() => new ConfigurationManager(tempConfigPath)).toThrow();
  });

  it('should handle environment variable parsing', () => {
    process.env.CODELOOPS_DATA_DIR = '/env/data';
    process.env.LOG_LEVEL = 'debug';
    
    configManager = new ConfigurationManager();
    
    expect(configManager.get('system.dataDir')).toBe('/env/data');
    expect(configManager.get('system.logLevel')).toBe('debug');
  });

  it('should enable hot reload and emit change events', { timeout: 10000 }, async () => {
    const testConfig = {
      system: {
        logLevel: 'info'
      },
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    };
    
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    configManager = new ConfigurationManager(tempConfigPath);
    
    const changePromise = new Promise((resolve) => {
      configManager.on('change', (changes) => {
        resolve(changes);
      });
    });
    
    configManager.enableHotReload();
    
    // Add small delay to ensure watcher is ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Update config file
    testConfig.system.logLevel = 'debug';
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    
    // Wait for change event
    const changes = await changePromise;
    
    expect(changes).toEqual([{
      path: 'system.logLevel',
      oldValue: 'info',
      newValue: 'debug'
    }]);
    
    expect(configManager.get('system.logLevel')).toBe('debug');
  });

  it('should only apply hot-reloadable settings', { timeout: 10000 }, async () => {
    const testConfig = {
      system: {
        dataDir: '/initial/data',
        logLevel: 'info'
      },
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    };
    
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    configManager = new ConfigurationManager(tempConfigPath);
    
    const changePromise = new Promise((resolve) => {
      configManager.on('change', (changes) => {
        resolve(changes);
      });
    });
    
    configManager.enableHotReload();
    
    // Add small delay to ensure watcher is ready
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Update both hot-reloadable and non-hot-reloadable settings
    testConfig.system.dataDir = '/updated/data'; // Not hot-reloadable
    testConfig.system.logLevel = 'debug'; // Hot-reloadable
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    
    // Wait for change event
    const changes = await changePromise;
    
    // Only hot-reloadable changes should be applied
    expect(changes).toEqual([{
      path: 'system.logLevel',
      oldValue: 'info',
      newValue: 'debug'
    }]);
    
    // dataDir should not change
    expect(configManager.get('system.dataDir')).toBe('/initial/data');
    expect(configManager.get('system.logLevel')).toBe('debug');
  });

  it('should handle manual reload', () => {
    const testConfig = {
      system: {
        logLevel: 'info'
      },
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    };
    
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    configManager = new ConfigurationManager(tempConfigPath);
    
    expect(configManager.get('system.logLevel')).toBe('info');
    
    // Update file
    testConfig.system.logLevel = 'debug';
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    
    // Manual reload
    configManager.reload();
    
    expect(configManager.get('system.logLevel')).toBe('debug');
  });

  it('should handle deep merge correctly', () => {
    const testConfig = {
      system: {},
      model: {
        gemini: {
          temperature: 0.9,
          topP: 0.8
        },
        ollama: {}
      },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    };
    
    writeFileSync(tempConfigPath, stringifyYaml(testConfig));
    configManager = new ConfigurationManager(tempConfigPath);
    
    // Should merge with defaults
    expect(configManager.get('model.gemini.temperature')).toBe(0.9);
    expect(configManager.get('model.gemini.topP')).toBe(0.8);
    expect(configManager.get('model.gemini.model')).toBe('gemini-2.5-flash-preview-05-20'); // Default
  });
});