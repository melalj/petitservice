
const dbLoader = require('..');
const config = require('../config');
const utils = require('../utils');

function migrate(databaseRaw) {
  const database = databaseRaw || process.env.DB_NAME;
  if (!database) utils.throwError('Missing database input');

  dbLoader.init(config.pgUrl, database);
  const db = dbLoader.getKnexObject();

  return utils.checkIfDatabaseExists(db, database)
    .then((exists) => {
      if (!exists) utils.throwError(`${database} doesn't exists`);
      return db.migrate.latest()
        .then(() => {
          utils.info(`${database} successfully migrated!`);
          return db.destroy();
        });
    })
    .catch((e) => {
      utils.throwError(`Error while migrating ${database}: ${e.message}`);
    });
}

module.exports = migrate;
