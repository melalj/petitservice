const { MongoClient } = require('mongodb');

let mongoClient;
const errorMongo = new Error('Not connected to Mongo');

const start = (
  {
    url = process.env.MONGO_URL,
    host = process.env.MONGO_HOST || 'mongo',
    port = Number(process.env.MONGO_PORT || 27017),
    username = process.env.MONGO_USERNAME || 'mongo',
    password = process.env.MONGO_PASSWORD || 'mongo',
    authDb = process.env.MONGO_AUTH_DB || 'admin',
    compressors = null,
    extendMongoClientOptions = {},
  },
) => {
  const mongoClientOptions = {};

  if (compressors) {
    mongoClientOptions.compressors = compressors;
  }

  const mongoUrl = url || `mongodb://${username}:${password}@${host}:${port}/${authDb || ''}`;

  mongoClient = new MongoClient(
    mongoUrl,
    { ...mongoClientOptions, ...extendMongoClientOptions },
  );
  return mongoClient.connect();
};

const db = (dbName = process.env.MONGO_DB || process.env.MONGO_DBNAME || process.env.MONGO_DATABASE || 'test') => {
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
