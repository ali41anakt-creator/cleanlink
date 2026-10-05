// Создаёт таблицы и заливает начальные данные. Безопасно запускать повторно.
// node src/scripts/init-db.js           — создать/дозаполнить
// node src/scripts/init-db.js --reset   — СТЕРЕТЬ все таблицы и создать заново
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
require('../config');
const { pool } = require('../db');

const CATEGORIES = [
  ['apartment', 'Уборка квартиры'],
  ['office', 'Уборка офиса'],
  ['windows', 'Мойка окон'],
  ['general', 'Генеральная уборка'],
];

const SERVICES = [
  ['Уборка квартиры', 'Ежедневная, генеральная, после ремонта.', 5000, '1–3 часа', 2, 'Популярный', 'CleanPro', 'apartment', '🛋️',
    'Регулярная или разовая уборка квартиры любой площади: пыль, полы, кухня, санузел. Клинер приезжает со своим инвентарём и средствами.'],
  ['Уборка офиса', 'Чистота рабочего пространства для вашего бизнеса.', 8000, '2–5 часов', 3, null, 'OfficeClean', 'office', '🖥️',
    'Уборка рабочих зон, переговорных и санузлов в офисе. Подходит для разового заказа и регулярного обслуживания бизнес-центров.'],
  ['Мойка окон', 'Чистые окна — больше света в вашем доме.', 3000, '1–2 часа', 4, null, 'WindowPro', 'windows', '🪟',
    'Мойка окон и балконных рам без разводов, в том числе труднодоступных. Работаем с высотными этажами при наличии допуска.'],
  ['Генеральная уборка', 'Полная уборка для идеальной чистоты.', 12000, '3–6 часов', 6, null, 'FreshClean', 'general', '✨',
    'Глубокая очистка всего дома или квартиры: труднодоступные места, техника, сантехника, плинтусы и карнизы.'],
  ['Уборка после ремонта', 'Убираем строительную пыль и грязь.', 10000, '3–8 часов', 5, null, 'CleanMaster', 'apartment', '🧱',
    'Вывоз строительного мусора, удаление пыли со всех поверхностей, мойка окон и полов после ремонтных работ.'],
  ['Химчистка ковров', 'Удаляем пятна и возвращаем свежесть.', 4000, '1–4 часа', 7, 'Новинка', 'CarpetClean', 'general', '🧴',
    'Профессиональная химчистка ковров и мягкой мебели на дому, безопасные средства, быстрая сушка.'],
  ['Генеральная уборка офиса', 'Полная уборка с использованием профессионального оборудования.', 15000, '4–8 часов', 3, 'Хит', 'FreshClean', 'office', '🖥️',
    'Полная уборка офиса: полы, окна, мебель, санузлы и кухня с использованием профессионального оборудования.'],
  ['Ежедневная уборка офиса', 'Поддержание чистоты и порядка в течение всего рабочего дня.', 7000, '2–4 часа', 2, 'Скидка -10%', 'OfficeClean', 'office', '🖥️',
    'Регулярное обслуживание офиса по графику: контроль чистоты рабочих зон, санузлов и общих пространств.'],
];

// [услуга по порядку (1..), имя клиента, оценка, текст]
const DEMO_REVIEWS = [
  [1, 'Алина С.', 5, 'Очень удобно, нашла клинера рядом с домом. Всё было сделано качественно и вовремя!'],
  [1, 'Данияр К.', 5, 'Отличный сервис! Сравнил цены, выбрал подходящий вариант. Рекомендую!'],
  [2, 'Жанна Т.', 5, 'Быстрая поддержка, вежливые исполнители. Теперь пользуюсь только этим сайтом.'],
];

