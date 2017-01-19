'use strict';

const dbLoader = require('../');
const config = require('../config');
const utils = require('../utils');

function dropdb(databaseRaw) {
  const database = databaseRaw || process.env.DB_NAME;
  if (!database) utils.throwError('Missing database input');

  dbLoader.init(config.pgUrl, 'postgres');
  const db = dbLoader.getKnexObject();

  return utils.checkIfDatabaseExists(db, database)
  .then((exists) => {
    if (!exists) utils.throwError(`${database} doesn't exists`);
    return db.raw(
      `UPDATE pg_database SET datallowconn = 'false' WHERE datname = '${database}';
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}';
    `)
    .then(() => {
      utils.info(`Stopped ${database} processes`);
      return db.raw(`DROP DATABASE IF EXISTS ${database};`);
    })
    .then(() => {
      utils.info(`${database} successfully dropped!`);
      return db.destroy();
    });
  })
  .catch((e) => {
    utils.throwError(`Error while dropping ${database}: ${e.message}`);
  });
}

module.exports = dropdb;
