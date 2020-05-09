
const dbLoader = require('..');
const config = require('../config');
const utils = require('../utils');

function seed(databaseRaw) {
  const database = databaseRaw || process.env.DB_NAME;
  if (!database) utils.throwError('Missing database input');

  dbLoader.init(config.pgUrl, database);
  const db = dbLoader.getKnexObject();

  return utils.checkIfDatabaseExists(db, database)
    .then((exists) => {
      if (!exists) utils.throwError(`${database} doesn't exists`);
      return db.seed.run()
        .then(() => {
          utils.info(`${database} successfully seeded!`);
          return db.destroy();
        });
    })
    .catch((e) => {
      utils.info(`Skipped seeding ${database}: ${e.message}`);
      return Promise.resolve(true);
    });
}

module.exports = seed;
