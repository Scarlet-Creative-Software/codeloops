#!/usr/bin/env tsx

/**
 * Test script for the new configuration management system
 */

import { ConfigurationManager } from '../../src/config/ConfigurationManager.js';
import { ConfigurationExporter } from '../../src/config/ConfigurationExporter.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import chalk from 'chalk';

console.log(chalk.blue('🧪 Testing Codeloops Configuration System\n'));

// Test 1: Default configuration
console.log(chalk.yellow('Test 1: Loading default configuration'));
try {
  const manager = new ConfigurationManager();
  const config = manager.getAll();
  
  console.log('✅ Default config loaded successfully');
  console.log(`  Data dir: ${config.system.dataDir}`);
  console.log(`  Log level: ${config.system.logLevel}`);
  console.log(`  Gemini model: ${config.model.gemini.model}`);
  console.log(`  Temperature: ${config.model.gemini.temperature}`);
} catch (error) {
  console.error('❌ Failed to load default config:', error);
  process.exit(1);
}

// Test 2: Environment variable override
console.log(chalk.yellow('\nTest 2: Environment variable override'));
process.env.LOG_LEVEL = 'warn';
process.env.CODELOOPS_DATA_DIR = '/tmp/test-data';
try {
  const manager = new ConfigurationManager();
  const logLevel = manager.get<string>('system.logLevel');
  const dataDir = manager.get<string>('system.dataDir');
  
  if (logLevel === 'warn' && dataDir === '/tmp/test-data') {
    console.log('✅ Environment variables correctly override config');
  } else {
    throw new Error('Environment variable override failed');
  }
} catch (error) {
  console.error('❌ Environment variable test failed:', error);
  process.exit(1);
}

// Test 3: Configuration file loading
console.log(chalk.yellow('\nTest 3: Configuration file loading'));
const testConfigPath = join(tmpdir(), 'test-config.yaml');
const testConfig = `
system:
  logLevel: warn
  dataDir: /custom/data
model:
  gemini:
    temperature: 0.9
    topP: 0.8
`;
writeFileSync(testConfigPath, testConfig);

try {
  const manager = new ConfigurationManager(testConfigPath);
  const temp = manager.get<number>('model.gemini.temperature');
  const topP = manager.get<number>('model.gemini.topP');
  
  if (temp === 0.9 && topP === 0.8) {
    console.log('✅ Configuration file loaded correctly');
  } else {
    throw new Error('Config file values incorrect');
  }
  
  // Cleanup
  unlinkSync(testConfigPath);
} catch (error) {
  console.error('❌ Configuration file test failed:', error);
  unlinkSync(testConfigPath);
  process.exit(1);
}

// Test 4: Export/Import functionality
console.log(chalk.yellow('\nTest 4: Export/Import functionality'));
const exportPath = join(tmpdir(), 'export-test.yaml');
try {
  const manager = new ConfigurationManager();
  const originalConfig = manager.getAll();
  
  // Export
  ConfigurationExporter.export(originalConfig, exportPath, {
    format: 'yaml',
    maskSecrets: true
  });
  console.log('✅ Configuration exported successfully');
  
  // Import
  const importedConfig = ConfigurationExporter.import(exportPath);
  console.log('✅ Configuration imported successfully');
  
  // Verify basic properties match
  if (importedConfig.system.logLevel === originalConfig.system.logLevel &&
      importedConfig.model.gemini.model === originalConfig.model.gemini.model) {
    console.log('✅ Exported and imported configs match');
  } else {
    throw new Error('Export/import mismatch');
  }
  
  // Cleanup
  unlinkSync(exportPath);
} catch (error) {
  console.error('❌ Export/Import test failed:', error);
  try { unlinkSync(exportPath); } catch {
    // Ignore cleanup errors
  }
  process.exit(1);
}

// Test 5: Hot reload capability
console.log(chalk.yellow('\nTest 5: Hot reload capability'));
// Clear environment variables that might override config
delete process.env.LOG_LEVEL;
delete process.env.CODELOOPS_DATA_DIR;

const hotReloadPath = join(tmpdir(), 'hot-reload-test.yaml');
writeFileSync(hotReloadPath, 'system:\n  logLevel: info');

try {
  const manager = new ConfigurationManager(hotReloadPath);
  let changeDetected = false;
  
  manager.on('change', (changes) => {
    changeDetected = true;
    console.log('✅ Configuration change detected:', changes);
    console.log('Current log level after change:', manager.get('system.logLevel'));
  });
  
  manager.enableHotReload();
  
  // Update the file
  setTimeout(() => {
    writeFileSync(hotReloadPath, 'system:\n  logLevel: debug');
    
    // Check after a delay
    setTimeout(() => {
      if (changeDetected && manager.get('system.logLevel') === 'debug') {
        console.log('✅ Hot reload working correctly');
        unlinkSync(hotReloadPath);
        
        // All tests passed
        console.log(chalk.green('\n✨ All configuration system tests passed!'));
        process.exit(0);
      } else {
        throw new Error('Hot reload failed');
      }
    }, 1500);
  }, 500);
} catch (error) {
  console.error('❌ Hot reload test failed:', error);
  try { unlinkSync(hotReloadPath); } catch {
    // Ignore cleanup errors
  }
  process.exit(1);
}