function exitProcess(code) {
  process.nextTick(() => process.exit(code));
}

function throwError(msg) {
  process.stderr.write(`${msg}\n`);
  exitProcess(1);
}

function info(msg) {
  process.stdout.write(`${msg}\n`);
}

function checkIfDatabaseExists(db, datname) {
  return db('pg_database').count('*')
    .where({ datname })
    .then((rows) => (Number(rows[0].count) > 0));
}

module.exports = {
  info,
  throwError,
  exitProcess,
  checkIfDatabaseExists,
};
