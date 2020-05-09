
const createdb = require('./createdb');
const dropdb = require('./dropdb');
const migrate = require('./migrate');
const seed = require('./seed');

function runTask(action, database) {
  if (action === 'migrate') {
    return migrate(database);
  }

  if (action === 'createdb') {
    return createdb(database);
  }

  if (action === 'dropdb') {
    return dropdb(database);
  }

  if (action === 'seed') {
    return seed(database);
  }

  if (action === 'init') {
    return createdb(database)
      .then(() => migrate(database))
      .then(() => seed(database));
  }

  if (action === 'refresh') {
    return dropdb(database)
      .then(() => createdb(database))
      .then(() => migrate(database))
      .then(() => seed(database));
  }

  return Promise.reject(new Error(`${action} is not an action`));
}

function run(action, database) {
  if (!database) {
    process.stderr.write('database or environement not valid \n');
    process.exit(1);
  }

  return runTask(action, database)
    .then(() => {
      process.stdout.write('Done!\n');
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    });
}

module.exports = {
  run,
  createdb,
  dropdb,
  migrate,
  seed,
};
