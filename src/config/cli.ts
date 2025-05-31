#!/usr/bin/env tsx

import { Command } from 'commander';
import { ConfigurationManager } from './ConfigurationManager.js';
import { ConfigurationExporter } from './ConfigurationExporter.js';
import { writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { getInstance as getLogger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Detects if the process is running in MCP (Model Context Protocol) mode.
 * MCP uses stdio for JSON-RPC communication, so any console output corrupts the protocol.
 */
function isMcpMode(): boolean {
  // Check explicit environment variables first (most reliable)
  if (process.env.MCP_MODE === 'true' || process.env.CLAUDE_MCP === 'true') {
    return true;
  }
  
  // Check for MCP server indicators in process arguments
  const hasServerArgs = process.argv.some(arg => 
    arg.includes('mcp-server') || 
    arg.includes('claude-mcp') ||
    (arg.includes('mcp') && arg.includes('server'))
  );
  
  // Check for stdio-based JSON-RPC communication (more conservative)
  // Only trigger if we're actually being run as an MCP server
  const isStdioRedirected = !process.stdout.isTTY && !process.stderr.isTTY && !process.stdin.isTTY;
  
  return hasServerArgs || (isStdioRedirected && hasServerArgs);
}

const IS_MCP_MODE = isMcpMode();
const logger = getLogger({ withFile: true });

// Log MCP mode detection for debugging purposes
if (IS_MCP_MODE) {
  logger.debug('CLI running in MCP mode - console output redirected to file logger');
}

/**
 * Safe console logging that respects MCP mode.
 * In MCP mode, uses the file logger to avoid corrupting JSON-RPC.
 * In CLI mode, uses console for immediate user feedback.
 */
function safeLog(message: string, level: 'info' | 'error' | 'warn' = 'info'): void {
  if (IS_MCP_MODE) {
    // Use file logger in MCP mode to avoid corrupting JSON-RPC protocol
    logger[level](message);
  } else {
    // Use console in CLI mode for immediate user feedback
    console.log(message);
  }
}

function safeError(message: string, error?: unknown): void {
  if (IS_MCP_MODE) {
    // Use file logger in MCP mode
    logger.error(message, error);
  } else {
    // Use console.error in CLI mode
    console.error(message, error);
  }
}

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
      
      safeLog(chalk.green(`✓ Configuration file created at: ${options.path}`));
      safeLog(chalk.gray('Edit the file to customize your settings'));
    } catch (error) {
      safeError(chalk.red('Failed to initialize configuration:'), error);
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
      safeLog(chalk.green(`✓ Configuration is valid`));
      
      // Show summary
      safeLog(chalk.blue('\nConfiguration Summary:'));
      safeLog(`  Data Directory: ${config.system.dataDir}`);
      safeLog(`  Log Level: ${config.system.logLevel}`);
      safeLog(`  Gemini Model: ${config.model.gemini.model}`);
      safeLog(`  Multi-Critic: ${config.engine.actorCritic.enableMultiCritic ? 'Enabled' : 'Disabled'}`);
    } catch (error) {
      safeError(chalk.red('Configuration validation failed:'), error);
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
      
      safeLog(chalk.green(`✓ Configuration exported to: ${options.output}`));
    } catch (error) {
      safeError(chalk.red('Failed to export configuration:'), error);
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
      
      safeLog(chalk.blue(`${path}:`) + ' ' + value);
    } catch (error) {
      safeError(chalk.red('Failed to get configuration value:'), error);
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
        safeLog(JSON.stringify(config, null, 2));
      } else {
        // Import yaml module
        const yaml = await import('yaml');
        safeLog(yaml.stringify(config));
      }
    } catch (error) {
      safeError(chalk.red('Failed to list configuration:'), error);
      process.exit(1);
    }
  });

// Env command - show environment variable mappings
program
  .command('env')
  .description('Show environment variable mappings')
  .action(() => {
    safeLog(chalk.blue('Environment Variable Mappings:\n'));
    
    const mappings = [
      { env: 'CODELOOPS_DATA_DIR', config: 'system.dataDir', description: 'Data directory path' },
      { env: 'LOG_LEVEL', config: 'system.logLevel', description: 'Logging level' },
      { env: 'GOOGLE_GENAI_API_KEY', config: 'model.gemini.apiKey', description: 'Google AI API key' },
      { env: 'OLLAMA_BASE_URL', config: 'model.ollama.baseUrl', description: 'Ollama API URL' },
      { env: 'FASTAGENT_BASE_URL', config: 'agent.critic.baseUrl', description: 'Fast-agent base URL' },
    ];
    
    for (const mapping of mappings) {
      const currentValue = process.env[mapping.env];
      safeLog(chalk.yellow(`${mapping.env}`));
      safeLog(`  Config Path: ${mapping.config}`);
      safeLog(`  Description: ${mapping.description}`);
      safeLog(`  Current Value: ${currentValue || chalk.gray('(not set)')}`);
      safeLog('');
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
      
      safeLog(chalk.blue('Watching configuration file for changes...'));
      safeLog(chalk.gray('Press Ctrl+C to stop\n'));
      
      manager.on('change', (changes) => {
        safeLog(chalk.yellow(`Configuration changed at ${new Date().toISOString()}`));
        for (const change of changes) {
          safeLog(`  ${change.path}: ${change.oldValue} → ${change.newValue}`);
        }
        safeLog('');
      });
      
      manager.enableHotReload();
      
      // Keep process running
      process.stdin.resume();
    } catch (error) {
      safeError(chalk.red('Failed to watch configuration:'), error);
      process.exit(1);
    }
  });

program.parseAsync().catch((error) => {
  safeError(chalk.red('Command failed:'), error);
  process.exit(1);
});