import { describe, it, expect, afterEach } from 'vitest';
import { ConfigurationExporter } from './ConfigurationExporter.js';
import { ConfigurationSchema, type Configuration, type DeepPartial } from './schema.js';
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

describe('ConfigurationExporter', () => {
  const tempFiles: string[] = [];
  
  afterEach(() => {
    // Clean up temp files
    for (const file of tempFiles) {
      if (existsSync(file)) {
        unlinkSync(file);
      }
    }
    tempFiles.length = 0;
  });

  it('should export configuration to YAML', () => {
    const config = ConfigurationSchema.parse({
      system: {
        dataDir: '/test/data',
        logLevel: 'debug'
      },
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    });
    
    const exportPath = join(tmpdir(), `export-test-${Date.now()}.yaml`);
    tempFiles.push(exportPath);
    
    ConfigurationExporter.export(config, exportPath);
    
    const content = readFileSync(exportPath, 'utf-8');
    const parsed = parseYaml(content);
    
    expect(parsed.system.dataDir).toBe('/test/data');
    expect(parsed.system.logLevel).toBe('debug');
  });

  it('should export configuration to JSON', () => {
    const config = ConfigurationSchema.parse({
      system: {
        logLevel: 'warn'
      },
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    });
    
    const exportPath = join(tmpdir(), `export-test-${Date.now()}.json`);
    tempFiles.push(exportPath);
    
    ConfigurationExporter.export(config, exportPath);
    
    const content = readFileSync(exportPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    expect(parsed.system.logLevel).toBe('warn');
  });

  it('should mask secrets when exporting', () => {
    const config = ConfigurationSchema.parse({
      system: {},
      model: {
        gemini: {
          apiKey: 'sk-1234567890abcdef'
        },
        ollama: {}
      },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    });
    
    const exportPath = join(tmpdir(), `export-test-${Date.now()}.yaml`);
    tempFiles.push(exportPath);
    
    ConfigurationExporter.export(config, exportPath, { maskSecrets: true });
    
    const content = readFileSync(exportPath, 'utf-8');
    const parsed = parseYaml(content);
    
    expect(parsed.model.gemini.apiKey).toBe('sk-1...cdef');
  });

  it('should not mask secrets when disabled', () => {
    const config = ConfigurationSchema.parse({
      system: {},
      model: {
        gemini: {
          apiKey: 'sk-1234567890abcdef'
        },
        ollama: {}
      },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    });
    
    const exportPath = join(tmpdir(), `export-test-${Date.now()}.yaml`);
    tempFiles.push(exportPath);
    
    ConfigurationExporter.export(config, exportPath, { maskSecrets: false });
    
    const content = readFileSync(exportPath, 'utf-8');
    const parsed = parseYaml(content);
    
    expect(parsed.model.gemini.apiKey).toBe('sk-1234567890abcdef');
  });

  it('should import configuration from YAML', () => {
    const testConfig = {
      system: {
        dataDir: '/imported/data',
        logLevel: 'error'
      },
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    };
    
    const importPath = join(tmpdir(), `import-test-${Date.now()}.yaml`);
    tempFiles.push(importPath);
    
    writeFileSync(importPath, stringifyYaml(testConfig));
    
    const imported = ConfigurationExporter.import(importPath);
    
    expect(imported.system.dataDir).toBe('/imported/data');
    expect(imported.system.logLevel).toBe('error');
  });

  it('should import configuration from JSON', () => {
    const testConfig = {
      system: {},
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: {
        actorCritic: {
          maxIterations: 20
        },
        knowledgeGraph: {},
        keyMemory: {}
      },
      performance: { cache: {}, connectionPool: {} }
    };
    
    const importPath = join(tmpdir(), `import-test-${Date.now()}.json`);
    tempFiles.push(importPath);
    
    writeFileSync(importPath, JSON.stringify(testConfig));
    
    const imported = ConfigurationExporter.import(importPath);
    
    expect(imported.engine.actorCritic.maxIterations).toBe(20);
  });

  it('should validate imported configuration', () => {
    const invalidConfig = {
      system: {
        logLevel: 'invalid-level'
      },
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    };
    
    const importPath = join(tmpdir(), `import-test-${Date.now()}.yaml`);
    tempFiles.push(importPath);
    
    writeFileSync(importPath, stringifyYaml(invalidConfig));
    
    expect(() => ConfigurationExporter.import(importPath)).toThrow();
  });

  it('should merge configurations', () => {
    const existing = ConfigurationSchema.parse({
      system: {
        dataDir: '/existing/data',
        logLevel: 'info'
      },
      model: {
        gemini: {
          temperature: 0.7
        },
        ollama: {}
      },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    });
    
    const imported: DeepPartial<Configuration> = {
      system: {
        logLevel: 'debug' as const
      },
      model: {
        gemini: {
          topP: 0.8
        }
      }
    };
    
    const merged = ConfigurationExporter.merge(existing, imported);
    
    expect(merged.system.dataDir).toBe('/existing/data'); // Preserved
    expect(merged.system.logLevel).toBe('debug'); // Updated
    expect(merged.model.gemini.temperature).toBe(0.7); // Preserved
    expect(merged.model.gemini.topP).toBe(0.8); // Added
  });

  it('should generate configuration template', () => {
    const yamlTemplate = ConfigurationExporter.generateTemplate('yaml');
    expect(yamlTemplate).toContain('_comment: Codeloops Configuration File');
    expect(yamlTemplate).toContain('system:');
    expect(yamlTemplate).toContain('model:');
    
    const jsonTemplate = ConfigurationExporter.generateTemplate('json');
    const parsed = JSON.parse(jsonTemplate);
    expect(parsed.system).toBeDefined();
    expect(parsed.model).toBeDefined();
  });

  it('should handle pretty printing options', () => {
    const config = ConfigurationSchema.parse({
      system: {},
      model: { gemini: {}, ollama: {} },
      agent: { critic: {}, summarize: {} },
      engine: { actorCritic: {}, knowledgeGraph: {}, keyMemory: {} },
      performance: { cache: {}, connectionPool: {} }
    });
    
    const prettyPath = join(tmpdir(), `pretty-test-${Date.now()}.json`);
    const compactPath = join(tmpdir(), `compact-test-${Date.now()}.json`);
    tempFiles.push(prettyPath, compactPath);
    
    ConfigurationExporter.export(config, prettyPath, { pretty: true });
    ConfigurationExporter.export(config, compactPath, { pretty: false });
    
    const prettyContent = readFileSync(prettyPath, 'utf-8');
    const compactContent = readFileSync(compactPath, 'utf-8');
    
    expect(prettyContent).toContain('\n');
    expect(prettyContent).toContain('  ');
    expect(compactContent).not.toContain('\n');
  });
});

// Helper functions already imported at the top