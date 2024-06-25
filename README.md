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
- [Express common middlewares](#expressMiddleWare)
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
- Start HTTP server (express or http)
- Gracefully exit all services on exceptions

#### Full Example

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
.cache({ host: 'localhost', port: 6379, auth_pass: 'xxx' })
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
.express(() => require('./express_app.js'), config.httpPort)
.onExit(() => {
  logger.info('Do something during exit...');
})
.done(() => {
  logger.info('Everything is started!');
});
```

#### Available functions chains

- *ping(urlList, [options])*: Check if hostnames are alive
  - `urlList` (array of url to ping) format: `protocol://[user:pass@]hostname:port`
  - `options.failureMax` (optional integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (optional integer, how many milliseconds should wait before checking again hostnames, default: 30000)
- *cache(redisOpts)*: Start cache for `petitservice/lib/cache`
  - `redisOpts` (required object, { host, port, auth_pass })
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
  - `expressApp` (required function that returns express app, <https://github.com/expressjs/express>) - We advice you to use the require inside this function.
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

#### Available methods

- *start(options)*: Connect to RabbitMQ and assert publisher/consumer. Documentation on the options is available on [serviceLoader](#serviceLoader)
- *publish(payload, queueName, [options])*: Publish a payload to a queue.
  - *payload:* (object) data to publish
  - *queueName:* (string) where we'd like to publish the data
  - *options:* (optional object) Publication options (for sendToQueue), default `{ persistent: false, expiration: 60000 }`
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

#### Available methods

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

#### Available methods

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

#### Available methods

- *addStandard(app)*: Add the following middlewares:
  - Disable 'x-powered-by' header
  - Define 'trsut proxy' to accept forwared ip
  - Body parser (json and form data)
  - Set a health check endpoints '/~health' that returns 'ok'
  - Remove trailing slashes on urls
- *addCompression(app)*: Adds GZIP compression middleware
- *addLogs(app, addLogs)*: logs http request using the logger module (See section about logger)
- addErrorHandlers(app, isHTML):
  - Endpoint to handle not found pages (if isHTML is set to true it will render the view `404`)
  - Endpoint to handle internal errors (if isHTML is set to true it will render the view `500`)

## <a name="logger"></a> Logger

Log data on the console (using pino), and report errors to error if enabled

The default LogLevels depends on the NOD_ENV:

- `debug` for `development` env
- `info` for `production` env
- `error` for `test` env

#### Full Example

```js
// You may also set the log level using the environment variable: LOG_LEVEL: 'debug'

const logger = require('petitservice/lib/logger');

logger.debug('bonjour');
logger.info('un café et un croissant chaud');
logger.error(new Error('Something broke'));

// You can use middlewares for express

// Request logs
app.use(logger.requestLogger);
app.use(logger.errorLogger);
```

#### Exported methods

- requestLogger: Express middleware to log requests
- errorLogger: Express middleware to log errors
- error
- outputError (like error)
- warn
- info
- log
- verbose
- debug
- silly

# Contribute

You are welcomed to fork the project and make pull requests. Or just file an issue or suggestion 😊
