
const dbLoader = require('..');
const config = require('../config');
const utils = require('../utils');

function createdb(databaseRaw) {
  const database = databaseRaw || process.env.DB_NAME;
  if (!database) utils.throwError('Missing database input');

  dbLoader.init(config.pgUrl, 'postgres');
  const db = dbLoader.getKnexObject();

  return utils.checkIfDatabaseExists(db, database)
    .then((exists) => {
      if (exists) utils.throwError(`${database} already exists`);
      return db.raw(`CREATE DATABASE ${database};`)
        .then(() => {
          utils.info(`${database} successfully created!`);
          return db.destroy();
        });
    })
    .catch((e) => {
      utils.throwError(`Error while creating ${database}: ${e.message}`);
    });
}

module.exports = createdb;
