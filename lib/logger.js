/* eslint-disable no-param-reassign */
const winston = require('winston');
const expressWinston = require('express-winston');
const gcloud = require('./gcloud');

const isProd = (
  process.env.NODE_ENV === 'production'
  || process.env.NODE_ENV === 'staging'
);
const isTest = (process.env.NODE_ENV === 'test');

let level = isProd ? 'info' : 'debug';
if (process.env.LOG_LEVEL) level = process.env.LOG_LEVEL;

const gkeFormatter = winston.format((info) => {
  info.severity = info.level.toUpperCase();
  delete info.level;
  return info;
});

const format = isProd
  ? winston.format.combine(
    gkeFormatter(),
    winston.format.json(),
  )
  : winston.format.combine(
    winston.format.colorize(),
    winston.format.prettyPrint(),
    winston.format.splat(),
    winston.format.simple(),
  );

const logger = winston.createLogger({
  format,
  level: isTest ? [] : level,
  transports: [
    new winston.transports.Console(),
  ],
});

// Express requests
const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  msg: '{{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms {{req.ip}}',
  expressFormat: false,
  meta: false,
  colorize: !isProd,
  skip: (req) => {
    const urlLog = req.url.substring(0, 500);
    return /(^\/assets)|(\.(ico|png|jpg|jpeg|webp|woff|woff2|ttf|svg|css|js))|~*health/ig.exec(urlLog);
  },
});

// Express errors
const errorLogger = expressWinston.errorLogger({
  winstonInstance: logger,
  msg: '{{err.message}}',
});

const stackdriverRequestLogger = expressWinston.logger({
  format,
  transports: [
    new winston.transports.Console(),
  ],
  metaField: null,
  responseField: null,
  requestWhitelist: [],
  responseWhitelist: ['body'],
  skip: (req) => {
    const urlLog = req.url.substring(0, 500);
    return /(^\/assets)|(\.(ico|png|jpg|jpeg|webp|woff|woff2|ttf|svg|css|js))|~*health/ig.exec(urlLog);
  },
  dynamicMeta: (req, res) => {
    const httpRequest = {};
    const meta = {};
    if (req) {
      const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
      meta.httpRequest = httpRequest;
      httpRequest.requestMethod = req.method;
      httpRequest.requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      httpRequest.protocol = `HTTP/${req.httpVersion}`;
      httpRequest.remoteIp = ip.indexOf(':') >= 0 ? ip.substring(ip.lastIndexOf(':') + 1) : ip; // just ipv4
      httpRequest.requestSize = req.socket.bytesRead;
      httpRequest.userAgent = req.get('User-Agent');
      httpRequest.referrer = req.get('Referrer');
    }

    if (res) {
      meta.httpRequest = httpRequest;
      httpRequest.status = res.statusCode;
      httpRequest.latency = `${(res.responseTime / 1000)}s`;
      if (res.body) {
        if (typeof res.body === 'object') {
          httpRequest.responseSize = JSON.stringify(res.body).length;
        } else if (typeof res.body === 'string') {
          httpRequest.responseSize = res.body.length;
        }
      }
      meta.severity = (res.statusCode >= 500) ? 'warn' : 'info';
    }
    return meta;
  },
});

logger.requestLogger = isProd ? stackdriverRequestLogger : requestLogger;
logger.errorLogger = errorLogger;
logger.gcloudErrorsMiddleWare = gcloud.expressMiddleWare();
logger.outputError = function (msg) {
  this.error(msg);
};

module.exports = logger;
