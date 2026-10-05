const router = require('express').Router();
const db = require('../db');
const { wrap } = require('../utils');

router.get('/', wrap(async (_req, res) => {
  const { rows } = await db.query('SELECT slug, name FROM categories ORDER BY id');
  res.json(rows);
}));

module.exports = router;
