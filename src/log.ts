/**
 * Minimal structured stdout logger (the daemon's operational trail). Keeps the
 * committed code free of console.log while staying dependency-free.
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
  const suffix = data ? ` ${JSON.stringify(data)}` : "";
  process.stdout.write(`[${new Date().toISOString()}] ${message}${suffix}\n`);
}

export function logError(message: string, data?: Record<string, unknown>): void {
  const suffix = data ? ` ${JSON.stringify(data)}` : "";
  process.stderr.write(`[${new Date().toISOString()}] ERROR ${message}${suffix}\n`);
}
