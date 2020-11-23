const winston = require('winston');
const expressWinston = require('express-winston');
const { LoggingWinston } = require('@google-cloud/logging-winston');

const gcloud = require('./gcloud');


const isProd = (
  process.env.NODE_ENV === 'production'
  || process.env.NODE_ENV === 'staging'
);
const isTest = (process.env.NODE_ENV === 'test');

let level = isProd ? 'info' : 'debug';
if (process.env.LOG_LEVEL) level = process.env.LOG_LEVEL;

const transports = [];

if (!isTest) {
  transports.push(new winston.transports.Console());
}

if (gcloud.pkg && isProd) {
  const stackdriverWinston = new LoggingWinston({
    serviceContext: {
      service: gcloud.pkg.name,
      version: gcloud.pkg.version,
    },
  });
  transports.push(stackdriverWinston);
}

const logger = winston.createLogger({
  level,
  transports,
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
    return /(^\/assets)|(\.(ico|png|jpg|gif|jpeg|woff|woff2|ttf|svg|css|js))|~*health/ig.exec(urlLog);
  },
});

// Express errors
const errorLogger = expressWinston.errorLogger({
  winstonInstance: logger,
  msg: '{{err.message}}',
});

let stackdriverRequestLogger;
const loadStackdriverMiddleware = async () => {
  if (gcloud.pkg && isProd) {
    stackdriverRequestLogger = await LoggingWinston.express.makeMiddleware(logger);
  }
};

logger.getRequestLogger = () => (stackdriverRequestLogger || requestLogger);
logger.errorLogger = errorLogger;
logger.gcloudErrorsMiddleWare = gcloud.expressMiddleWare();
logger.loadStackdriverMiddleware = loadStackdriverMiddleware;
logger.outputError = function (msg) {
  this.error(msg);
};

module.exports = logger;
