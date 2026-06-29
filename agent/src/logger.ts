// Lightweight structured logger (no external deps)
type Level = 'debug' | 'info' | 'warn' | 'error';

const colors: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const reset = '\x1b[0m';

function fmt(level: Level, msg: string, meta?: Record<string, unknown>): string {
  const t = new Date().toISOString();
  const c = colors[level];
  const metaStr = meta ? ` ${JSON.stringify(meta, (_k, v) => typeof v === 'bigint' ? v.toString() : v)}` : '';
  return `${c}[${t}] [${level.toUpperCase()}]${reset} ${msg}${metaStr}`;
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => console.log(fmt('debug', msg, meta)),
  info: (msg: string, meta?: Record<string, unknown>) => console.log(fmt('info', msg, meta)),
  warn: (msg: string, meta?: Record<string, unknown>) => console.warn(fmt('warn', msg, meta)),
  error: (msg: string, meta?: Record<string, unknown>) => console.error(fmt('error', msg, meta)),
};