const winston = require('winston');
const expressWinston = require('express-winston');
const { LEVEL } = require('triple-beam');
const { LoggingWinston } = require('@google-cloud/logging-winston');
const gcloud = require('./gcloud');

function preserveErrors(input) {
  const output = {};
  Object.entries(input).forEach(([key, value]) => {
    let outputValue = value;
    if (value instanceof Error) {
      outputValue = {};
      Object.getOwnPropertyNames(value).forEach((errorKey) => {
        outputValue[errorKey] = value[errorKey];
      });
    }
    if (Object.prototype.toString.call(value) === '[object Object]') {
      outputValue = preserveErrors(value);
    }

    output[key] = outputValue;
  });
  return output;
}

const SeverityLookup = {
  default: 'DEFAULT',
  silly: 'DEFAULT',
  verbose: 'DEBUG',
  debug: 'DEBUG',
  http: 'notice',
  info: 'info',
  warn: 'WARNING',
  error: 'ERROR',
};

// add severity level for GCP stackdriver
const stackdriverSeverityFormat = winston.format((info) => ({
  ...info,
  severity: SeverityLookup[info[LEVEL]] || SeverityLookup.default,
}));

const errorsPreserverFormat = winston.format((info) => ({
  ...info,
  ...preserveErrors(info),
}));

const gkeFormatters = [
  winston.format.timestamp(),
  stackdriverSeverityFormat(),
  errorsPreserverFormat(),
  winston.format.json(),
];

const isProd = (
  process.env.NODE_ENV === 'production'
  || process.env.NODE_ENV === 'staging'
);
const isTest = (process.env.NODE_ENV === 'test');

let level = isProd ? 'info' : 'debug';
if (process.env.LOG_LEVEL) level = process.env.LOG_LEVEL;

const transports = [];

if (!isTest) {
  if (gcloud.pkg && isProd) {
    transports.push(new winston.transports.Console({
      format: winston.format.combine(...gkeFormatters),
      stderrLevels: ['error'],
    }));
  } else {
    const consoleOpts = {
      level,
      handleExceptions: true,
      json: isProd,
      format: winston.format.simple(),
      colorize: !isProd,
    };
    transports.push(new winston.transports.Console(consoleOpts));
  }
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
