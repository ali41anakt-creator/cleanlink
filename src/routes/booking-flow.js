const router = require('express').Router();
const db = require('../db');
const { HttpError, wrap, str, id } = require('../utils');
const { authRequired, requireRole } = require('../middleware/auth');
const { quote, availableSlots } = require('../pricing');

const SELECT = `SELECT b.id,b.status,b.scheduled_at AS "scheduledAt",b.address,b.comment,b.price,
  b.duration_minutes AS "durationMinutes",b.payment_method AS "paymentMethod",b.payment_status AS "paymentStatus",
  b.created_at AS "createdAt",b.service_id AS "serviceId",COALESCE(b.service_title,s.title) AS "serviceTitle",
  s.category_id AS "categoryId",b.master_id AS "masterId",u.name AS "clientName",COALESCE(NULLIF(b.phone,''),u.phone) AS "clientPhone",
  m.name AS "masterName",b.area,b.extras,
  EXISTS(SELECT 1 FROM reviews r WHERE r.service_id=b.service_id AND r.user_id=b.user_id) AS "hasReview"
  FROM bookings b JOIN services s ON s.id=b.service_id JOIN users u ON u.id=b.user_id LEFT JOIN users m ON m.id=b.master_id`;

async function transact(fn) {
  const client = await db.pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function notification(client, userId, bookingId, type, message) {
  if (userId) await client.query('INSERT INTO notifications(user_id,booking_id,type,message) VALUES($1,$2,$3,$4)', [userId,bookingId,type,message.slice(0,300)]);
}
router.post('/', authRequired, requireRole('user'), wrap(async (req,res) => {
  const serviceId = id(req.body.serviceId);
  const address = str(req.body.address, { min:8,max:250,field:'Адрес' });
  const phone = str(req.body.phone || req.user.phone || '', { min:10,max:30,field:'Телефон' });
  if (!/^[+\d ()-]+$/.test(phone) || phone.replace(/\D/g,'').length < 10) throw new HttpError(400,'Некорректный телефон');
  const comment = str(req.body.comment || '', { max:500,field:'Комментарий' });
  const when = new Date(req.body.scheduledAt);
  if (Number.isNaN(+when)) throw new HttpError(400,'Некорректная дата');
  const day = new Date(+when + 5 * 3600000).toISOString().slice(0,10);
  const booking = await transact(async client => {
    const { rows } = await client.query(`SELECT s.* FROM services s JOIN users u ON u.id=s.master_id
      WHERE s.id=$1 AND s.is_active AND u.verification_status='verified' FOR SHARE OF s,u`, [serviceId]);
    const s = rows[0];
    if (!s) throw new HttpError(404,'Услуга недоступна');
    // One PostgreSQL transaction lock per master: simultaneous requests cannot both reserve a slot.
    await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [s.master_id]);
    const calculated = quote(s, req.body.area ?? 40, req.body.extras ?? []);
    const busy = await client.query("SELECT scheduled_at,duration_minutes FROM bookings WHERE master_id=$1 AND status IN ('pending','confirmed')", [s.master_id]);
    if (!availableSlots(day,calculated.duration,busy.rows).some(x=>x.startsAt===when.toISOString())) throw new HttpError(409,'Время уже занято или недоступно. Выберите другой слот.');
    if (Number(req.body.expectedTotal) !== calculated.total) throw new HttpError(409,'Стоимость изменилась. Обновите расчёт перед оформлением.');
    const result = await client.query(`INSERT INTO bookings(service_id,user_id,master_id,service_title,scheduled_at,address,phone,comment,price,duration_minutes,area,extras,payment_method)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'cash_after_service') RETURNING id`,
      [s.id,req.user.id,s.master_id,s.title,when.toISOString(),address,phone,comment,calculated.total,calculated.duration,calculated.area,JSON.stringify(calculated.extras)]);
    const bid = result.rows[0].id;
    await client.query("INSERT INTO booking_events(booking_id,status,actor_id) VALUES($1,'pending',$2)", [bid,req.user.id]);
    await notification(client,s.master_id,bid,'new_booking',`Новая заявка: ${s.title}. Подтвердите время в кабинете.`);
    return { id:bid, price:calculated.total };
  });
  res.status(201).json(booking);
}));
router.get('/my',authRequired,requireRole('user'),wrap(async(req,res)=>{
  res.json((await db.query(`${SELECT} WHERE b.user_id=$1 ORDER BY b.created_at DESC`,[req.user.id])).rows);
}));
router.get('/incoming',authRequired,requireRole('master','admin'),wrap(async(req,res)=>{
  res.json((await db.query(`${SELECT} ${req.user.role==='admin'?'':'WHERE b.master_id=$1'} ORDER BY b.created_at DESC`,req.user.role==='admin'?[]:[req.user.id])).rows);
}));
router.patch('/:id/status',authRequired,wrap(async(req,res)=>{
  const bid=id(req.params.id), next=req.body.status;
  await transact(async client=>{
    const {rows}=await client.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE',[bid]);
    const b=rows[0];
    if(!b) throw new HttpError(404,'Заказ не найден');
    const staff=req.user.role==='admin'||(req.user.role==='master'&&b.master_id===req.user.id);
    const owner=req.user.role==='user'&&b.user_id===req.user.id;
    if(!staff&&!owner) throw new HttpError(403,'Нет доступа к чужому заказу');
    const allowed=staff?{pending:['confirmed','cancelled'],confirmed:['completed','cancelled']}:{pending:['cancelled'],confirmed:['cancelled']};
    if(!allowed[b.status]?.includes(next)) throw new HttpError(400,'Такой переход статуса недоступен');
    if(owner&&+new Date(b.scheduled_at)-Date.now()<3*3600000) throw new HttpError(400,'До уборки меньше трёх часов. Обратитесь к исполнителю для отмены.');
    if(next==='completed'&&Date.now()<+new Date(b.scheduled_at)+b.duration_minutes*60000) throw new HttpError(400,'Завершить заказ можно после окончания запланированной уборки');
    await client.query('UPDATE bookings SET status=$1 WHERE id=$2',[next,bid]);
    await client.query('INSERT INTO booking_events(booking_id,status,actor_id) VALUES($1,$2,$3)',[bid,next,req.user.id]);
    const label={confirmed:'подтверждён',completed:'выполнен',cancelled:'отменён'}[next];
    await notification(client,staff?b.user_id:b.master_id,bid,'booking_status',`Заказ №${bid} ${label}.`);
  });
  res.json({ok:true,status:next});
}));
router.patch('/:id/payment',authRequired,requireRole('master','admin'),wrap(async(req,res)=>{
  const bid=id(req.params.id);
  const r=await db.query(`UPDATE bookings SET payment_status='paid' WHERE id=$1 AND status='completed'
    AND ($2::boolean OR master_id=$3) RETURNING id`,[bid,req.user.role==='admin',req.user.id]);
  if(!r.rowCount) throw new HttpError(400,'Оплата доступна только для выполненного заказа вашего исполнителя');
  res.json({ok:true});
}));
module.exports=router;
