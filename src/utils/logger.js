const log = (level, message, meta = {}) => {
  console[level](JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta
  }));
};

module.exports = {
  info: (msg, meta) => log('log', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta)
}; 