require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.startsWith('change_me')) {
  if (isProd) {
    console.error('FATAL: задайте JWT_SECRET в переменных окружения');
    process.exit(1);
  }
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[warn] JWT_SECRET не задан — использован временный (токены сбросятся при перезапуске)');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Render routes traffic to 0.0.0.0; local development remains on localhost.
  host: process.env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1'),
  baseUrl: process.env.BASE_URL || '',
  demo: process.env.SEED_DEMO === 'true' && !isProd,
};
