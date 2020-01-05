'use strict';

const knex = require('knex');

const config = require('./config');

const pgUrl = config.pgUrl;
const pgDatabase = config.pgDatabase;
const pgConfig = config.pgConfig;
pgConfig.connection = `${pgUrl}/${pgDatabase}`;

function init() {
  if (!process.env.PG_URL) {
    throw new Error('Missing PG_URL');
  }
  if (!process.env.DB_NAME) {
    throw new Error('Missing DB_NAME');
  }
  return knex(pgConfig).raw('SELECT 1');
}

function getKnexObject() {
  return knex(pgConfig);
}

module.exports = {
  init,
  getKnexObject,
};
