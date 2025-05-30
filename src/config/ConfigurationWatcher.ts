import { watch, FSWatcher } from 'fs';
import { EventEmitter } from 'events';
import type { Logger } from '../logger.js';

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error' | 'log';

export class ConfigurationWatcher extends EventEmitter {
  private watcher?: FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  private debounceDelay = 1000; // 1 second
  private logger: Logger | null = null;

  constructor(private filePath: string) {
    super();
    this.start();
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
   * Start watching the configuration file
   */
  start(): void {
    if (this.watcher) {
      return;
    }

    try {
      this.watcher = watch(this.filePath, (eventType) => {
        if (eventType === 'change') {
          this.handleChange();
        }
      });

      this.log('debug', `Started watching configuration file: ${this.filePath}`);
    } catch (error) {
      this.log('error', `Failed to start configuration watcher:`, error);
    }
  }

  /**
   * Handle file change with debouncing
   */
  private handleChange(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.log('debug', 'Configuration file change detected');
      this.emit('change');
    }, this.debounceDelay);
  }

  /**
   * Stop watching the configuration file
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
      this.log('debug', `Stopped watching configuration file: ${this.filePath}`);
    }
  }
}