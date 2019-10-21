# Petit Service 🍬

[![Twitter URL](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://github.com/melalj/petitservice)
[![GitHub stars](https://img.shields.io/github/stars/melalj/petitservice.svg?style=social&label=Star&maxAge=2592003)]()

[![npm](https://img.shields.io/npm/dt/petitservice.svg)]() [![npm](https://img.shields.io/npm/v/petitservice.svg)]() [![npm](https://img.shields.io/npm/l/petitservice.svg)]() [![David](https://img.shields.io/david/melalj/petitservice.svg)]()

Set of helpers designed for a Microservice architecture.

Available helpers:
- [Service Loader](#serviceLoader)
- [AMQ publisher/consumer](#amq)
- [Redis cache](#cache)
- [MongoDb client](#mongo)
- [Express common middlewares](#expressMiddleware)
- [Google Cloud Monitoring (Trace, Debug, Errors)](#gcloud)
- [Logger](#logger)
- [Database helpers](#dbHelpers)
- [Database tasks](#dbTasks)

## <a name="serviceLoader"></a> Service Loader

Start different services (sequentially) with graceful exit handler.

Supported features:
- Check if TCP hosts are reachable
- Start Redis cache manager
- Start MongoDB client
- Start AMQ publisher/consumer
- Start postgres database connection using [knex](http://knexjs.org/) (check if it's alive every 30 sec)
- Start HTTP server (express or http)
- Gracefully exit all services on exceptions


#### Full Example:

```js
const serviceLoader = require('petitservice/lib/serviceLoader');
const logger = require('petitservice/lib/logger');

const config = require('./config');

return serviceLoader()
.ping([
  config.apiUrl,
  config.redisUrl,
  config.amqpUrl,
  config.mongoUrl,
])
.cache(config.redisUrl)
.mongo(config.mongoUrl)
.amq({
  amqUrl: 'amqp://guest:guest@localhost:5672',
  consumerQueue: 'my-consumer-queue',
  assertQueues: ['my-publisher-queue'],
  consumer: (data, ack) => {
    logger.info(data);
    ack(); // acknowledge the message
  },
})
.then(() => {
  logger.info('Do something during starting...');
})
.db({
  pgUrl: config.pgUrl,
  pgDatabase: config.pgDatabase,
})
.express(() => require('./express_app.js'), config.httpPort)
.onExit(() => {
  logger.info('Do something during exit...');
})
.done(() => {
  logger.info('Everything is started!');
});
```

#### Available functions chains:

- *ping(urlList, [options])*: Check if hostnames are alive
  - `urlList` (array of url to ping) format: `protocol://[user:pass@]hostname:port`
  - `options.failureMax` (optional integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (optional integer, how many milliseconds should wait before checking again hostnames, default: 30000)
- *db([options])*: Initiate database, checks if database is alive and destroy knex on exit
  - `options.pgUrl` (optional string, postgres url, default: set in `./lib/db/config.js`)
  - `options.pgDatabase` (optional string, database to query, default: postgres)
  - `options.failureMax` (optional integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (optional integer, how many milliseconds should wait before checking again the database, default: 30000)
- *cache(redisUrl)*: Start cache for `petitservice/lib/cache`
  - `redisUrl` (required string, redis url)
- *mongo(mongoUrl)*: Start mongoDb for `petitservice/lib/mongo`
  - `mongoUrl` (required string, mongo url)
- *amq(options)*: Connect to RabbitMQ using [amqp.node](https://github.com/squaremo/amqp.node), and close it when the program exit. `options` is required.
  - `options.amqUrl` (required string, amq url)
  - `options.assertQueues` (optional array, list of queue to create if they haven't been created before. if consumerQueue is set, it will be asserted as well automatically.
  - `options.consumerCb(data, ack)` (required function): handles a message to consume. It gets as parameter respectively the received `data` (already JSON parsed) and `ack` function to run when we want to acknowledge the message.
  - `options.consumerQueue` (required string): consumer queue name
  - `options.consumerPrefetch` (optional integer): how many message we consume simultaneously - default: 1
  - `options.onError(err, msg)` (optional function): error handler when there's an exception on the consumer. Gets as parameter `err` as error object and `msg` as raw message. Defaults a warning message.
- *express(expressApp, port)*: Start express HTTP server, and close it when exit
  - `expressApp` (required function that returns express app, https://github.com/expressjs/express) - We advice you to use the require inside this function.
  - `port` (integer, HTTP port. default: `80`)
- *then(cb)*: Run a function during starting
  - `cb` (function that performs action, can return a promise as well)
- *done([callback])*: Add this at the end of the chain to start the service. it can take a callback function as parameter that executes when everything is loaded.
- *onExit(cb)*: Action to perform when closing Gracefully
  - `cb` (function that performs action, can return a promise as well)



## <a name="amq"></a> AMQ publisher/consumer

Connect to RabbitMQ using [amqp.node](https://github.com/squaremo/amqp.node), Asserts queues, and consume messages from a queue.

#### Example using serviceLoader

```js
const serviceLoader = require('petitservice/lib/serviceLoader');
const amq = require('petitservice/lib/amq');

serviceLoader()
.amq({
  amqUrl: 'amqp://guest:guest@localhost:5672',
  consumerQueue: 'my-consumer-queue',
  assertQueues: ['my-publisher-queue'],
  consumer: (data, ack) => {
    logger.info(data);
    ack(); // acknowledge the message
  },
})
.done(() => {
  amq.publish({ myKey: 'myValue' }, 'my-publisher-queue');
});
```

#### Example without serviceLoader

```js
const amq = require('petitservice/lib/amq');

// Using serviceLoader
amq.start({
  amqUrl: 'amqp://guest:guest@localhost:5672',
  consumerQueue: 'my-consumer-queue',
  assertQueues: ['my-publisher-queue'],
  consumer: (data, ack) => {
    logger.info(data);
    ack(); // acknowledge the message
  },
})
.then(() => {
  // publish a message
  amq.publish({ myKey: 'myValue' }, 'my-publisher-queue');
});

```

#### Available methods:

- *start(options)*: Connect to RabbitMQ and assert publisher/consumer. Documentation on the options is available on [serviceLoader](#serviceLoader)
- *publish(payload, queueName, [persistent])*: Publish a payload to a queue.
  - *payload:* (object) data to publish
  - *queueName:* (string) where we'd like to publish the data
  - *persistent:* (optional boolean) if we want to persist the message, default false
- *close()*: Close amq connection
- *getChannel()*: returns active channel
- *getConnection()*: returns active connection

## <a name="cache"></a> Redis Cache

Cache manager using Redis

#### Full example

```js
const cache = require('petitservice/lib/cache');
const logger = require('petitservice/lib/logger');

cache.start(config.redisUrl);

const userId = 12;
const getUser = (userId) => models.getUser(userId);

// Get / Set / Delete
const cacheKey = 'bob';
cache.getValue(cacheKey)
.then((cachedValue) => {
  if (!cachedValue) {
    logger.info(`Setting value for ${cacheKey}`);
    return cache.getValue(cacheKey, 'alice', 60);
  }
  logger.info(`I remember ${cachedValue}`);
})
.then((cachedValue) => {
  logger.info(`Bye ${cacheKey}`);
  return cache.delValue(cacheKey);
});

// Wrap a function
cache.wrap(userId, () => models.getUser(userId), 10)
.then((cacheUser) => {
  logger.info(`Bonjour ${cacheUser.firstName}`);
});

// Delayed Execution
const id = 'abc';
const prm = () => {
  return models.insertKeystroke(id, Math.random());
}
cache.delayedExec(id, prm, 10); // <= prm will be discarded after 10 sec
cache.delayedExec(id, prm, 10); // <= prm will be resolved after 10 sec
```

#### Available methods:

- *start(redisUrl):* Instantiate the cache so that we can call get/set data.
- *getValue(key):* Get value by its key
- *setValue(key, value, ttl):* Set a value using a key (ttl - Time to live - is in seconds)
- *delValue(key):* Delete a value by its key
- *wrap(key, fallbackPromise, ttl, isJSON):* Wrap a promise in cache.
  - *key*: (string) identifier
  - *fallbackPromise*: (function that returns a promise) How we get the data to read/write
  - *ttl*: (integer) Time to live in seconds
  - *isJSON*: (boolean - default:false) encode objects to a JSON before saving into the cache
- *delayedExec(identifier, prm, delayTime)*: Delay an promise execution of a promise across different microservices. The promise is resolved only if not another delayedExecution has been trigged during the same timeframe (delayTime).
  - *identifier*: (string) how we identify this execution
  - *prm*: (function that returns a promise) the promise that we want to execute
  - *delayTime*: (integer - in seconds) timeframe when there wasn't any delayed execution with the same identifier


## <a name="mongo"></a> MongoDb client

MongoDB helpers

#### Full example

```js
const mongo = require('petitservice/lib/mongo');
const logger = require('petitservice/lib/logger');

return mongo.start(config.mongoUrl)
  .then(() => {
    const db = mongo.db(config.mongoDbname);
    const collection = db.collection('documents');
    // Insert some documents
    return collection.insertMany([
      {a : 1}, {a : 2}, {a : 3}
    ])
      .then(() => collection.find({}).toArray())
      .then((docs) => logger.info(docs));
  })
  .then(() => mongo.close());

```

#### Available methods:

- *start(mongoUrl):* Instantiate the mongoDb client
- *db(key):* Get database instance
- *close():* Close mongodb client

## <a name="expressMiddleWare"></a> Express common middlewares

Set common middlewares for an express app


#### Full example
```js
const express = require('express');
const expressMiddleWare = require('petitservice/lib/expressMiddleWare');

const app = express();
expressMiddleWare.addStandard(app);
expressMiddleWare.addCompression(app);

expressMiddleWare.addLogs(app);

app.get('/', (req, res) => {
  res.send('Bonjour!');
});

expressMiddleWare.addErrorHandlers(app);
```

#### Available methods:
- *addStandard(app)*: Add the following middlewares:
  - Disable 'x-powered-by' header
  - Define 'trsut proxy' to accept forwared ip
  - Body parser (json and form data)
  - Set a health check endpoints '/~health' that returns 'ok'
  - Remove trailing slashes on urls
- *addCompression(app)*: Adds GZIP compression middleware
- *addLogs(app)*: logs http request using the logger module (See section about logger)
- addErrorHandlers(app, isHTML):
  - Report errors to google cloud engine if it's defined
  - Endpoint to handle not found pages (if isHTML is set to true it will render the view `404`)
  - Endpoint to handle internal errors (if isHTML is set to true it will render the view `500`)

## <a name="gcloud"></a> Google Cloud Monitoring (Trace, Debug, Errors)

Monitoring using Google Stackdriver: Debug, Trace, Errors.

#### Full Example:

```js
const gcloud = require('petitservice/lib/gcloud');

// Environment variable:
// - ENABLE_GCLOUD_TRACE: "1"
// - ENABLE_GCLOUD_ERROR: "1"
// - ENABLE_GCLOUD_DEBUG: "1"
// - GCLOUD_PROJECT: "my-project"
// - GCLOUD_STACKDRIVER_CREDENTIALS: "xxxx"

gcloud.init(process.cwd(), {
  trace: {
    ignoreUrls: [/^\/asserts/, /\/~*health/],
  }
});
```

#### Available methods:

- *init(projectRootDirectory, [options])*: Initiate gcloud
  - options: (optional object) more details below
  - projectRootDirectory: (required, string) Project root directory (where package.json is located)
- *reportError()*: Report an error to gcloud-errors, error must be an Error object
- *expressMiddleWare()*: gcloud-errors express middleware
- *startSpan()*: gcloud-trace startSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *endSpan()*: gcloud-trace endSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *runInSpan()*: gcloud-trace runInSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *runInRootSpan()*: gcloud-trace runInRootSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)

#### Available options:

- *credentials*: object, gcloud credentials (default: base64decode(GCLOUD_STACKDRIVER_CREDENTIALS))
- *trace*: object, options to override default configuration: https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/
- *debug*: object, options to override default configuration: https://github.com/GoogleCloudPlatform/cloud-debug-nodejs/
- *error*: object, options to override default configuration: https://github.com/GoogleCloudPlatform/cloud-errors-nodejs/

#### Environment variables:

- *GCLOUD_STACKDRIVER_CREDENTIALS*: required string, base64 of the gcloud json key
- *GCLOUD_PROJECT*: required string: gcloud project name
- *ENABLE_GCLOUD_TRACE*: option binary: Enable gcloud trace
- *ENABLE_GCLOUD_ERROR*: option binary: Enable gcloud error reporting
- *ENABLE_GCLOUD_DEBUG*: option binary: Enable gcloud debug
- *GCLOUD_DEBUG_LOGLEVEL*: Log level for gcloud/debug (default: 1)
- *GCLOUD_TRACE_LOGLEVEL*: Log level for gcloud/trace (default: 1)
- *GCLOUD_ERRORS_LOGLEVEL*: Log level for gcloud/error (default: 1)


## <a name="logger"></a> Logger

Log data on the console (using winston), and report errors to gcloud/error if enabled

The default LogLevels depends on the NOD_ENV:
- `debug` for `development` env
- `info` for `production` env
- `error` for `test` env

#### Full Example:

```js
// You may also set the log level using the environment variable: LOG_LEVEL: 'debug'

const logger = require('petitservice/lib/logger');

logger.debug('bonjour');
logger.info('un café et un croissant chaud');
logger.error(new Error('Something broke'));

// You can use middlewares for express

// Request logs
app.use(logger.requestLogger);

// Error logs
if (logger.gcloudErrorsMiddleWare) {
  app.use(logger.gcloudErrorsMiddleWare);
}
app.use(logger.errorLogger);
```

#### Exported methods:
- requestLogger: Express middleware to log requests
- errorLogger: Express middleware to log errors
- gcloudErrorsMiddleWare: Express middleware to report express errors to gcloud
- error
- outputError (like error, but without reporting that to gcloud)
- warn
- info
- log
- verbose
- debug
- silly

## <a name="dbHelpers"></a> Database helpers

Connect to a Postgres database using [knex](http://knexjs.org/).

Check section Service Loader for details to initiate the database

#### Full Example:

```js
const serviceLoader = require('petitservice/lib/serviceLoader');
const logger = require('petitservice/lib/logger');
const db = require('petitservice/lib/db');

serviceLoader()
.db({
  pgUrl: 'postgres://root:@localhost',
  pgDatabase: 'postgres',
})
.done(() => {
  const db = db.getKnexObject();
  db.raw('SELECT 1;')
  .then((data) => {
    logger.info(data);
  });
});

```

#### Exported methods:
 - *init([pgUrl], [pgDatabase])*: Initiate [knex object](http://knexjs.org/#Installation-client) in memory
  - *pgUrl*: (option string, postgres url, default: set in `./lib/db/config.js`)
  - *pgDatabase*: (option string, postgres database, default: set in `./lib/db/config.js`)
- *getKnexObject()*: returns [knex object](http://knexjs.org/#Installation-client)


#### Used environment variables

- POSTGRES_PORT_5432_TCP_ADDR: Postgres hostname
- POSTGRES_PORT_5432_TCP_PORT: Postgres port
- POSTGRES_ENV_POSTGRES_USER: Postgres username
- POSTGRES_ENV_POSTGRES_PASSWORD: Postgres password
- DB_NAME: Postgres database

## <a name="dbTasks"></a> Database tasks

#### Available tasks on `require('petitservice/lib/db/tasks')`:

- *run(action, database)*: Run a task to the database
  - action: can be `createdb`, `dropdb`, `migrate`, `seed`, `init` (createdb + migrate + seed), `refresh` (dropdb + init)
  - database: database name
- *createdb(database)*: Create database
- *dropdb(database)*: Drop database
- *migrate(database)*: Migrate database
- *seed(database)*: Seed database

#### Full example:

`node ./dbTasks.js createdb development`

```js
// dbTasks.js

const tasks = require('petitservice/lib/db/tasks');

const pgDatabases = {
  production: 'myDb',
  test: 'myDb_test',
  development: 'myDb_dev',
};

const env = process.argv[process.argv.length - 1];
const action = process.argv[process.argv.length - 2];

tasks.run(action, pgDatabases[env]);
```

# Contribute

You are welcomed to fork the project and make pull requests. Or just file an issue or suggestion 😊
