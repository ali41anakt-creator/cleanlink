const { Pool } = require('pg');
const config = require('./config');

if (!config.databaseUrl) {
  console.error('FATAL: не задан DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

pool.on('error', (err) => console.error('[pg] неожиданная ошибка пула:', err.message));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
