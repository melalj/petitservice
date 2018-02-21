'use strict';

const amqplib = require('amqplib');
const url = require('url');

const logger = require('./logger');
const utils = require('./utils');

let channel;
let connection;

const options = {
  onError: (e, msg) => {
    logger.warn(`Rejected: ${e.message} - ${msg.substr(0, 1000).replace(/\n/g, ' ')}`);
  },
};

function start(customOptions) {
  if (!customOptions.amqUrl) throw new Error('Missing amqUrl');
  if (channel) return Promise.resolve(channel);
  Object.assign(options, customOptions);
  const parsedUrl = url.parse(options.amqUrl);
  return amqplib.connect(options.amqUrl, { servername: parsedUrl.hostname, timeout: 10000 })
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
              const content = msg.content.toString();
              try {
                const data = JSON.parse(content);
                const ack = () => {
                  try {
                    channel.ack(msg);
                  } catch (ackErr) {
                    logger.warn(`Error while ack message: ${ackErr.message}`);
                  }
                };
                options.consumerCb(data, ack)
                  .catch((e) => {
                    channel.reject(msg, false);
                    options.onError(e, content);
                  });
              } catch (e) {
                channel.reject(msg, false);
                options.onError(e, content);
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
  const payload = Buffer.from(JSON.stringify(toPublish));
  return channel.sendToQueue(queueName, payload, { persistent: false, expiration: 60000 });
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
