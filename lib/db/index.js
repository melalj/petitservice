'use strict';

const knex = require('knex');

const config = require('./config');

let knexObject;

function init(pgUrlRaw, pgDatabaseRaw) {
  const pgUrl = pgUrlRaw || config.pgUrl;
  const pgDatabase = pgDatabaseRaw || config.pgDatabase;
  const pgConfig = config.pgConfig;
  pgConfig.connection = `${pgUrl}/${pgDatabase}`;
  knexObject = knex(pgConfig);
}

function getKnexObject() {
  if (!knexObject) init();
  return knexObject;
}

module.exports = {
  init,
  getKnexObject,
};
