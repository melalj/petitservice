/* eslint-disable prefer-rest-params */
/* eslint-disable no-loop-func */
const Promise = require('bluebird');
const request = require('request');

const logger = require('./logger');

function toNumber(str) {
  if (!str || str === '') return null;
  return Number(str.toString().replace(/[^0-9.]+|\s+/gmi, ''));
}

function toInt(str) {
  if (!str || str === '') return null;
  return parseInt(toNumber(str), 10);
}

function ucwords(str) {
  return String(str).replace(/^([a-z])|\s+([a-z])/g, ($1) => $1.toUpperCase());
}

function testUUID(uuidList) {
  if (!Array.isArray(uuidList)) return false;
  const r = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return uuidList.every((uuid) => r.test(uuid));
}

function uniqueValues(arr) {
  if (!arr) return arr;
  const a = [];
  for (let i = 0, l = arr.length; i < l; i += 1) {
    if (a.indexOf(arr[i]) === -1 && arr[i] !== '') {
      a.push(arr[i]);
    }
  }
  return a;
}

function roundDecimal(val) {
  return Math.round(Number(val) * 100) / 100;
}

function validate(validationErrors) {
  if (validationErrors) {
    const error = {
      message: validationErrors[0].msg,
      validation: validationErrors,
      status: 400,
    };
    throw error;
  }
}

function getParams(input, possibleParams) {
  const output = {};
  possibleParams.forEach((k) => {
    if (input[k] !== null && input[k] !== undefined) output[k] = input[k];
  });
  return output;
}

function eliminateNullKey(obj) {
  const ret = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== null && obj[key] !== undefined) {
      ret[key] = (obj[key].constructor === Object) ? eliminateNullKey(obj[key]) : obj[key];
    }
  });
  return ret;
}

function throwError(message, errorCode, state) {
  const err = new Error(message);
  err.status = errorCode;
  if (state) {
    err.state = state;
  }
  throw err;
}

function uniqueValuesByKey(arr, key) {
  const output = [];
  const keyList = [];
  for (let i = 0, l = arr.length; i < l; i += 1) {
    if (keyList.indexOf(arr[i][key]) === -1 && arr[i][key] !== '') {
      keyList.push(arr[i][key]);
      output.push(arr[i]);
    }
  }
  return output;
}

function extendRecursive() {
  const dst = {};
  let src;
  const args = [].splice.call(arguments, 0);
  const toString = ({}).toString;

  while (args.length > 0) {
    src = args.splice(0, 1)[0];
    if (toString.call(src) === '[object Object]') {
      Object.keys(src).forEach((p) => {
        if (toString.call(src[p]) === '[object Object]') {
          dst[p] = extendRecursive(dst[p] || {}, src[p]);
        } else {
          dst[p] = src[p];
        }
      });
    }
  }
  return dst;
}

function seqPromise(arr, fn) {
  let current = Promise.cast();
  return Promise.map(arr, (d) => {
    current = current.then(() => fn(d));
    return current;
  });
}

function requestPromise(options, context) {
  return new Promise((resolve, reject) => {
    request(options, (err, res) => {
      if (err) return reject(err);
      if (res.statusCode >= 500) {
        logger.warn(`Request internal error [${res.statusCode}]: ${context} ${options.method} ${options.uri}`);
      }
      return resolve(res.body);
    });
  })
    .catch((e) => {
      logger.warn(`Request exception [${e.code}]: ${context} ${options.method} ${options.uri}: ${e.message}`);
      throw e;
    });
}

function requestAbstraction(context, args, uri, methodRaw, body) {
  const method = methodRaw || 'GET';
  const options = {
    method,
    json: true,
    timeout: process.env.REQUEST_TIMEOUT || 5000,
    headers: {
      'X-Private-Api-Key': process.env.PRIVATE_API_KEY || '',
    },
    uri,
  };

  if (body) options.body = body;
  return requestPromise(options, context);
}

function requestPages(endpoint, rowsPerPage = 500, currentPage = 1, allRows = []) {
  const endpointWithPage = `${endpoint}?currentPage=${currentPage}&rowsPerPage=${rowsPerPage}`;
  return requestAbstraction('requestPages', [], endpointWithPage)
    .then((res) => {
      const newAllRows = allRows.concat(res);
      if (res.length < rowsPerPage) return newAllRows;
      return requestPages(endpoint, rowsPerPage, (currentPage + 1), newAllRows);
    });
}

function getPaginatedQuery(req, query) {
  let fullQuery = query;
  const usePagination = req.query.currentPage && req.query.rowsPerPage;
  if (usePagination) {
    const currentPage = Number(req.query.currentPage);
    const rowsPerPage = Number(req.query.rowsPerPage);
    const limit = rowsPerPage;
    const offset = (currentPage - 1) * rowsPerPage;
    fullQuery = fullQuery.limit(limit).offset(offset);
  }
  return fullQuery;
}

function validatePrivateApiKey(req) {
  if (!process.env.PRIVATE_API_KEY
    || process.env.PRIVATE_API_KEY !== req.get('X-Private-Api-Key')) {
    throwError('Unauthorized', 403);
  }
}

module.exports = {
  toNumber,
  toInt,
  ucwords,
  validate,
  testUUID,
  getParams,
  eliminateNullKey,
  throwError,
  uniqueValuesByKey,
  uniqueValues,
  validatePrivateApiKey,
  extendRecursive,
  roundDecimal,
  seqPromise,
  requestAbstraction,
  requestPromise,
  requestPages,
  getPaginatedQuery,
};
