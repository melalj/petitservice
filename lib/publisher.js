'use strict';

const amqplib = require('amqplib');

const logger = require('./logger');

let channel;
let connection;

function start(amqUrl, exchanges) {
  if (channel) return Promise.resolve(channel);
  return amqplib.connect(amqUrl, { keepAlive: true, timeout: 15, noDelay: true })
  .then((conn) => {
    connection = conn;
    return conn.createChannel();
  })
  .then((ch) => {
    channel = ch;
    return Promise.all(exchanges.map((exchange) => {
      return channel.assertExchange(exchange, 'direct');
    }));
  });
}

function publish(toPublish, exchangeName) {
  if (!channel) throw new Error('Not connected to AMQ');
  if (!exchangeName) throw new Error('Missing exchange name');
  const preview = JSON.stringify(toPublish).substr(0, 100);
  logger.debug(`-> ${exchangeName}: ${preview}...`);
  channel.publish(exchangeName, 'direct', new Buffer(JSON.stringify(toPublish)), {});
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
    logger.warn('> Publisher already closed');
    return Promise.resolve(true);
  }
}

module.exports = {
  start,
  close,
  publish,
};
