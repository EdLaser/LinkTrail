import pino, { type Logger as PinoLogger } from 'pino';

/**
 * Root logger instance
 * Configured for JSON output to stdout with trace-level logging
 */
const rootLogger = pino({
  level: process.env.LOG_LEVEL || 'trace',
  transport: undefined, // Use stdout directly (Bun runtime captures)
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Creates a child logger for a specific module
 * Includes module name in all log output for filtering and correlation
 *
 * @param moduleName - Name of the module (e.g., "app", "oauth", "tokenService")
 * @returns Child logger instance with module context
 */
export function createLogger(moduleName: string): PinoLogger {
  return rootLogger.child({ module: moduleName });
}

/**
 * Export the root logger for app-level logging (startup, config validation, etc.)
 */
export const logger = rootLogger;

/**
 * Extract request ID from context for structured logging correlation
 * Useful when passing request ID to loggers that don't have automatic context
 *
 * @param requestId - UUID from request context
 * @returns Child logger with request ID bound
 */
export function loggerWithRequestId(requestId: string): PinoLogger {
  return rootLogger.child({ requestId });
}
