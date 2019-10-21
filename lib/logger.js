'use strict';

const winston = require('winston');
const expressWinston = require('express-winston');

const gcloud = require('./gcloud');

const isProd = (process.env.NODE_ENV === 'production');
const isTest = (process.env.NODE_ENV === 'test');

let level = isProd ? 'info' : 'debug';
if (process.env.LOG_LEVEL) level = process.env.LOG_LEVEL;

const format = isProd
  ? winston.format.json()
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
  );
const transports = isTest ? [] : [
  new winston.transports.Console()
];

const loggerObj = winston.createLogger({
  format,
  level,
  transports,
});

// Express requests
const requestLogger = null;

// Express errors
const errorLogger = null

module.exports = {
  requestLogger,
  errorLogger,
  gcloudErrorsMiddleWare: gcloud.expressMiddleWare(),
  error: (e) => {
    gcloud.reportError(e);
    loggerObj.error(e);
  },
  outputError: (msg) => {
    loggerObj.error(msg);
  },
  warn: (...args) => loggerObj.warn(...args),
  info: (...args) => loggerObj.info(...args),
  log: (...args) => loggerObj.log(...args),
  verbose: (...args) => loggerObj.verbose(...args),
  debug: (...args) => loggerObj.debug(...args),
  silly: (...args) => loggerObj.silly(...args),
};
