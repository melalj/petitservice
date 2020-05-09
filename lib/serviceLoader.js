const Promise = require('bluebird');
const net = require('net');
const url = require('url');

const logger = require('./logger');
const utils = require('./utils');
const cacheStore = require('./cache');
const mongo = require('./mongo');
const amq = require('./amq');
const dbLoader = require('./db');
const dbConfig = require('./db/config');

const timeouts = {};

function exitProcess(signal) {
  logger.info(`Process killed from signal: ${signal}`);
  const exitCode = (/^SIG/.exec(signal)) ? 0 : 1;
  process.nextTick(() => process.exit(exitCode));
}

function testHost(addr) {
  const splitHost = addr.split(':');
  const host = splitHost[0];
  const port = splitHost[1] || 80;
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(Number(port), host, () => {
      socket.end();
      resolve(addr);
    });
    socket.setTimeout(3000, () => {
      socket.end();
      reject(new Error(addr));
    });
    socket.on('error', () => {
      socket.end();
      reject(new Error(addr));
    });
  });
}

function serviceLoader() {
  const chain = {};

  const promiseOrder = [];
  const promises = {};
  const dbReadiness = 10000;
  const pingReadiness = 10000;

  let countCustom = 1;
  let waitingForExit = false;
  let dbFailureCount = 0;
  let dbFailureMax = 8;
  let dbFrequency = 20000;
  let dbFailing;
  let pingFailureCount = 0;
  let pingFailureMax = 8;
  let pingFrequency = 30000;
  let pingFailing;
  let knexObject;
  let httpServer;
  let onExitPromise;

  const closeGracefully = (signal) => {
    if (waitingForExit) return;
    logger.info(`Gracefully shutting down from ${signal}...`);

    if (Object.keys(timeouts).length) logger.info('> All timeouts cleared');
    Object.keys(timeouts).forEach((k) => {
      clearTimeout(timeouts[k]);
    });

    const actions = [];

    if (knexObject) {
      const prm = knexObject.destroy()
        .then(() => logger.info('> Database Closed'));
      actions.push(prm);
    }

    if (amq) {
      const prm = amq.close()
        .then(() => logger.info('> AMQ Closed'));
      actions.push(prm);
    }

    if (mongo) {
      const prm = mongo.close()
        .then(() => logger.info('> Mongo Closed'));
      actions.push(prm);
    }

    if (httpServer) {
      const prm = new Promise((resolve, reject) => {
        httpServer.close((err) => {
          if (err) return reject(err);
          return resolve(true);
        });
      })
        .then(() => logger.info('> HTTP Server Closed'));
      actions.push(prm);
    }

    if (onExitPromise) {
      actions.push(Promise.resolve().then(() => onExitPromise()));
    }

    Promise.all(actions)
      .then(() => {
        logger.info('> Everything is closed');
        exitProcess(signal);
        waitingForExit = true;
      })
      .catch((e) => {
        logger.error(e);
      });


    setTimeout(() => {
      logger.info('Exit timeout: Forcing it!');
      exitProcess('FORCE');
      waitingForExit = true;
    }, 10000);
  };

  const checkDb = () => {
    if (!knexObject) throw new Error('knexObject not defined');
    logger.debug('Check database');
    return knexObject.raw('SELECT 1')
      .then(() => {
        dbFailureCount = 0;
        if (dbFailing) {
          logger.info('Recovered db!');
          dbFailing = null;
        }
        timeouts.checkDb = setTimeout(checkDb, dbFrequency);
        return true;
      })
      .catch((err) => {
        if (dbFailureCount < dbFailureMax) {
          dbFailureCount += 1;
          dbFailing = true;
          const waitCount = 2000 * dbFailureCount;
          logger.warn(`Error connecting to database - ${dbFailureCount} attempts - retying in ${waitCount / 1000}s...`);
          return Promise.delay(waitCount).then(() => checkDb());
        }
        logger.error(new Error(`Error connecting to database: ${err.message}`));
        closeGracefully('NODB');
        waitingForExit = true;
        return null;
      });
  };

  const pingHosts = (hostList) => {
    logger.debug(`Ping hosts: ${hostList.join(', ')}`);
    return Promise.all(hostList.map(testHost))
      .then(() => {
        pingFailureCount = 0;
        if (pingFailing) {
          logger.info(`Recovered ping ${pingFailing}!`);
          pingFailing = null;
        }
        timeouts.pingHosts = setTimeout(() => pingHosts(hostList), pingFrequency);
        return true;
      })
      .catch((err) => {
        if (pingFailureCount < pingFailureMax) {
          pingFailureCount += 1;
          pingFailing = err.message;
          const waitCount = 2000 * pingFailureCount;
          logger.warn(`Unable to ping ${err.message} - ${pingFailureCount} attempts - retying in ${waitCount / 1000}s...`);
          return Promise.delay(waitCount).then(() => pingHosts(hostList));
        }
        logger.error(new Error(`Error connecting to ${err.message}`));
        closeGracefully('NOHOST');
        waitingForExit = true;
        return null;
      });
  };

  chain.ping = (urlList, options) => {
    if (!urlList || !Array.isArray(urlList)) throw new Error('Missing urlList for ping');
    if (options && options.failureMax) pingFailureMax = options.failureMax;
    if (options && options.frequency) pingFrequency = options.frequency;
    const hostList = utils.uniqueValues(urlList.filter((d) => (d)).map((u) => url.parse(u).host));
    timeouts.initialPingHosts = setTimeout(() => (
      pingHosts(utils.uniqueValues(hostList))
    ), pingReadiness);
    return chain;
  };

  chain.cache = (redisUrl) => {
    if (!redisUrl) throw new Error('Missing redisUrl for cache');
    promises.cache = () => new Promise((resolve, reject) => {
      try {
        cacheStore.start(redisUrl);
        resolve(true);
      } catch (e) {
        reject(e);
      }
    });
    promiseOrder.push('cache');
    return chain;
  };

  chain.mongo = (mongoUrl) => {
    if (!mongoUrl) throw new Error('Missing mongoUrl for mongo');
    promises.mongo = () => mongo.start(mongoUrl);
    promiseOrder.push('mongo');
    return chain;
  };

  chain.amq = (options) => {
    promises.amq = () => amq.start(options);
    promiseOrder.push('amq');
    return chain;
  };

  chain.express = (expressApp, portRaw) => {
    if (!expressApp) throw new Error('Missing expressApp for express');
    const port = portRaw || 80;
    promises.express = () => new Promise((resolve, reject) => {
      httpServer = expressApp().listen(port, (err) => {
        if (err) return reject(err);
        return resolve(true);
      });
    });
    promiseOrder.push('express');
    return chain;
  };

  chain.db = (options) => {
    const pgUrl = (options && options.pgUrl) ? options.pgUrl : dbConfig.pgUrl;
    const pgDatabase = (options && options.pgDatabase) ? options.pgDatabase : dbConfig.pgDatabase;
    if (options && options.failureMax) dbFailureMax = options.failureMax;
    if (options && options.frequency) dbFrequency = options.frequency;
    logger.debug('load db');
    dbLoader.init(pgUrl, pgDatabase);
    knexObject = dbLoader.getKnexObject();
    timeouts.initialCheckDb = setTimeout(() => checkDb(), dbReadiness);
    return chain;
  };

  chain.then = (prm) => {
    const promiseName = `custom${countCustom}`;
    promises[promiseName] = () => Promise.resolve().then(() => prm());
    promiseOrder.push(promiseName);
    countCustom += 1;
    return chain;
  };

  chain.onExit = (prm) => {
    onExitPromise = prm;
    return chain;
  };

  chain.done = (cb) => {
    logger.info(`Starting services: ${promiseOrder.join(', ')}`);
    return utils.seqPromise(promiseOrder, (promiseName) => {
      logger.info(`Starting ${promiseName}...`);
      const serviceTime = Date.now();
      const prm = (promises[promiseName]) ? promises[promiseName]() : Promise.resolve();
      return prm.then(() => {
        logger.info(`${promiseName} started in ${Date.now() - serviceTime}ms!`);
      });
    })
      .then(() => {
        logger.info('Ready to rock! 🚀');
        if (cb) return cb();
        return null;
      })
      .catch((e) => {
        logger.error(e);
        exitProcess('START');
        waitingForExit = true;
      });
  };

  ['SIGINT', 'SIGTERM', 'SIGQUIT', 'uncaughtException', 'unhandledRejection']
    .forEach((signal) => {
      process.on(signal, (reason, p) => {
        if (reason) {
          if (signal === 'unhandledRejection') {
            logger.error(`unhandledRejection: Promise ${p}, reason: ${reason}`);
          } else if (signal === 'uncaughtException') {
            logger.error(`uncaughtException: ${reason.message} | stack: ${reason.stack}`);
          } else if (signal === 'uncaughtException') {
            logger.error(`${signal}: ${reason}`);
          }
        }
        closeGracefully(signal);
        waitingForExit = true;
      });
    });

  return chain;
}

module.exports = serviceLoader;
