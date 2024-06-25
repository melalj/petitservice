const bodyParser = require('body-parser');
const compression = require('compression');
const uuid = require('uuid');
const pino = require('pino');
const pinoHttp = require('pino-http');

const logger = require('./logger');

function addStandard(app) {
  app.disable('x-powered-by');
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true, parameterLimit: 10000 }));

  // health check
  app.get('/~health', (req, res) => res.send('ok'));

  // Remove trailing slashes
  app.use((req, res, next) => {
    if (req.path.substr(-1) === '/' && req.path.length > 1) {
      const query = req.url.slice(req.path.length);
      res.redirect(301, req.path.slice(0, -1) + query);
    } else {
      next();
    }
  });
}

function addCompression(app) {
  app.use(compression());
}

function addLogs(app) {
  // Logging
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req) => {
          if (/\/favicon|\/health|\/prom\/metrics/.test(req.url)) {
            return true;
          }
          return false;
        },
      },
      genReqId(req, res) {
        const existingID = req.id ?? req.headers['x-request-id'];
        if (existingID) return existingID;
        const id = uuid.v4();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customSuccessMessage(req, res) {
        return `[${res.statusCode}] ${req.method} ${req.originalUrl}`;
      },
      customErrorMessage(req, res) {
        return `[${res.statusCode}] ${req.method} ${req.originalUrl}: ${res.locals.error?.name} - ${res.locals.error?.message}`;
      },
      serializers: {
        req: pino.stdSerializers.wrapRequestSerializer((req) => ({
          id: req.raw.id,
          method: req.raw.method,
          path: req.raw.url,
          ip: (String(req.raw.headers['x-forwarded-for']) || req.raw.connection.remoteAddress || '').split(',')[0],
          country: req.raw.headers['CF-IPCountry'],
          headers: {
            host: req.raw.headers.host,
            'user-agent': req.raw.headers['user-agent'],
            referer: req.raw.headers.referer,
          },
        })),
        res: pino.stdSerializers.wrapResponseSerializer((res) => ({
          statusCode: res.raw.statusCode,
        })),
        err: pino.stdSerializers.wrapErrorSerializer(() => ({})),
      },
      customProps(req, res) {
        return {
          error: res.locals.error,
        };
      },
      customLogLevel(req, res, err) {
        if (res.statusCode >= 400 && res.statusCode < 500) {
          return 'warn';
        } if (res.statusCode >= 500 || err) {
          return 'error';
        } if (res.statusCode >= 300 && res.statusCode < 400) {
          return 'silent';
        }
        return 'info';
      },
    }),
  );
}

function addErrorHandlers(app, isHTML) {
  // Page not found
  app.use((req, res) => {
    res.status(404);
    if (isHTML && req.accepts('html')) return res.render('404', req.defaultVars);
    return res.send({ error: 'Not found' });
  });

  // Output Error page
  app.use((err, req, res, next) => {
    if (!err) return next();
    const status = err.status || 500;
    res.status(status);
    res.locals.error = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
    const ip = (req.header('x-forwarded-for') || req.connection.remoteAddress || req.ip || '').split(',')[0];
    if (process.env.NODE_ENV !== 'production' || (process.env.EXPRESS_DEBUG_IP || '').split(',').includes(ip)) {
      return res.send({
        error: err.message,
        status,
        trace: err,
        stack: err.stack,
      });
    }
    const message = status >= 500 ? `[${err.name}] Internal Server Error: ${req.id}` : err.message;
    return res.send({ error: message });
  });
}

module.exports = {
  addStandard,
  addCompression,
  addLogs,
  addErrorHandlers,
};
