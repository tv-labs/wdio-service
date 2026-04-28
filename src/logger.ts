import type { LogLevel } from './types.js';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
  silent: 5,
};

function envLogLevel(): LogLevel | undefined {
  const value = process.env.WDIO_LOG_LEVEL;
  return value && value in LOG_LEVELS ? (value as LogLevel) : undefined;
}

export class Logger {
  private logLevel: LogLevel;

  constructor(
    private name: string,
    logLevel?: LogLevel,
  ) {
    this.logLevel = logLevel ?? envLogLevel() ?? 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.logLevel === 'silent') {
      return false;
    }
    return LOG_LEVELS[level] <= LOG_LEVELS[this.logLevel];
  }

  private formatMessage(level: LogLevel, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} ${level.toUpperCase()} ${this.name}: ${args
      .map((arg) => this.serializeArg(arg))
      .join(' ')}`;
  }

  private serializeArg(arg: unknown): string {
    if (
      typeof arg === 'string' ||
      typeof arg === 'number' ||
      typeof arg === 'boolean'
    ) {
      return String(arg);
    }

    if (arg === null || arg === undefined) {
      return String(arg);
    }

    if (arg instanceof Error) {
      // Handle Error objects specially - use stack trace which includes name and message
      return arg.stack || `${arg.name}: ${arg.message}`;
    }

    if (typeof arg === 'object') {
      try {
        // Try JSON.stringify with a custom replacer to handle nested Error objects
        const stringified = JSON.stringify(arg, (key, value) => {
          if (value instanceof Error) {
            return `${value.name}: ${value.message}`;
          }
          return value;
        });

        // If it's just an empty object, try to extract more info
        if (stringified === '{}') {
          // For objects that don't serialize well, try to extract key properties
          const keys = Object.getOwnPropertyNames(arg);
          if (keys.length > 0) {
            const props: Record<string, unknown> = {};
            keys.forEach((key) => {
              try {
                const value = (arg as Record<string, unknown>)[key];
                if (value instanceof Error) {
                  props[key] = `${value.name}: ${value.message}`;
                } else {
                  props[key] = value;
                }
              } catch {
                props[key] = '[unable to access]';
              }
            });
            return JSON.stringify(props);
          }
        }
        return stringified;
      } catch {
        // Fallback to string representation if JSON.stringify fails
        return String(arg);
      }
    }

    return String(arg);
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', ...args));
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', ...args));
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', ...args));
    }
  }

  error(...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', ...args));
    }
  }

  trace(...args: unknown[]): void {
    if (this.shouldLog('trace')) {
      console.trace(this.formatMessage('trace', ...args));
    }
  }
}
