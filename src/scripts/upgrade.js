const fs = require('node:fs');
const path = require('node:path');
const { pool } = require('../db');
async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(fs.readFileSync(path.join(__dirname, '../../db/upgrade-v2.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log('CleanLink v2: дополнительные поля добавлены. Существующие записи сохранены.');
  } catch (error) { await client.query('ROLLBACK'); console.error('Миграция отменена:', error.code || error.message); process.exitCode = 1; }
  finally { client.release(); await pool.end(); }
}
main();
