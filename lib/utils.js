/* eslint-disable prefer-rest-params */
/* eslint-disable no-loop-func */
const Promise = require('bluebird');

function toNumber(str) {
  if (!str || str === '') return null;
  return Number(str.toString().replace(/[^0-9.]+|\s+/gmi, ''));
}

function toInt(str) {
  if (!str || str === '') return null;
  return parseInt(toNumber(str), 10);
}

function sortObject(object) {
  if (!object) {
    return object;
  }

  const isArray = object instanceof Array;
  let sortedObj = {};
  if (isArray) {
    sortedObj = object.map((item) => sortObject(item));
  } else {
    const keys = Object.keys(object);
    // console.log(keys);
    keys.sort((key1, key2) => {
      const a = key1.toLowerCase();
      const b = key2.toLowerCase();
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    });

    keys.forEach((key) => {
      if (typeof object[key] === 'object') {
        sortedObj[key] = sortObject(object[key]);
      } else {
        sortedObj[key] = object[key];
      }
    });
  }

  return sortedObj;
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
  if (Array.isArray(obj)) {
    return obj.map(eliminateNullKey);
  }

  if (obj.constructor === Object) {
    const ret = {};
    Object.keys(obj).forEach((key) => {
      if (obj[key] !== null && obj[key] !== undefined) {
        ret[key] = eliminateNullKey(obj[key]);
      }
    });
    return ret;
  }

  return obj;
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
  sortObject,
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
  getPaginatedQuery,
};
