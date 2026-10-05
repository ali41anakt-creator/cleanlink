const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { HttpError } = require('./utils');

const app = express();
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'], fontSrc: ["'self'"], connectSrc: ["'self'"],
  objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: config.isProd ? [] : null,
} }, strictTransportSecurity: config.isProd ? undefined : false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin) {
    const allowed = config.baseUrl || `${req.protocol}://${req.get('host')}`;
    if (req.headers.origin !== allowed) return next(new HttpError(403, 'Запрос с другого сайта отклонён'));
  }
  next();
});
app.get('/api/config', (_req, res) => res.json({ demo: config.demo, extras: require('./pricing').EXTRAS, timezone: 'Asia/Almaty' }));

app.get('/api/health', async (_req, res) => {
  try { await require('./db').query('SELECT 1'); res.json({ status: 'ok', db: 'up' }); }
  catch { res.status(503).json({ status: 'error', db: 'down' }); }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Слишком много попыток, попробуйте позже' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/services', require('./routes/services'));
app.use('/api/bookings', require('./routes/booking-flow'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Маршрут не найден')));

app.use(express.static(path.join(__dirname, '..', 'public')));

// Единый обработчик ошибок
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Некорректный JSON' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

module.exports = app;
