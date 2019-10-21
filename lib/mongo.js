'use strict';

const { MongoClient } = require('mongodb');

let mongoClient;
const errorMongo = new Error('Not connected to Mongo');

const start = (url) => {
  mongoClient = new MongoClient(url);
  return mongoClient.connect();
};

const db = (dbName) => {
  if (!mongoClient) reject(errorMongo);
  return mongoClient.db(dbName);
};

const close = () => {
  if (!mongoClient) reject(errorMongo);
  return mongoClient.close();
};


module.exports = {
  start,
  close,
  db,
};
