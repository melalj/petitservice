const deepmerge = require('deepmerge');
const { createClient } = require('redis');
const { URL } = require('url');
const logger = require('./logger');

function isValidUrl(string) {
  try {
    // eslint-disable-next-line no-new
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}

let redisCache;
const delayedExecTimeout = {};

const start = async (
  {
    url = process.env.REDIS_URL,
    db = process.env.REDIS_DB,
    errorHandler = () => {},
    extendOptions = {},
  },
) => {
  // Redis options
  const parsedURL = isValidUrl(url) ? new URL(url) : {};
  const redisClientOptions = deepmerge(
    {
      url,
      db: db || (parsedURL.pathname || '/0').slice(1) || '0',
      socket: {
        tls: parsedURL.protocol === 'rediss',
        reconnectStrategy: (retries) => {
          if (retries >= 10) return false;
          return retries * 500 + 100;
        },
      },
    },
    extendOptions,
  );

  redisCache = await createClient(redisClientOptions)
    .on('error', errorHandler)
    .connect();
};

const getValue = (key) => redisCache.get(key);

const setValue = (key, value, ttl) => redisCache.set(key, value, (ttl ? { EX: ttl } : {}));

const delValue = (key) => redisCache.del(key);

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
