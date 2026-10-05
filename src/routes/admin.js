const router = require('express').Router();
const db = require('../db');
const { HttpError, wrap, id, str } = require('../utils');
const { authRequired, requireRole } = require('../middleware/auth');

router.use(authRequired, requireRole('admin'));

router.get('/stats', wrap(async (_req, res) => {
  const [users, services, bookings, revenue] = await Promise.all([
    db.query('SELECT role, COUNT(*)::int AS n FROM users GROUP BY role'),
    db.query('SELECT COUNT(*)::int AS n FROM services WHERE is_active'),
    db.query('SELECT status, COUNT(*)::int AS n FROM bookings GROUP BY status'),
    db.query(`SELECT COALESCE(SUM(price),0)::bigint AS total FROM bookings WHERE status='completed' AND payment_status='paid'`),
  ]);
  res.json({
    users: Object.fromEntries(users.rows.map((r) => [r.role, r.n])),
    services: services.rows[0].n,
    bookings: Object.fromEntries(bookings.rows.map((r) => [r.status, r.n])),
    revenue: Number(revenue.rows[0].total),
  });
}));

router.get('/users', wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT id, name, email, phone, city, bio, role, verification_status AS "verificationStatus",
            created_at AS "createdAt" FROM users ORDER BY id`);
  res.json(rows);
}));

router.patch('/users/:id/role', wrap(async (req, res) => {
  const uid = id(req.params.id);
  const role = str(req.body.role, { min: 1, max: 10, field: 'Роль' });
  if (!['user', 'master', 'admin'].includes(role)) throw new HttpError(400, 'Неизвестная роль');
  if (uid === req.user.id) throw new HttpError(400, 'Нельзя менять собственную роль');
  const active = await db.query("SELECT 1 FROM bookings WHERE (master_id=$1 OR user_id=$1) AND status IN ('pending','confirmed') LIMIT 1", [uid]);
  if (active.rowCount) throw new HttpError(409, 'Сначала завершите активные заказы пользователя');
  const r = await db.query("UPDATE users SET role=$1,token_version=token_version+1,verification_status=CASE WHEN $1='master' THEN 'pending' ELSE 'not_required' END WHERE id=$2 RETURNING id", [role, uid]);
  if (!r.rowCount) throw new HttpError(404, 'Пользователь не найден');
  res.json({ ok: true });
}));

router.patch('/users/:id/verification', wrap(async (req, res) => {
  const uid = id(req.params.id);
  const status = str(req.body.status, { min: 1, max: 16, field: 'Статус проверки' });
  if (!['verified', 'rejected', 'pending'].includes(status)) throw new HttpError(400, 'Некорректный статус проверки');
  const r = await db.query(
    `UPDATE users SET verification_status=$1 WHERE id=$2 AND role='master' RETURNING id`, [status, uid]);
  if (!r.rowCount) throw new HttpError(404, 'Мастер не найден');
  res.json({ ok: true });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  const uid = id(req.params.id);
  if (uid === req.user.id) throw new HttpError(400, 'Нельзя удалить самого себя');
  const history = await db.query('SELECT 1 FROM bookings WHERE user_id=$1 OR master_id=$1 LIMIT 1', [uid]);
  if (history.rowCount) throw new HttpError(409, 'Удаление недоступно: у пользователя есть история заказов');
  const r = await db.query('DELETE FROM users WHERE id=$1 RETURNING id', [uid]);
  if (!r.rowCount) throw new HttpError(404, 'Пользователь не найден');
  res.json({ ok: true });
}));

module.exports = router;
