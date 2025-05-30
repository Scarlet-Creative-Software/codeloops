#!/usr/bin/env tsx

import { Command } from 'commander';
import { ConfigurationManager } from './ConfigurationManager.js';
import { ConfigurationExporter } from './ConfigurationExporter.js';
import { writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new Command();

program
  .name('codeloops-config')
  .description('Codeloops configuration management utility')
  .version('1.0.0');

// Init command - create a new configuration file
program
  .command('init')
  .description('Initialize a new configuration file')
  .option('-f, --format <format>', 'Configuration format (yaml or json)', 'yaml')
  .option('-p, --path <path>', 'Path to create configuration file', './codeloops.config.yaml')
  .action((options) => {
    try {
      const templatePath = join(__dirname, '../../codeloops.config.template.yaml');
      
      if (options.format === 'yaml') {
        copyFileSync(templatePath, options.path);
      } else {
        // Convert YAML template to JSON
        const template = ConfigurationExporter.generateTemplate('json');
        writeFileSync(options.path, template);
      }
      
      console.log(chalk.green(`✓ Configuration file created at: ${options.path}`));
      console.log(chalk.gray('Edit the file to customize your settings'));
    } catch (error) {
      console.error(chalk.red('Failed to initialize configuration:'), error);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate a configuration file')
  .argument('<file>', 'Configuration file to validate')
  .action((file) => {
    try {
      const config = ConfigurationExporter.import(file);
      console.log(chalk.green(`✓ Configuration is valid`));
      
      // Show summary
      console.log(chalk.blue('\nConfiguration Summary:'));
      console.log(`  Data Directory: ${config.system.dataDir}`);
      console.log(`  Log Level: ${config.system.logLevel}`);
      console.log(`  Gemini Model: ${config.model.gemini.model}`);
      console.log(`  Multi-Critic: ${config.engine.actorCritic.enableMultiCritic ? 'Enabled' : 'Disabled'}`);
    } catch (error) {
      console.error(chalk.red('Configuration validation failed:'), error);
      process.exit(1);
    }
  });

// Export command
program
  .command('export')
  .description('Export current configuration')
  .option('-o, --output <file>', 'Output file path', './codeloops-config-export.yaml')
  .option('-f, --format <format>', 'Export format (yaml or json)', 'yaml')
  .option('--no-mask', 'Do not mask sensitive values')
  .action((options) => {
    try {
      const manager = new ConfigurationManager();
      const config = manager.getAll();
      
      ConfigurationExporter.export(config, options.output, {
        format: options.format as 'yaml' | 'json',
        maskSecrets: options.mask,
        pretty: true
      });
      
      console.log(chalk.green(`✓ Configuration exported to: ${options.output}`));
    } catch (error) {
      console.error(chalk.red('Failed to export configuration:'), error);
      process.exit(1);
    }
  });

// Get command - get a specific configuration value
program
  .command('get')
  .description('Get a configuration value')
  .argument('<path>', 'Configuration path (e.g., system.logLevel)')
  .action((path) => {
    try {
      const manager = new ConfigurationManager();
      const value = manager.get(path);
      
      console.log(chalk.blue(`${path}:`), value);
    } catch (error) {
      console.error(chalk.red('Failed to get configuration value:'), error);
      process.exit(1);
    }
  });

// List command - list all configuration values
program
  .command('list')
  .description('List all configuration values')
  .option('-f, --format <format>', 'Output format (json or yaml)', 'yaml')
  .action(async (options) => {
    try {
      const manager = new ConfigurationManager();
      const config = manager.getAll();
      
      if (options.format === 'json') {
        console.log(JSON.stringify(config, null, 2));
      } else {
        // Import yaml module
        const yaml = await import('yaml');
        console.log(yaml.stringify(config));
      }
    } catch (error) {
      console.error(chalk.red('Failed to list configuration:'), error);
      process.exit(1);
    }
  });

// Env command - show environment variable mappings
program
  .command('env')
  .description('Show environment variable mappings')
  .action(() => {
    console.log(chalk.blue('Environment Variable Mappings:\n'));
    
    const mappings = [
      { env: 'CODELOOPS_DATA_DIR', config: 'system.dataDir', description: 'Data directory path' },
      { env: 'LOG_LEVEL', config: 'system.logLevel', description: 'Logging level' },
      { env: 'GOOGLE_GENAI_API_KEY', config: 'model.gemini.apiKey', description: 'Google AI API key' },
      { env: 'OLLAMA_BASE_URL', config: 'model.ollama.baseUrl', description: 'Ollama API URL' },
      { env: 'FASTAGENT_BASE_URL', config: 'agent.critic.baseUrl', description: 'Fast-agent base URL' },
    ];
    
    for (const mapping of mappings) {
      const currentValue = process.env[mapping.env];
      console.log(chalk.yellow(`${mapping.env}`));
      console.log(`  Config Path: ${mapping.config}`);
      console.log(`  Description: ${mapping.description}`);
      console.log(`  Current Value: ${currentValue || chalk.gray('(not set)')}`);
      console.log();
    }
  });

// Watch command - watch configuration file for changes
program
  .command('watch')
  .description('Watch configuration file for changes')
  .option('-c, --config <file>', 'Configuration file to watch')
  .action((options) => {
    try {
      const manager = new ConfigurationManager(options.config);
      
      console.log(chalk.blue('Watching configuration file for changes...'));
      console.log(chalk.gray('Press Ctrl+C to stop\n'));
      
      manager.on('change', (changes) => {
        console.log(chalk.yellow(`Configuration changed at ${new Date().toISOString()}`));
        for (const change of changes) {
          console.log(`  ${change.path}: ${change.oldValue} → ${change.newValue}`);
        }
        console.log();
      });
      
      manager.enableHotReload();
      
      // Keep process running
      process.stdin.resume();
    } catch (error) {
      console.error(chalk.red('Failed to watch configuration:'), error);
      process.exit(1);
    }
  });

program.parseAsync().catch((error) => {
  console.error(chalk.red('Command failed:'), error);
  process.exit(1);
});