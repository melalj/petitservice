'use strict';

const { MongoClient } = require('mongodb');

let mongoClient;
const errorMongo = new Error('Not connected to Mongo');

const start = (url) => {
  mongoClient = new MongoClient(url, { useUnifiedTopology: true });
  return mongoClient.connect();
};

const db = (dbName) => {
  if (!mongoClient) return Promise.reject(errorMongo);
  return mongoClient.db(dbName);
};

const close = () => {
  if (!mongoClient) return Promise.resolve();
  return mongoClient.close();
};


module.exports = {
  start,
  close,
  db,
};
