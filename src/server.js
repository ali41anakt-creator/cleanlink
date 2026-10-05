const config = require('./config');
const app = require('./app');
const { pool } = require('./db');

const server = app.listen(config.port, config.host, async () => {
  console.log(`CleanLink запущен: http://localhost:${config.port}`);
  try { await pool.query('SELECT 1'); console.log('PostgreSQL: подключение установлено'); }
  catch (e) { console.error('PostgreSQL: НЕ удалось подключиться —', e.message); }
});

const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
