const COLORS = {
  INFO: '\x1b[36m',
  WARN: '\x1b[33m',
  ERROR: '\x1b[31m',
  DEBUG: '\x1b[90m',
  RESET: '\x1b[0m',
};

let debugMode = false;

export function setDebugMode(v) { debugMode = v; }
export function isDebug() { return debugMode; }

function log(level, ...args) {
  if (level === 'DEBUG' && !debugMode) return;
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const color = COLORS[level] || '';
  const prefix = `${color}[${ts}] [${level.padEnd(5)}]${COLORS.RESET}`;
  if (level === 'ERROR') console.error(prefix, ...args);
  else console.log(prefix, ...args);
}

export const info = (...args) => log('INFO', ...args);
export const warn = (...args) => log('WARN', ...args);
export const error = (...args) => log('ERROR', ...args);
export const debug = (...args) => log('DEBUG', ...args);
