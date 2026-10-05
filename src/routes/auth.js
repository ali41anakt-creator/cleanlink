const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');
const { HttpError, wrap, str, EMAIL_RE } = require('../utils');
const { authRequired, csrfFor, cookieFor } = require('../middleware/auth');

const sign = (user) =>
  jwt.sign({ sub: user.id, role: user.role, ver: user.token_version || 0 }, config.jwtSecret, { expiresIn: '12h' });
function sessionResponse(res, user, status = 200) {
  const token = sign(user);
  res.setHeader('Set-Cookie', cookieFor(token));
  res.status(status).json({ token, csrf: csrfFor(token), user: publicUser(user) });
}

const publicUser = (u) => ({
  id: u.id, name: u.name, email: u.email, phone: u.phone, city: u.city,
  bio: u.bio, role: u.role, verificationStatus: u.verification_status,
});

// Заглушка-хэш, чтобы время ответа не выдавало существование email
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

router.post('/register', wrap(async (req, res) => {
  const name = str(req.body.name, { min: 2, max: 80, field: 'Имя' });
  const email = str(req.body.email, { min: 5, max: 160, field: 'Email' }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Некорректный email');
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new HttpError(400, 'Пароль: минимум 10 символов, максимум 72 байта');
  }
  const phone = str(req.body.phone ?? '', { max: 30, field: 'Телефон' }) || null;
  const city = str(req.body.city || 'Алматы', { min: 2, max: 60, field: 'Город' });
  // Администратором при регистрации стать нельзя
  const role = req.body.role === 'master' ? 'master' : 'user';

  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, phone, city, password_hash, role, verification_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, name, email, phone, city, bio, role, verification_status`,
      [name, email, phone, city, hash, role, role === 'master' ? 'pending' : 'not_required']);
    sessionResponse(res, rows[0], 201);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Пользователь с таким email уже существует');
    throw e;
  }
}));

router.post('/login', wrap(async (req, res) => {
  const email = str(req.body.email, { min: 1, max: 160, field: 'Email' }).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Неверный email или пароль');
  sessionResponse(res, user);
}));

router.get('/me', authRequired, (req, res) => res.json({ user: publicUser(req.user), csrf: req.csrf }));
router.post('/logout', authRequired, wrap(async (req, res) => {
  await db.query('UPDATE users SET token_version=token_version+1 WHERE id=$1', [req.user.id]);
  res.setHeader('Set-Cookie', cookieFor(''));
  res.json({ ok: true });
}));
router.patch('/me', authRequired, wrap(async (req, res) => {
  const name = str(req.body.name, { min: 2, max: 80, field: 'Имя' });
  const phone = str(req.body.phone, { min: 10, max: 30, field: 'Телефон' });
  if (!/^[+\d ()-]+$/.test(phone)) throw new HttpError(400, 'Некорректный телефон');
  const bio = str(req.body.bio || '', { max: 500, field: 'О себе' });
  const { rows } = await db.query('UPDATE users SET name=$1,phone=$2,bio=$3 WHERE id=$4 RETURNING *', [name,phone,bio,req.user.id]);
  res.json({ user: publicUser(rows[0]) });
}));

module.exports = router;
