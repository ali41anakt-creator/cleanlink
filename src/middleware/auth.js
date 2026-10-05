const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { HttpError, wrap } = require('../utils');
const crypto = require('crypto');
const csrfFor = token => crypto.createHmac('sha256', config.jwtSecret).update(token).digest('hex');
const cookieFor = token => `cleanlink_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? 43200 : 0}${config.isProd ? '; Secure' : ''}`;

async function loadUser(req) {
  const header = req.headers.authorization || '';
  const [scheme, bearer] = header.split(' ');
  const cookie = (req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('cleanlink_session='))?.split('=')[1];
  const token = scheme === 'Bearer' && bearer ? bearer : cookie;
  if (!token) return null;
  let payload;
  try { payload = jwt.verify(token, config.jwtSecret); }
  catch { throw new HttpError(401, 'Сессия истекла, войдите заново'); }
  // Берём пользователя из БД: смена роли / удаление действуют сразу
  const { rows } = await db.query(
    'SELECT id, name, email, phone, city, bio, role, verification_status, token_version FROM users WHERE id = $1', [payload.sub]);
  if (!rows[0]) throw new HttpError(401, 'Пользователь не найден');
  if ((payload.ver || 0) !== rows[0].token_version) throw new HttpError(401, 'Войдите в аккаунт заново');
  req.csrf = csrfFor(token);
  if (token === cookie && !['GET','HEAD','OPTIONS'].includes(req.method) && req.headers['x-csrf-token'] !== req.csrf) {
    throw new HttpError(403, 'Обновите страницу перед отправкой формы');
  }
  return rows[0];
}

// Обязательная авторизация
const authRequired = wrap(async (req, _res, next) => {
  const user = await loadUser(req);
  if (!user) throw new HttpError(401, 'Требуется вход');
  req.user = user;
  next();
});

// Необязательная: если токен есть — подставляем req.user
const authOptional = wrap(async (req, _res, next) => {
  req.user = await loadUser(req);
  next();
});

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new HttpError(403, 'Недостаточно прав'));
  }
  next();
};

module.exports = { authRequired, authOptional, requireRole, csrfFor, cookieFor };
