// Сквозная проверка API. Запуск: сервер должен работать, затем `npm run test:smoke`
const BASE = process.env.BASE_URL || 'http://localhost:3000/api';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@cleanlink.kz', password: process.env.ADMIN_PASSWORD || 'ChangeMe_Admin123' };
let failed = 0;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
function check(name, cond, extra = '') {
  console.log(`${cond ? '✔' : '✘'} ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failed++;
}

(async () => {
  const sfx = Date.now();
  const h = await call('GET', '/health');
  check('health: БД доступна', h.status === 200 && h.data.db === 'up');

  const cats = await call('GET', '/categories');
  check('категории загружены', cats.data.length === 4);

  const list = await call('GET', '/services');
  check('список услуг (8 демо)', list.data.length >= 8);
  const f = await call('GET', '/services?category=office&maxPrice=9000&minRating=4.5');
  check('фильтры работают', f.status === 200 && f.data.every(s => s.category === 'office' && s.price <= 9000));
  const inj = await call('GET', "/services?search=' OR 1=1 --");
  check('SQL-инъекция в поиске не срабатывает', inj.status === 200 && inj.data.length === 0);

  // регистрация / вход
  const client = await call('POST', '/auth/register', { body: { name: 'Тест Клиент', email: `client${sfx}@t.kz`, password: 'password123' } });
  check('регистрация клиента', client.status === 201 && client.data.user.role === 'user');
  const dup = await call('POST', '/auth/register', { body: { name: 'Тест Клиент', email: `client${sfx}@t.kz`, password: 'password123' } });
  check('дубликат email → 409', dup.status === 409);
  const weak = await call('POST', '/auth/register', { body: { name: 'X Y', email: `w${sfx}@t.kz`, password: '123' } });
  check('короткий пароль → 400', weak.status === 400);
  const evil = await call('POST', '/auth/register', { body: { name: 'Хакер', email: `evil${sfx}@t.kz`, password: 'password123', role: 'admin' } });
  check('нельзя зарегистрироваться админом', evil.data.user.role === 'user');
  const master = await call('POST', '/auth/register', { body: { name: 'Мастер Тест', email: `master${sfx}@t.kz`, password: 'password123', role: 'master' } });
  check('регистрация мастера', master.data.user.role === 'master');
  const bad = await call('POST', '/auth/login', { body: { email: `client${sfx}@t.kz`, password: 'wrongpass' } });
  check('неверный пароль → 401', bad.status === 401);
  const login = await call('POST', '/auth/login', { body: { email: `client${sfx}@t.kz`, password: 'password123' } });
  check('вход', login.status === 200 && !!login.data.token);
  const T = { c: login.data.token, m: master.data.token };
  const me = await call('GET', '/auth/me', { token: T.c });
  check('/auth/me', me.data.user.email === `client${sfx}@t.kz`);
  const adm = await call('POST', '/auth/login', { body: ADMIN });
  check('вход администратора', adm.status === 200 && adm.data.user.role === 'admin');
  T.a = adm.data.token;
  const verifyMaster = await call('PATCH', `/admin/users/${master.data.user.id}/verification`, { token: T.a, body: { status: 'verified' } });
  check('админ подтверждает мастера', verifyMaster.status === 200);

  // права
  const noAuth = await call('POST', '/bookings', { body: {} });
  check('заказ без входа → 401', noAuth.status === 401);
  const clientCreates = await call('POST', '/services', { token: T.c, body: {} });
  check('клиент не создаёт услуги → 403', clientCreates.status === 403);
  const clientAdmin = await call('GET', '/admin/users', { token: T.c });
  check('клиент не видит админку → 403', clientAdmin.status === 403);

  // мастер создаёт услугу
  const sv = await call('POST', '/services', { token: T.m, body: { title: 'Тестовая уборка', category: 'apartment', price: 6500, duration: '2 часа', desc: 'тест', fullDesc: 'полное описание' } });
  check('мастер создаёт услугу', sv.status === 201);
  const sid = sv.data.id;
  const upd = await call('PUT', `/services/${sid}`, { token: T.m, body: { title: 'Тестовая уборка+', category: 'apartment', price: 7000 } });
  check('мастер правит свою услугу', upd.status === 200);
  const other = await call('POST', '/auth/register', { body: { name: 'Другой Мастер', email: `m2${sfx}@t.kz`, password: 'password123', role: 'master' } });
  const foreign = await call('PUT', `/services/${sid}`, { token: other.data.token, body: { title: 'Взлом', category: 'apartment', price: 1 } });
  check('чужую услугу править нельзя → 403', foreign.status === 403);
  const mine = await call('GET', '/services/mine', { token: T.m });
  check('/services/mine', mine.data.length === 1 && mine.data[0].price === 7000);

  // заказ
  const soon = new Date(Date.now() + 30 * 60000).toISOString();
  const early = await call('POST', '/bookings', { token: T.c, body: { serviceId: sid, scheduledAt: soon, address: 'Абая 1, кв 5' } });
  check('заказ «через 30 минут» отклонён', early.status === 400);
  const when = new Date(Date.now() + 86400000).toISOString();
  const bk = await call('POST', '/bookings', { token: T.c, body: { serviceId: sid, scheduledAt: when, address: 'Абая 1, кв 5', comment: 'домофон 12' } });
  check('клиент создаёт заказ', bk.status === 201);
  const bid = bk.data.id;
  const overlap = await call('POST', '/bookings', { token: T.c, body: { serviceId: sid, scheduledAt: when, address: 'Абая 2, кв 7' } });
  check('пересекающийся слот мастера → 409', overlap.status === 409);
  const early2 = await call('POST', `/services/${sid}/reviews`, { token: T.c, body: { rating: 5, text: 'рано' } });
  check('отзыв до выполнения → 403', early2.status === 403);
  const skip = await call('PATCH', `/bookings/${bid}/status`, { token: T.m, body: { status: 'completed' } });
  check('pending → completed напрямую нельзя', skip.status === 400);
  const stranger = await call('PATCH', `/bookings/${bid}/status`, { token: other.data.token, body: { status: 'confirmed' } });
  check('чужой мастер не меняет статус → 403', stranger.status === 403);
  const inc = await call('GET', '/bookings/incoming', { token: T.m });
  check('мастер видит входящий заказ', inc.data.length === 1 && inc.data[0].clientName === 'Тест Клиент');
  const conf = await call('PATCH', `/bookings/${bid}/status`, { token: T.m, body: { status: 'confirmed' } });
  check('мастер подтверждает', conf.status === 200);
  const done = await call('PATCH', `/bookings/${bid}/status`, { token: T.m, body: { status: 'completed' } });
  check('мастер завершает', done.status === 200);
  const canc = await call('PATCH', `/bookings/${bid}/status`, { token: T.c, body: { status: 'cancelled' } });
  check('нельзя отменить завершённый → 400', canc.status === 400);

  // отзыв
  const det = await call('GET', `/services/${sid}`, { token: T.c });
  check('canReview=true после выполнения', det.data.canReview === true);
  const rv = await call('POST', `/services/${sid}/reviews`, { token: T.c, body: { rating: 4, text: '<b>норм</b>' } });
  check('клиент оставляет отзыв', rv.status === 201);
  const det2 = await call('GET', `/services/${sid}`);
  check('рейтинг пересчитан из БД', det2.data.rating === 4 && det2.data.reviews === 1 && det2.data.reviewsList[0].name === 'Тест Клиент');

  const my = await call('GET', '/bookings/my', { token: T.c });
  check('«Мои заказы»', my.data.length === 1 && my.data[0].status === 'completed');

  // админ
  const st = await call('GET', '/admin/stats', { token: T.a });
  check('статистика админа', st.status === 200 && st.data.revenue >= 7000);
  const us = await call('GET', '/admin/users', { token: T.a });
  const target = us.data.find(u => u.email === `evil${sfx}@t.kz`);
  const rr = await call('PATCH', `/admin/users/${target.id}/role`, { token: T.a, body: { role: 'master' } });
  check('админ меняет роль', rr.status === 200);
  const self = await call('PATCH', `/admin/users/${adm.data.user.id}/role`, { token: T.a, body: { role: 'user' } });
  check('админ не меняет свою роль', self.status === 400);

  // удаление
  const del = await call('DELETE', `/services/${sid}`, { token: T.m });
  check('мастер удаляет услугу (soft)', del.status === 200);
  const gone = await call('GET', `/services/${sid}`);
  check('удалённая услуга → 404', gone.status === 404);

  const badTok = await call('GET', '/auth/me', { token: 'abc.def.ghi' });
  check('битый токен → 401', badTok.status === 401);
  const badJson = await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  check('битый JSON → 400', badJson.status === 400);

  console.log(failed ? `\nПровалено проверок: ${failed}` : '\nВсе проверки пройдены ✔');
  process.exit(failed ? 1 : 0);
})();
