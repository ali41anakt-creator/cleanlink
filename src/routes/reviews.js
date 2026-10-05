const router = require('express').Router();
const db = require('../db');
const { wrap } = require('../utils');

// Последние отзывы для главной страницы
router.get('/latest', wrap(async (_req, res) => {
  const { rows } = await db.query(
    `SELECT u.name, r.rating, r.text, s.title AS "serviceTitle"
     FROM reviews r JOIN users u ON u.id = r.user_id JOIN services s ON s.id = r.service_id
     WHERE s.is_active AND r.text <> ''
     ORDER BY r.created_at DESC LIMIT 3`);
  res.json(rows);
}));

module.exports = router;
