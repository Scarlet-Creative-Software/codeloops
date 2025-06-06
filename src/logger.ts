import { type Logger, pino, type LevelWithSilentOrString } from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type CodeLoopsLogger = Logger;
let globalLogger: CodeLoopsLogger | null = null;

interface CreateLoggerOptions {
  withDevStdout?: boolean;
  withFile?: boolean;
  sync?: boolean;
  setGlobal?: boolean;
  level?: string;
}

const logsDir = path.resolve(__dirname, '../logs');
const logFile = path.join(logsDir, 'codeloops.log');
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
        //TODO: make this all configurable by the user
        frequency: 'daily',
        limit: {
          count: 14, // 14 days of log retention
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
  const logLevel: LevelWithSilentOrString =
    level ?? (process.env.LOG_LEVEL as LevelWithSilentOrString) ?? 'info';
  
  // Warn if debug level is set, as it can cause large log files
  if (logLevel === 'debug' && withFile) {
    console.warn('⚠️  Warning: LOG_LEVEL=debug can cause very large log files. Consider using "info" for production.');
  }
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
