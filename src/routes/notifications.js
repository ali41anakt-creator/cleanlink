const router = require('express').Router();
const db = require('../db');
const { wrap } = require('../utils');
const { authRequired } = require('../middleware/auth');

router.get('/', authRequired, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, booking_id AS "bookingId", type, message, is_read AS "isRead", created_at AS "createdAt"
     FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`, [req.user.id]);
  res.json(rows);
}));

router.patch('/read', authRequired, wrap(async (req, res) => {
  await db.query('UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND is_read=FALSE', [req.user.id]);
  res.json({ ok: true });
}));

module.exports = router;
