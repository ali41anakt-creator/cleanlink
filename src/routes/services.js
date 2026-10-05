const router = require('express').Router();
const db = require('../db');
const { HttpError, wrap, str, int, id } = require('../utils');
const { authRequired, authOptional, requireRole } = require('../middleware/auth');
const { quote, availableSlots } = require('../pricing');

const SELECT = `
  SELECT s.id, s.title, s.description AS "desc", s.full_desc AS "fullDesc", s.price,
         s.duration, s.duration_minutes AS "durationMinutes", s.city, s.km, s.badge, s.icon,
         s.extra_rate AS "extraRate", s.included, s.excluded, s.is_active AS active,
         COALESCE(NULLIF(s.provider_name,''), m.name) AS provider,
         s.master_id AS "masterId", c.slug AS category, c.name AS "categoryName",
         m.verification_status AS "providerVerificationStatus",
         COALESCE(r.avg, 0)::float AS rating, COALESCE(r.cnt, 0)::int AS reviews
  FROM services s
  JOIN categories c ON c.id = s.category_id
  LEFT JOIN users m ON m.id = s.master_id
  LEFT JOIN (
    SELECT service_id, ROUND(AVG(rating), 1) AS avg, COUNT(*) AS cnt
    FROM reviews GROUP BY service_id
  ) r ON r.service_id = s.id`;

// Список с фильтрами: ?category=&city=&search=&maxPrice=&minRating=
router.get('/', wrap(async (req, res) => {
  const where = ["s.is_active", 's.master_id IS NOT NULL', "m.verification_status = 'verified'"];
  const params = [];
  const { category, city, search, maxPrice, minRating } = req.query;
  if (category) { params.push(String(category)); where.push(`c.slug = $${params.length}`); }
  if (city) { params.push(String(city).trim().slice(0, 60)); where.push(`LOWER(s.city) = LOWER($${params.length})`); }
  if (search) {
    params.push(`%${String(search).slice(0, 100).replace(/[%_\\]/g, '\\$&')}%`);
    where.push(`s.title ILIKE $${params.length}`);
  }
  if (maxPrice !== undefined && maxPrice !== '') {
    params.push(int(maxPrice, { field: 'Цена до' })); where.push(`s.price <= $${params.length}`);
  }
  if (minRating !== undefined && minRating !== '') {
    const n = Number(minRating);
    if (!(n >= 0 && n <= 5)) throw new HttpError(400, 'Некорректный рейтинг');
    params.push(n); where.push(`COALESCE(r.avg, 0) >= $${params.length}`);
  }
  const { rows } = await db.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY s.id`, params);
  res.json(rows);
}));

// Услуги текущего мастера (для админа — все)
router.get('/mine', authRequired, requireRole('master', 'admin'), wrap(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { rows } = await db.query(
    `${SELECT} ${isAdmin ? '' : 'WHERE s.master_id = $1'} ORDER BY s.id`,
    isAdmin ? [] : [req.user.id]);
  res.json(rows);
}));

router.get('/:id/availability', wrap(async (req, res) => {
  const sid = id(req.params.id);
  const { rows } = await db.query(`SELECT s.* FROM services s JOIN users u ON u.id=s.master_id
    WHERE s.id=$1 AND s.is_active AND u.verification_status='verified'`, [sid]);
  if (!rows[0]) throw new HttpError(404, 'Услуга недоступна');
  const calculated = quote(rows[0], req.query.area || 40, req.query.extras ? String(req.query.extras).split(',') : []);
  const busy = await db.query("SELECT scheduled_at,duration_minutes FROM bookings WHERE master_id=$1 AND status IN ('pending','confirmed')", [rows[0].master_id]);
  res.json({ quote: calculated, slots: availableSlots(req.query.day, calculated.duration, busy.rows) });
}));

// Карточка услуги + отзывы + canReview для авторизованного клиента
router.get('/:id', authOptional, wrap(async (req, res) => {
  const sid = id(req.params.id);
  const { rows } = await db.query(`${SELECT} WHERE s.id = $1 AND s.is_active AND s.master_id IS NOT NULL AND m.verification_status = 'verified'`, [sid]);
  if (!rows[0]) throw new HttpError(404, 'Услуга не найдена');
  const reviews = await db.query(
    `SELECT r.id, u.name, r.rating, r.text, r.created_at AS "createdAt"
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.service_id = $1 ORDER BY r.created_at DESC`, [sid]);
  let canReview = false;
  if (req.user && req.user.role === 'user') {
    const done = await db.query(
      `SELECT 1 FROM bookings WHERE service_id=$1 AND user_id=$2 AND status='completed' LIMIT 1`,
      [sid, req.user.id]);
    canReview = done.rowCount > 0;
  }
  res.json({ ...rows[0], reviewsList: reviews.rows, canReview });
}));

async function readServiceBody(body) {
  const slug = str(body.category, { min: 1, max: 40, field: 'Категория' });
  const cat = await db.query('SELECT id FROM categories WHERE slug = $1', [slug]);
  if (!cat.rows[0]) throw new HttpError(400, 'Неизвестная категория');
  return {
    category_id: cat.rows[0].id,
    title: str(body.title, { min: 3, max: 120, field: 'Название' }),
    description: str(body.desc ?? '', { max: 300, field: 'Краткое описание' }),
    full_desc: str(body.fullDesc ?? '', { max: 4000, field: 'Описание' }),
    price: int(body.price, { min: 1000, max: 1000000, field: 'Цена' }),
    extra_rate: int(body.extraRate ?? 0, { min: 0, max: 10000, field: 'Доплата за м²' }),
    included: str(body.included ?? '', { max: 2000, field: 'Что входит' }).split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20),
    excluded: str(body.excluded ?? '', { max: 2000, field: 'Что не входит' }).split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20),
    duration: str(body.duration ?? '', { max: 40, field: 'Длительность' }),
    duration_minutes: int(body.durationMinutes ?? 120, { min: 30, max: 720, field: 'Длительность в минутах' }),
    city: str(body.city || 'Алматы', { min: 2, max: 60, field: 'Город' }),
    km: int(body.km ?? 0, { min: 0, max: 1000, field: 'Расстояние' }),
    icon: str(body.icon || '🧹', { min: 1, max: 8, field: 'Иконка' }),
    provider_name: str(body.provider ?? '', { max: 80, field: 'Исполнитель' }),
  };
}

router.post('/', authRequired, requireRole('master', 'admin'), wrap(async (req, res) => {
  if (req.user.role === 'master' && req.user.verification_status !== 'verified') {
    throw new HttpError(403, 'Профиль мастера ожидает проверки администратора');
  }
  const d = await readServiceBody(req.body);
  const masterId = req.user.role === 'admin' ? id(req.body.masterId) : req.user.id;
  const owner = await db.query("SELECT id FROM users WHERE id=$1 AND role='master' AND verification_status='verified'", [masterId]);
  if (!owner.rowCount) throw new HttpError(400, 'Выберите проверенного клинера');
  const { rows } = await db.query(
    `INSERT INTO services (master_id, category_id, title, description, full_desc, price,
                           duration, duration_minutes, city, km, icon, provider_name, extra_rate,included,excluded)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [masterId, d.category_id, d.title, d.description, d.full_desc, d.price, d.duration,
     d.duration_minutes, d.city, d.km, d.icon, d.provider_name || req.user.name, d.extra_rate,JSON.stringify(d.included),JSON.stringify(d.excluded)]);
  res.status(201).json({ id: rows[0].id });
}));

