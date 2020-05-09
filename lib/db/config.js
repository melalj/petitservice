const pgHost = process.env.PG_HOST || process.env.POSTGRES_PORT_5432_TCP_ADDR || 'postgres';
const pgPort = process.env.PG_PORT || process.env.POSTGRES_PORT_5432_TCP_PORT || 5432;
const pgUser = process.env.PG_USERNAME || process.env.POSTGRES_ENV_POSTGRES_USER || 'postgres';
const pgPass = process.env.PG_PASSWORD || process.env.POSTGRES_ENV_POSTGRES_PASSWORD || 'postgres';
const pgDatabase = process.env.PG_DATABASE || process.env.DB_NAME || 'postgres';
const pgUrl = (process.env.PG_URL) ? process.env.PG_URL : `postgres://${pgUser}:${pgPass}@${pgHost}:${pgPort}`;

module.exports = {
  pgHost,
  pgPort,
  pgUser,
  pgPass,
  pgDatabase,
  pgUrl,
  pgConfig: {
    client: 'postgresql',
    connection: `${pgUrl}/${pgDatabase}`,
    migrations: {
      tableName: 'db_migrations',
    },
  },
};
