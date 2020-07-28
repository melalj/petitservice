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

const getValue = (key) => new Promise((resolve, reject) => {
  if (!redisCache) return reject(errorRedis);
  return redisCache.get(key, (err, value) => {
    if (err) return reject(err);
    return resolve(value);
  });
});

const setValue = (key, value, ttl) => new Promise((resolve, reject) => {
  if (!redisCache) return reject(errorRedis);
  return redisCache.set(key, value, { ttl }, (err) => {
    if (err) return reject(err);
    return resolve(value);
  });
});

const delValue = (key) => new Promise((resolve, reject) => {
  if (!redisCache) return reject(errorRedis);
  return redisCache.del(key, (err) => {
    if (err) return reject(err);
    return resolve();
  });
});

const wrap = (key, fallbackPromise, ttl, isJSON) => {
  const prm = () => fallbackPromise().then((value) => {
    const saveValue = isJSON ? JSON.stringify(value) : value;
    return setValue(key, saveValue, ttl).then(() => value);
  });
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
      delayedExecTimeout[delayedKey] = setTimeout(() => (
        getValue(delayedKey).then((existingTime) => {
          if (existingTime && (Date.now() - existingTime) > delayTime * 1000) {
            return delValue(delayedKey).then(prm);
          }
          logger.debug(`DISCARDED: ${identifier}`);
          return null;
        })
      ), delayTime * 1000);
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
