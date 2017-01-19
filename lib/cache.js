'use strict';

const cacheManager = require('cache-manager');
const redisStore = require('cache-manager-redis');

const logger = require('./logger');

let redisCache;
const delayedExecTimeout = {};
const errorRedis = new Error('Not connected to Redis');

const start = (url) => {
  redisCache = cacheManager.caching({
    store: redisStore,
    url,
  });
};

const getValue = (key) => {
  return new Promise((resolve, reject) => {
    if (!redisCache) reject(errorRedis);
    redisCache.get(key, (err, value) => {
      if (err) reject(err);
      resolve(value);
    });
  });
};

const setValue = (key, value, ttl) => {
  return new Promise((resolve, reject) => {
    if (!redisCache) reject(errorRedis);
    redisCache.set(key, value, { ttl }, (err) => {
      if (err) reject(err);
      resolve();
    });
  });
};

const delValue = (key) => {
  return new Promise((resolve, reject) => {
    if (!redisCache) reject(errorRedis);
    redisCache.del(key, (err) => {
      if (err) reject(err);
      resolve();
    });
  });
};

const wrap = (key, fallbackPromise, ttl, isJSON) => {
  const prm = () => {
    return fallbackPromise().then((value) => {
      const saveValue = isJSON ? JSON.stringify(value) : value;
      return setValue(key, saveValue, ttl).then(() => {
        return value;
      });
    });
  };
  return getValue(key).then((cachedValue) => {
    if (!cachedValue) return prm();
    if (isJSON) return JSON.parse(cachedValue);
    return cachedValue;
  })
  .catch(() => prm());
};

const delayedExec = (identifier, prm, delayTime) => {
  logger.debug(`REQUEST: ${identifier}`);
  const delayedKey = `delayedExec-${identifier}`;
  return setValue(delayedKey, Date.now(), delayTime + 10)
  .then(() => {
    clearTimeout(delayedExecTimeout[delayedKey]);
    delayedExecTimeout[delayedKey] = setTimeout(() => {
      return getValue(delayedKey).then((existingTime) => {
        if (existingTime && (Date.now() - existingTime) > delayTime * 1000) {
          return delValue(delayedKey).then(prm);
        }
        logger.debug(`DISCARDED: ${identifier}`);
        return null;
      });
    }, delayTime * 1000);
  });
};

module.exports = {
  start,
  getValue,
  setValue,
  delValue,
  wrap,
  delayedExec,
};
