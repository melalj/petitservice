'use strict';

const amqplib = require('amqplib');

const logger = require('./logger');
const utils = require('./utils');

let channel;
let connection;

const options = {
  socketOpts: { keepAlive: true, timeout: 15, noDelay: true },
  onError: (e, msg) => {
    logger.warn(`Rejected: ${e.message} - ${msg.substr(0, 1000).replace(/\n/g, ' ')}`);
  },
};

function start(customOptions) {
  if (!customOptions.amqUrl) throw new Error('Missing amqUrl');
  if (channel) return Promise.resolve(channel);
  Object.assign(options, customOptions);
  return amqplib.connect(options.amqUrl, options.socketOpts)
  .then((conn) => {
    connection = conn;
    return conn.createChannel();
  })
  .then((ch) => {
    channel = ch;
    let assertQueues = (options.assertQueues || []);
    if (options.consumerQueue) {
      assertQueues = assertQueues.concat(options.consumerQueue);
    }
    return Promise.all(utils.uniqueValues(assertQueues).map((q) => {
      return ch.assertQueue(q, { durable: true });
    }));
  })
  .then(() => {
    if (options.consumerQueue && options.consumerCb) {
      return channel.prefetch(options.consumerPrefetch || 1)
      .then(() => {
        return channel.consume(options.consumerQueue, (msg) => {
          try {
            const data = JSON.parse(msg);
            const ack = () => channel.ack(msg);
            options.consumerCb(data, ack)
            .catch((e) => {
              channel.reject(msg, false);
              options.onError(e, msg);
            });
          } catch (e) {
            channel.reject(msg, false);
            options.onError(e, msg);
          }
        }, { noAck: false });
      });
    }
    return true;
  });
}

function getChannel() {
  return channel;
}

function getConnection() {
  return connection;
}

function publish(toPublish, queueName) {
  if (!channel) throw new Error('Not connected to AMQ');
  if (!queueName) throw new Error('Missing queue name');
  const preview = JSON.stringify(toPublish).substr(0, 100);
  logger.debug(`-> ${queueName}: ${preview}...`);
  const payload = new Buffer(JSON.stringify(toPublish));
  return channel.sendToQueue(queueName, payload, { persistent: true });
}

function close() {
  if (!channel) return Promise.resolve(true);

  try {
    return channel.close()
    .then(() => {
      if (!connection) return Promise.resolve(true);
      return connection.close(connection);
    });
  } catch (e) {
    logger.warn('> AMQ closed');
    return Promise.resolve(true);
  }
}

module.exports = {
  start,
  close,
  publish,
  getChannel,
  getConnection,
};
