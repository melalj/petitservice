const Promise = require('bluebird');
const net = require('net');
const url = require('url');

const logger = require('./logger');
const utils = require('./utils');
const cacheStore = require('./cache');
const mongo = require('./mongo');
const amq = require('./amq');

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
  const pingReadiness = 10000;

  let countCustom = 1;
  let waitingForExit = false;
  let pingFailureCount = 0;
  let pingFailureMax = 8;
  let pingFrequency = 30000;
  let pingFailing;
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
        logger.error(`${e.message} ${e.stack}`);
      });

    setTimeout(() => {
      logger.info('Exit timeout: Forcing it!');
      exitProcess('FORCE');
      waitingForExit = true;
    }, 10000);
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

  chain.cache = (redisOpts) => {
    promises.cache = () => cacheStore.start(redisOpts);
    promiseOrder.push('cache');
    return chain;
  };

  chain.mongo = (mongoOpts) => {
    promises.mongo = () => mongo.start(mongoOpts);
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
    const port = portRaw || process.env.PORT || 80;
    const host = process.env.HOST || '0.0.0.0';
    promises.express = () => new Promise((resolve, reject) => {
      httpServer = expressApp().listen(port, host, (err) => {
        if (err) return reject(err);
        return resolve(true);
      });
    });
    promiseOrder.push('express');
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
        logger.error(`${e.message} ${e.stack}`);
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
          } else {
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
