'use strict';

const winston = require('winston');
const expressWinston = require('express-winston');
const gcloud = require('./gcloud');

const isProd = (process.env.NODE_ENV === 'production');
const isTest = (process.env.NODE_ENV === 'test');

let level = isProd ? 'info' : 'debug';
if (process.env.LOG_LEVEL) level = process.env.LOG_LEVEL;

const defaultOptions = {
  level,
  json: false,
  colorize: !isProd,
};

// Default transport: Console
winston.configure({
  transports: isTest ? [] : [new (winston.transports.Console)(defaultOptions)],
});

// Express requests
const requestLogger = expressWinston.logger({
  winstonInstance: winston,
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
  winstonInstance: winston,
  msg: '{{err.message}}'
});

module.exports = {
  requestLogger,
  errorLogger,
  gcloudErrorsMiddleWare: gcloud.expressMiddleWare(),
  error: (e) => {
    gcloud.reportError(e);
    winston.error(e);
  },
  warn: winston.warn,
  info: winston.info,
  log: winston.log,
  verbose: winston.verbose,
  debug: winston.debug,
  silly: winston.silly,
};
