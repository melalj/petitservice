'use strict';

const bodyParser = require('body-parser');
const compression = require('compression');

const logger = require('./logger');

function addStandard(app) {
  app.disable('x-powered-by');
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true, parameterLimit: 10000 }));

  // health check
  app.get('/~health', (req, res) => {
    return res.send('ok');
  });

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
  app.use(logger.requestLogger);
}

function addErrorHandlers(app, isHTML) {
  // Page not found
  app.use((req, res) => {
    res.status(404);
    if (isHTML && req.accepts('html')) return res.render('404', req.defaultVars);
    return res.send({ error: 'Not found' });
  });

  if (logger.gcloudErrorsMiddleWare) {
    app.use(logger.gcloudErrorsMiddleWare);
  }

  // Log Error
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) {
      logger.outputError(`${err.message} (${err.stack.replace(/\n/g, ', ')})`);
      if (logger.gcloudErrorsMiddleWare) {
        return logger.gcloudErrorsMiddleWare(err, req, res, next);
      }
    }
    return next(err);
  });

  // Output Error page
  app.use((err, req, res, next) => { // eslint-disable-line
    const status = err.status || 500;
    res.status(status);
    if (process.env.NODE_ENV === 'production') {
      if (isHTML && req.accepts('html')) return res.render('500', req.defaultVars);
      const message = (status >= 500) ? 'Internal server error' : err.message;
      return res.send({ error: message });
    }
    res.send({
      error: err.message,
      status,
      trace: err,
      stack: err.stack,
    });
  });
}

module.exports = {
  addStandard,
  addCompression,
  addLogs,
  addErrorHandlers,
};
