const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL,
  ...(process.env.NODE_ENV !== 'production'
    ? {
      transport: {
        target: 'pino-pretty',
      },
    }
    : {}),
});

module.exports = logger;
