const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  white: '\x1b[37m'
};

const levelColors = {
  log: colors.blue,
  error: colors.red,
  warn: colors.yellow
};

const formatMessage = (level, message, meta = {}) => {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `${colors.dim}[${timestamp}]${colors.reset} ${levelColors[level]}[${level.toUpperCase()}]${colors.reset}`;
  
  if (typeof message === 'string') {
    return `${prefix} ${message}${meta ? ` ${colors.dim}${JSON.stringify(meta)}${colors.reset}` : ''}`;
  }
  
  return `${prefix} ${JSON.stringify({ message, ...meta })}`;
};

const log = (level, message, meta = {}) => {
  console[level](formatMessage(level, message, meta));
};

module.exports = {
  info: (msg, meta) => log('log', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta)
};