async function main() {
  const reset = process.argv.includes('--reset');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (reset) {
      await client.query('DROP TABLE IF EXISTS reviews, bookings, services, categories, users CASCADE');
      console.log('Старые таблицы удалены');
    }
    await client.query(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8'));
    // Лёгкая миграция для баз, созданных предыдущей версией приложения.
    for (const sql of [
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(60) NOT NULL DEFAULT 'Алматы'",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(500) NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(16) NOT NULL DEFAULT 'not_required'",
      'ALTER TABLE services ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 120',
      'ALTER TABLE bookings ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 120',
      "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) NOT NULL DEFAULT 'cash_after_service'",
      "ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(16) NOT NULL DEFAULT 'due'",
    ]) await client.query(sql);
    await client.query("UPDATE users SET verification_status = 'pending' WHERE role = 'master' AND verification_status = 'not_required'");
    console.log('Схема применена');

    for (const [slug, name] of CATEGORIES) {
      await client.query(
        'INSERT INTO categories (slug, name) VALUES ($1,$2) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name',
        [slug, name]);
    }

    const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      if (ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD должен быть не короче 8 символов');
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const r = await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ('Администратор',$1,$2,'admin')
         ON CONFLICT (email) DO NOTHING RETURNING id`, [ADMIN_EMAIL.toLowerCase(), hash]);
      console.log(r.rowCount ? `Администратор создан: ${ADMIN_EMAIL}` : 'Администратор уже существует');
    } else {
      console.log('ADMIN_EMAIL/ADMIN_PASSWORD не заданы — администратор не создан');
    }

    const hasServices = (await client.query('SELECT 1 FROM services LIMIT 1')).rowCount > 0;
    // Перенос демо-каталога предыдущей версии: у старых записей не было владельцев,
    // поэтому назначаем им проверенных демо-мастеров только в режиме SEED_DEMO.
    if (process.env.SEED_DEMO === 'true' && hasServices) {
      const { rows: orphaned } = await client.query(
        "SELECT provider_name, ARRAY_AGG(id) AS ids FROM services WHERE master_id IS NULL GROUP BY provider_name");
      let n = 0;
      for (const provider of orphaned) {
        n += 1;
        const name = provider.provider_name || `Демо-мастер ${n}`;
        const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        const owner = await client.query(
          `INSERT INTO users (name, email, password_hash, role, verification_status)
           VALUES ($1,$2,$3,'master','verified')
           ON CONFLICT (email) DO UPDATE SET verification_status='verified' RETURNING id`,
          [name, `demo-owner-${n}@demo.local`, hash]);
        await client.query('UPDATE services SET master_id=$1 WHERE id = ANY($2::int[])', [owner.rows[0].id, provider.ids]);
      }
    }
    if (process.env.SEED_DEMO === 'true' && !hasServices) {
      const cats = Object.fromEntries(
        (await client.query('SELECT id, slug FROM categories')).rows.map((c) => [c.slug, c.id]));
      const providers = {};
      const ids = [];
      for (const [title, desc, price, duration, km, badge, provider, cat, icon, full] of SERVICES) {
        if (!providers[provider]) {
          const email = `demo-master-${Object.keys(providers).length + 1}@demo.local`;
          const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
          const created = await client.query(
            `INSERT INTO users (name, email, password_hash, role, verification_status)
             VALUES ($1,$2,$3,'master','verified')
             ON CONFLICT (email) DO UPDATE SET verification_status='verified' RETURNING id`,
            [provider, email, hash]);
          providers[provider] = created.rows[0].id;
        }
        const r = await client.query(
          `INSERT INTO services (master_id, category_id, title, description, full_desc, price, duration, city, km, badge, icon, provider_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'Алматы',$8,$9,$10,$11) RETURNING id`,
          [providers[provider], cats[cat], title, desc, full, price, duration, km, badge, icon, provider]);
        ids.push(r.rows[0].id);
      }
      // Демо-клиенты для отзывов: войти под ними нельзя (случайный пароль)
      const users = {};
      let n = 0;
      for (const [, name] of DEMO_REVIEWS) {
        if (users[name]) continue;
        n += 1;
        const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        const r = await client.query(
          `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'user')
           ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [name, `demo-client-${n}@demo.local`, hash]);
        users[name] = r.rows[0].id;
      }
      for (const [idx, name, rating, text] of DEMO_REVIEWS) {
        const service = await client.query('SELECT price, duration_minutes FROM services WHERE id=$1', [ids[idx - 1]]);
        await client.query(
          `INSERT INTO bookings (service_id, user_id, scheduled_at, address, price, duration_minutes, status, payment_status)
           VALUES ($1,$2,now() - INTERVAL '7 days','Демо-адрес', $3, $4, 'completed', 'paid')`,
          [ids[idx - 1], users[name], service.rows[0].price, service.rows[0].duration_minutes]);
        await client.query(
          'INSERT INTO reviews (service_id, user_id, rating, text) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
          [ids[idx - 1], users[name], rating, text]);
      }
      console.log(`Демо-данные: ${ids.length} услуг, ${DEMO_REVIEWS.length} отзыва`);
    }

    await client.query(fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'upgrade-v2.sql'), 'utf8'));
    await client.query('COMMIT');
    console.log('Готово ✔');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Ошибка инициализации БД:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}
main();
