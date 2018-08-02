'use strict';

/* eslint global-require: 0 */
/* eslint no-console: 0 */

const path = require('path');
const fs = require('fs');

let rootDir;
let keyFilename;
let pkg;

const projectId = process.env.GCLOUD_PROJECT;

const agents = {};

function cleanEnvVar(val) {
  const cleanVal = String(val).replace(/"/g, '');
  if (cleanVal === 'true') return true;
  if (cleanVal === 'false') return false;
  if (cleanVal === '1') return true;
  if (cleanVal === '0') return false;
  return false;
}

function init(rootDirRaw, optionsRaw) {
  rootDir = rootDirRaw;
  const options = optionsRaw || {};
  // rootDir
  if (!rootDir) throw new Error('Missing rootDir');

  if (!process.env.GCLOUD_STACKDRIVER_CREDENTIALS) throw new Error('Missing env variable: GCLOUD_STACKDRIVER_CREDENTIALS');
  const credentialsJson = Buffer.from(process.env.GCLOUD_STACKDRIVER_CREDENTIALS, 'base64').toString();
  // save keyfile
  keyFilename = path.join(__dirname, 'gcloud-key.json');
  fs.writeFileSync(keyFilename, credentialsJson, 'utf8');
  if (!process.env.GCLOUD_PROJECT) throw new Error('Missing env variable: GCLOUD_PROJECT');

  // package.json
  if (!fs.existsSync(rootDir)) throw new Error('Invalid root dir');
  const packageJSONPath = path.resolve(rootDir, './package.json');
  if (!fs.existsSync(packageJSONPath)) throw new Error('package.json not found');
  pkg = require(packageJSONPath); // eslint-disable-line

  if (cleanEnvVar(process.env.ENABLE_GCLOUD_TRACE)) {
    agents.trace = initTrace(options.trace);
  }
  if (cleanEnvVar(process.env.ENABLE_GCLOUD_DEBUG)) {
    agents.debug = initDebug(options.debug);
  }
  if (cleanEnvVar(process.env.ENABLE_GCLOUD_ERROR)) {
    agents.error = initError(options.error);
  }
}

function initTrace(optionsOverrideRaw) {
  const optionsOverride = optionsOverrideRaw || {};
  try {
    const options = Object.assign({
      keyFilename,
      projectId,
      ignoreUrls: [/\/~*health/, /favicon.ico/, /robots\.txt/],
      serviceContext: {
        service: pkg.name,
        version: pkg.version,
      },
    }, optionsOverride);
    return require('@google-cloud/trace-agent').start(options);
  } catch (e) {
    console.error(`Error while loading gcloud/trace agent: ${e.message}`);
    return {};
  }
}

function initDebug(optionsOverrideRaw) {
  const optionsOverride = optionsOverrideRaw || {};
  try {
    const options = Object.assign({
      keyFilename,
      projectId,
      workingDirectory: rootDir,
      description: pkg.description,
      allowExpressions: true,
      serviceContext: {
        service: pkg.name,
        version: pkg.version,
      },
      capture: { maxFrames: 20, maxProperties: 100 },
    }, optionsOverride);
    return require('@google-cloud/debug-agent').start(options);
  } catch (e) {
    console.error(`Error while loading gcloud/debug agent: ${e.message}`);
    return {};
  }
}

function initError(optionsOverrideRaw) {
  const optionsOverride = optionsOverrideRaw || {};
  try {
    const options = Object.assign({
      keyFilename,
      projectId,
      serviceContext: {
        service: pkg.name,
        version: pkg.version,
      },
    }, optionsOverride);
    const { ErrorReporting } = require('@google-cloud/error-reporting');
    return new ErrorReporting(options);
  } catch (e) {
    console.error(`Error while loading gcloud/error agent: ${e.message}`);
    return {};
  }
}

function expressMiddleWare() {
  if (agents.error) return agents.error.express;
  return null;
}

function reportError(e) {
  if (agents.error) agents.error.report(e);
}

function startSpan(spanName, opts) {
  if (agents.trace) {
    return agents.trace.startSpan(spanName, opts || {});
  }
  return null;
}

function endSpan(span) {
  if (agents.trace) agents.trace.endSpan(span);
}

function runInRootSpan(spanName, opts, cb) {
  const options = opts || {};
  if (agents.trace) {
    agents.trace.runInRootSpan(spanName, options, cb);
  } else {
    cb(() => null);
  }
}

function runInSpan(spanName, opts, cb) {
  const options = opts || {};
  if (agents.trace) {
    agents.trace.runInSpan(spanName, options, cb);
  } else {
    cb(() => null);
  }
}

module.exports = {
  init,
  reportError,
  expressMiddleWare,
  startSpan,
  endSpan,
  runInSpan,
  runInRootSpan,
};
