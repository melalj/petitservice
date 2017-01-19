# PetitService.js

Set of modules designed for Microservice architecture.

## Service Loader

Start different services (sequentially) with graceful exit handler.

Supported features:
- Check if TCP hosts are reachable
- Start Redis cache manager
- Start AMQ publisher
- Start AMQ consumer/publisher using [coworkers](https://github.com/tjmehta/coworkers)
- Start postgres database connection using [knex](http://knexjs.org/) (check if it's alive every 30 sec)
- Start HTTP server (express or http)
- Gracefully exit all services on exceptions


### Full Example:

```js
const serviceLoader = require('petitservice/lib/service_loader');

return serviceLoader()
.ping([
  config.apiUrlHost,
  config.redisHost,
  config.amqpHost,
])
.cache(config.redisUrl)
.publisher(config.amqUrl, ['exchange-name1', 'exchange-name1'])
.then(() => {
  /* Some logic here */
  return Promise.resolve(true);
})
.db({
  pgUrl: config.pgUrl,
  pgDatabase: config.pgDatabase,
})
.express(() => require('./express_app.js'), config.httpPort)
.done();
```

### Available functions chains:

- *ping(hostList, [options])*: Check if hostnames are alive
  - `hostList` (array of host to ping) host format: `hostname:port`
  - `options.failureMax` (integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (integer, how many milliseconds should wait before checking again hostnames, default: 30000)
- *db([options])*: Initiate database, checks if database is alive and destroy knex on exit
  - `options.pgUrl` (string, postgres url, default: set in `./lib/db/config.js`)
  - `options.pgDatabase` (string, database to query, default: postgres)
  - `options.failureMax` (integer, how many attempts should we try before we exit the process, default: 5)
  - `options.frequency` (integer, how many milliseconds should wait before checking again the database, default: 30000)
- *cache(redisUrl)*: Start cache for `petitservice/lib/cache`
  - `redisUrl` (required string, redis url)
- *publisher(amqUrl, publisherExchanges)*: Connect to RabbitMQ and assert exchanges for `petitservice/lib/publisher`, and close it when exit
  - `amqUrl` (required string, amq url)
  - `publisherExchanges` (required array, list of exchanges to assert)
- *coworkers(options)*: Connect to RabbitMQ using coworkers, and close it when exit. `options` is required.
  - `options.amqUrl` (required string, amq url)
  - `options.consumer` (required function that returns coworkers app, https://github.com/tjmehta/coworkers)
  - `options.consumerExchange` (required string, exchange name where the consumer queue is binded)
  - `options.consumerQueue` (required string, consumer queue name)
  - `options.publisherExchanges` (optional array, list of publisher exchange name)
- *express(expressApp, port)*: Start express HTTP server, and close it when exit
  - `expressApp` (required function that returns express app, https://github.com/expressjs/express) - We advice you to use the require inside this function.
  - `port` (integer, HTTP port. default: `80`)
- *then(customPromise)*: Run a custom process on the process
  - `customPromise` (function that returns a Promise)
- *done([callback])*: Add this at the end of the chain to start the service. it can take a callback function as parameter that executes when everything is loaded.
- *onExit(customPromise)*: Action to perform when closing Gracefully
  - `customPromise` (function that returns a Promise)




## petitservice/lib/gcloud

Monitoring using Google Stackdriver: Debug, Trace, Errors.

### Full Example:

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
    ignoreUrls: [/^\/assets/, /\/~*health/],
  }
});
```

### Available methods:

- *init(projectRootDirectory, [options])*: Initiate gcloud
  - options: (optional object) more details below
  - projectRootDirectory: (required, string) Project root directory (where package.json is located)
- *reportError()*: Report an error to gcloud-errors, error must be an Error object
- *expressMiddleWare()*: gcloud-errors express middleware
- *startSpan()*: gcloud-trace startSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *endSpan()*: gcloud-trace endSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *runInSpan()*: gcloud-trace runInSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)
- *runInRootSpan()*: gcloud-trace runInRootSpan (see [trace](https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/) documentation)

### Available options:

- *credentials*: object, gcloud credentials (default: base64decode(GCLOUD_STACKDRIVER_CREDENTIALS))
- *trace*: object, options to override default configuration: https://github.com/GoogleCloudPlatform/cloud-trace-nodejs/
- *debug*: object, options to override default configuration: https://github.com/GoogleCloudPlatform/cloud-debug-nodejs/
- *error*: object, options to override default configuration: https://github.com/GoogleCloudPlatform/cloud-errors-nodejs/

### Environment variables:

- *GCLOUD_STACKDRIVER_CREDENTIALS*: required string, base64 of the gcloud json key
- *GCLOUD_PROJECT*: required string: gcloud project name
- *ENABLE_GCLOUD_TRACE*: option binary: Enable gcloud trace
- *ENABLE_GCLOUD_ERROR*: option binary: Enable gcloud error reporting
- *ENABLE_GCLOUD_DEBUG*: option binary: Enable gcloud debug
- *GCLOUD_DEBUG_LOGLEVEL*: Log level for gcloud/debug (default: 1)
- *GCLOUD_TRACE_LOGLEVEL*: Log level for gcloud/trace (default: 1)
- *GCLOUD_ERRORS_LOGLEVEL*: Log level for gcloud/error (default: 1)



## petitservice/lib/logger

Log data on the console (using winston), and report errors to gcloud/error if enabled

### Full Example:

```js
const logger = require('petitservice/lib/logger');

logger.debug('bonjour');
logger.info('hello');
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

### Exported methods:
- requestLogger: Express middleware to log requests
- errorLogger: Express middleware to log errors
- gcloudErrorsMiddleWare: Express middleware to report express errors to gcloud
- error
- warn
- info
- log
- verbose
- debug
- silly




## petitservice/lib/db

Connect to a Postgres database using [knex](http://knexjs.org/).

Check section `petitservice/lib/service_loader` for details to initiate the database

### Full Example:

```js
const serviceLoader = require('petitservice/lib/service_loader');
const dbLoader = require('petitservice/lib/db');

serviceLoader()
.db({
  pgUrl: 'postgres://root:@localhost',
  pgDatabase: 'postgres',
})
.done(() => {
  db.raw('SELECT 1;')
  .then((data) => {
    const db = dbLoader.getKnexObject();
    console.log(data);
  });
});

```

### Used environment variables

- POSTGRES_PORT_5432_TCP_ADDR: Postgres hostname
- POSTGRES_PORT_5432_TCP_PORT: Postgres port
- POSTGRES_ENV_POSTGRES_USER: Postgres username
- POSTGRES_ENV_POSTGRES_PASSWORD: Postgres password
- DB_NAME: Postgres database

## petitservice/lib/db/tasks

- *run(action, database)*: Run a task to the database
  - action: can be `createdb`, `dropdb`, `migrate`, `seed`, `init` (createdb + migrate + seed), `refresh` (dropdb + init)
  - database: database name
- *createdb(database)*: Create database
- *dropdb(database)*: Drop database
- *migrate(database)*: Migrate database
- *seed(database)*: Seed database
