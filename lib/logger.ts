// lib/logger.ts - Simple structured logger for the FPL platform
//
// This module exposes a small logging utility that prefixes every log
// message with a timestamp and log level.  It is intentionally kept
// lightweight – relying only on built‑in functionality – so that it can be
// used in both server-side scripts and API routes without introducing
// additional dependencies.

// Format a date as ISO string without milliseconds for cleaner logs
function formatDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Core logging function.  All log methods delegate here.  It builds
 * a prefix including the timestamp and level, then forwards the rest
 * of the arguments on to `console.log`.  In production environments
 * you could swap this implementation out for something more
 * sophisticated (e.g. sending logs to an external service).
 *
 * @param level   The log level (INFO, WARN, ERROR, DEBUG)
 * @param args    Variadic list of values to log
 */
function log(level: string, ...args: any[]): void {
  const timestamp = formatDate(new Date());
  const prefix = `[${timestamp}] [${level}]`;
  // eslint-disable-next-line no-console
  console.log(prefix, ...args);
}

export const logger = {
  /**
   * Log an informational message.  Use this for normal operational
   * messages such as startup banners, state changes and summaries.
   */
  info: (...args: any[]): void => log('INFO', ...args),

  /**
   * Log a warning.  Use this when something unexpected happened but
   * the application can continue to operate.
   */
  warn: (...args: any[]): void => log('WARN', ...args),

  /**
   * Log an error.  Use this when an operation failed and may
   * require attention.
   */
  error: (...args: any[]): void => log('ERROR', ...args),

  /**
   * Log a debug message.  Use this for verbose output during
   * development.  In production the messages can be filtered by
   * checking the `NODE_ENV` variable before calling.
   */
  debug: (...args: any[]): void => log('DEBUG', ...args),
};