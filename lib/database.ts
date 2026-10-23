import 'server-only';
import mysql from 'mysql2/promise';

// Legacy connection retained only for a future explicit migration. Importing
// this module must not open a connection or silently use 2025 credentials.
function config(): mysql.PoolOptions {
  const { MYSQL_HOST, MYSQL_PORT, MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;
  if (!MYSQL_HOST || !MYSQL_USERNAME || !MYSQL_PASSWORD || !MYSQL_DATABASE) {
    throw new Error('Database is not configured');
  }
  const port = MYSQL_PORT === undefined ? 3306 : Number(MYSQL_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid database port');
  }
  return {
    host: MYSQL_HOST,
    port,
    user: MYSQL_USERNAME,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 20,
    timezone: 'Z',
  };
}

let pool: mysql.Pool | undefined;
export function getLegacyPool(): mysql.Pool {
  pool ??= mysql.createPool(config());
  return pool;
}