async function ownedService(req) {
  const sid = id(req.params.id);
  const { rows } = await db.query('SELECT id, master_id FROM services WHERE id=$1', [sid]);
  if (!rows[0]) throw new HttpError(404, 'Услуга не найдена');
  if (req.user.role !== 'admin' && rows[0].master_id !== req.user.id) {
    throw new HttpError(403, 'Это не ваша услуга');
  }
  return sid;
}

router.put('/:id', authRequired, requireRole('master', 'admin'), wrap(async (req, res) => {
  const sid = await ownedService(req);
  const d = await readServiceBody(req.body);
  await db.query(
    `UPDATE services SET category_id=$1, title=$2, description=$3, full_desc=$4, price=$5,
            duration=$6, duration_minutes=$7, city=$8, km=$9, icon=$10,
            provider_name=COALESCE(NULLIF($11,''), provider_name), extra_rate=$13,included=$14,excluded=$15 WHERE id=$12`,
    [d.category_id, d.title, d.description, d.full_desc, d.price, d.duration, d.duration_minutes,
     d.city, d.km, d.icon, d.provider_name, sid,d.extra_rate,JSON.stringify(d.included),JSON.stringify(d.excluded)]);
  res.json({ ok: true });
}));

// «Мягкое» удаление: заказы и отзывы остаются целыми
router.patch('/:id/active', authRequired, requireRole('master','admin'), wrap(async (req,res) => {
  const sid = await ownedService(req);
  if (typeof req.body.active !== 'boolean') throw new HttpError(400, 'Некорректный статус');
  await db.query('UPDATE services SET is_active=$1 WHERE id=$2', [req.body.active,sid]);
  res.json({ ok:true });
}));
router.delete('/:id', authRequired, requireRole('master', 'admin'), wrap(async (req, res) => {
  const sid = await ownedService(req);
  await db.query('UPDATE services SET is_active = FALSE WHERE id = $1', [sid]);
  res.json({ ok: true });
}));

// Отзыв: только клиент с выполненным заказом; повторный отзыв обновляет прежний
router.post('/:id/reviews', authRequired, requireRole('user'), wrap(async (req, res) => {
  const sid = id(req.params.id);
  const rating = int(req.body.rating, { min: 1, max: 5, field: 'Оценка' });
  const text = str(req.body.text ?? '', { max: 1000, field: 'Отзыв' });
  const done = await db.query(
    `SELECT 1 FROM bookings WHERE service_id=$1 AND user_id=$2 AND status='completed' LIMIT 1`,
    [sid, req.user.id]);
  if (!done.rowCount) throw new HttpError(403, 'Оставить отзыв можно после выполненного заказа');
  await db.query(
    `INSERT INTO reviews (service_id, user_id, rating, text) VALUES ($1,$2,$3,$4)
     ON CONFLICT (service_id, user_id) DO UPDATE SET rating=EXCLUDED.rating, text=EXCLUDED.text`,
    [sid, req.user.id, rating, text]);
  res.status(201).json({ ok: true });
}));

module.exports = router;
