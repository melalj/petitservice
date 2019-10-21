'use strict';

const winston = require('winston');
const expressWinston = require('express-winston');

const gcloud = require('./gcloud');

const isProd = (process.env.NODE_ENV === 'production');
const isTest = (process.env.NODE_ENV === 'test');

let level = isProd ? 'info' : 'debug';
if (process.env.LOG_LEVEL) level = process.env.LOG_LEVEL;

const prettyJson = winston.format.printf(info => {
  if (info.message.constructor === Object) {
    info.message = JSON.stringify(info.message, null, 4)
  }
  return `${info.level}: ${info.message}`
});

const format = isProd
  ? winston.format.json()
  : winston.format.combine(
      winston.format.colorize(),
      winston.format.prettyPrint(),
      winston.format.splat(),
      winston.format.simple(),
      prettyJson,
  );
const transports = isTest ? [] : [
  new winston.transports.Console()
];

const logger = winston.createLogger({
  format,
  level,
  transports,
});

// Express requests
const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  expressFormat: true,
  meta: false,
  colorize: !isProd,
  skip: (req) => {
    const urlLog = req.url.substring(0, 500);
    return /(^\/assets)|(\.(ico|png|jpg|gif|jpeg|woff|woff2|ttf|svg|css|js))|~*health/ig.exec(urlLog);
  },
});

// Express errors
const errorLogger = expressWinston.errorLogger({
  winstonInstance: logger,
  msg: '{{err.message}}'
});

logger.requestLogger = requestLogger;
logger.errorLogger = errorLogger;
logger.gcloudErrorsMiddleWare = gcloud.expressMiddleWare();
logger.outputError = function (msg) {
  this.error(msg);
};

module.exports = logger;
