import { type Logger, pino, type LevelWithSilentOrString } from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, getConfigurationManager } from './config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type CodeLoopsLogger = Logger;
export type { Logger };
let globalLogger: CodeLoopsLogger | null = null;

interface CreateLoggerOptions {
  withDevStdout?: boolean;
  withFile?: boolean;
  sync?: boolean;
  setGlobal?: boolean;
  level?: string;
}

// Get log configuration from new config system
let logsDir: string;
let logFile: string;
let maxLogSize: number;

try {
  const dataDir = getConfig<string>('system.dataDir');
  logsDir = path.join(dataDir, 'logs');
  const configLogFile = getConfig<string | undefined>('system.logFile');
  logFile = configLogFile || path.join(logsDir, 'codeloops.log');
  maxLogSize = getConfig<number>('system.maxLogSize');
} catch {
  // Fallback to defaults if config system not initialized
  logsDir = path.resolve(__dirname, '../logs');
  logFile = path.join(logsDir, 'codeloops.log');
  maxLogSize = 10 * 1024 * 1024; // 10MB
}

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
/**
 * Creates and returns a new pino logger instance with the given options.
 * Also sets the global logger if not already set.
 */
export function createLogger(options: CreateLoggerOptions = {}): CodeLoopsLogger {
  // Ensure logs directory exists
  const { withDevStdout, withFile, setGlobal, level, ...pinoOptions } = options;

  const targets: pino.TransportTargetOptions[] = [];
  if (withFile) {
    targets.push({
      target: 'pino-roll',
      options: {
        file: logFile,
        frequency: 'daily',
        limit: {
          count: 14, // 14 days of log retention
          size: maxLogSize, // Max size per file from config
        },
      },
    });
  }
  if (withDevStdout) {
    targets.push({
      target: 'pino-pretty',
      options: {
        destination: 1,
      },
    });
  }
  const transports = pino.transport({ targets, ...pinoOptions });
  // Get log level from configuration system
  let logLevel: LevelWithSilentOrString;
  try {
    logLevel = level ?? getConfig<string>('system.logLevel') as LevelWithSilentOrString;
  } catch {
    // Fallback to environment variable or default
    logLevel = level ?? (process.env.LOG_LEVEL as LevelWithSilentOrString) ?? 'info';
  }
  
  // Skip console warnings in MCP mode as they interfere with JSON protocol
  const logger = pino({ level: logLevel }, transports);
  if (setGlobal && !globalLogger) {
    globalLogger = logger;
  }
  return logger;
}

/**
 * Returns the global singleton logger instance. If not created, creates with default options.
 */
export function getInstance(options?: CreateLoggerOptions): CodeLoopsLogger {
  if (!globalLogger) {
    createLogger({ withFile: true, ...options, setGlobal: true });
  } else if (options?.level || process.env.LOG_LEVEL) {
    const logLevel: LevelWithSilentOrString =
      options?.level ?? (process.env.LOG_LEVEL as LevelWithSilentOrString) ?? 'info';
    globalLogger.level = logLevel;
  }
  return globalLogger!;
}

export function setGlobalLogger(logger: CodeLoopsLogger) {
  globalLogger = logger;
}

export function debug(...args: Parameters<CodeLoopsLogger['debug']>): void {
  getInstance().debug(...args);
}

// Listen for configuration changes to update log level
try {
  const configManager = getConfigurationManager();
  interface LogLevelChange {
    path: string;
    newValue: unknown;
  }
  
  configManager.on('change', (changes) => {
    const logLevelChange = changes.find((c: LogLevelChange) => c.path === 'system.logLevel');
    if (logLevelChange && globalLogger) {
      globalLogger.level = logLevelChange.newValue as LevelWithSilentOrString;
      globalLogger.info(`Log level changed to: ${logLevelChange.newValue}`);
    }
  });
} catch {
  // Ignore if configuration system not available
}
