// Isolated PostgreSQL schema. No application records are changed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env')});
const {Pool}=require('pg');
const bcrypt=require('bcryptjs');
const schema='cleanlink_test_'+Date.now();
const adminPool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
let server,db,base,checks=0;
async function check(label,fn){await fn();checks++;console.log('PASS '+label);}
async function call(method,url,body,session,options={}){
  const headers={'Content-Type':'application/json',Origin:base,...(session?{Cookie:session.cookie,'X-CSRF-Token':session.csrf}:{}),...options};
  const r=await fetch(base+'/api'+url,{method,headers,body:body?JSON.stringify(body):undefined});
  const data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
async function login(email){const r=await call('POST','/auth/login',{email,password:'Testing2026!'});assert.equal(r.status,200);return {cookie:r.cookie,csrf:r.data.csrf,user:r.data.user};}
async function main(){
  await adminPool.query(`CREATE SCHEMA "${schema}"`);
  process.env.PGOPTIONS=`-c search_path=${schema}`;
  process.env.PORT='4045';
  db=require('../src/db');
  assert.equal((await db.query('SELECT current_schema() AS s')).rows[0].s,schema,'Isolated schema must be selected');
  await db.query(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8'));
  await db.query(fs.readFileSync(path.join(__dirname,'../db/upgrade-v2.sql'),'utf8'));
  const hash=await bcrypt.hash('Testing2026!',10);
  const users={};for(const [name,role] of [['admin','admin'],['master','master'],['other','master'],['client','user']]){
    users[name]=(await db.query(`INSERT INTO users(name,email,password_hash,role,phone,verification_status) VALUES($1,$2,$3,$4,'+7 700 000 00 00',$5) RETURNING id`,[name,name+'@test.local',hash,role,role==='master'?'verified':'not_required'])).rows[0].id;
  }
  await db.query("INSERT INTO categories(slug,name) VALUES('apartment','Уборка квартиры')");
  const serviceId=(await db.query(`INSERT INTO services(master_id,category_id,title,price,extra_rate,duration_minutes,duration,included)
    VALUES($1,1,'Тестовая уборка',5000,100,120,'2 часа','["Полы"]') RETURNING id`,[users.master])).rows[0].id;
  const app=require('../src/app');server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${server.address().port}`;
  const admin=await login('admin@test.local'),master=await login('master@test.local'),other=await login('other@test.local'),client=await login('client@test.local');
  await check('PostgreSQL health',async()=>assert.equal((await call('GET','/health')).data.db,'up'));
  await check('Public service excludes account secrets',async()=>{const r=await call('GET','/services/'+serviceId);assert.equal(r.status,200);assert(!/password|email|token_version|clientPhone/i.test(JSON.stringify(r.data)));});
  await check('Category and city filters',async()=>assert.equal((await call('GET','/services?category=office')).data.length,0));
  await check('SQL injection is treated as search text',async()=>assert.equal((await call('GET',"/services?search="+encodeURIComponent("' OR 1=1 --"))).data.length,0));
  await check('Unknown service returns 404',async()=>assert.equal((await call('GET','/services/999999')).status,404));
  await check('Unauthenticated booking rejected',async()=>assert.equal((await call('POST','/bookings',{})).status,401));
  await check('Client cannot access admin users',async()=>assert.equal((await call('GET','/admin/users',null,client)).status,403));
  await check('Cookie mutations require CSRF token',async()=>assert.equal((await call('PATCH','/auth/me',{},client,{'X-CSRF-Token':''})).status,403));
  await check('Cross-origin mutation rejected',async()=>assert.equal((await call('POST','/auth/login',{},null,{Origin:'https://untrusted.example'})).status,403));
  await check('Cannot register admin role',async()=>{const r=await call('POST','/auth/register',{name:'New User',email:'new@test.local',password:'Testing2026!',role:'admin'});assert.equal(r.status,201);assert.equal(r.data.user.role,'user');});
  await check('Weak password rejected',async()=>assert.equal((await call('POST','/auth/register',{name:'New User',email:'weak@test.local',password:'123'})).status,400));
  await check('Duplicate email rejected',async()=>assert.equal((await call('POST','/auth/register',{name:'New User',email:'new@test.local',password:'Testing2026!'})).status,409));
  const day=new Date(Date.now()+5*3600000+3*86400000).toISOString().slice(0,10);
  const availability=(await call('GET',`/services/${serviceId}/availability?day=${day}&area=60&extras=oven`)).data;
  await check('Server computes area and extras price',async()=>{assert.equal(availability.quote.total,9000);assert.equal(availability.quote.duration,180);assert(availability.slots.length>0);});
  await check('Invalid dates rejected',async()=>assert.equal((await call('GET',`/services/${serviceId}/availability?day=2026-02-30&area=40`)).status,400));
  await check('Unknown extra rejected',async()=>assert.equal((await call('GET',`/services/${serviceId}/availability?day=${day}&area=40&extras=evil`)).status,400));
  const payload={serviceId,scheduledAt:availability.slots[0].startsAt,area:60,extras:['oven'],expectedTotal:9000,address:'Тестовая улица, дом 10',phone:'+7 700 000 00 00',comment:'Тест'};
  await check('Price tampering rejected',async()=>assert.equal((await call('POST','/bookings',{...payload,expectedTotal:1},client)).status,409));
  const concurrent=await Promise.all([call('POST','/bookings',payload,client),call('POST','/bookings',payload,client)]);
  await check('Concurrent booking: one succeeds, one conflicts',async()=>assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]));
  const bid=concurrent.find(x=>x.status===201).data.id;
  await check('Overlapping interval rejected',async()=>assert.equal((await call('POST','/bookings',{...payload,scheduledAt:availability.slots[1].startsAt},client)).status,409));
  await check('Other master cannot change booking',async()=>assert.equal((await call('PATCH',`/bookings/${bid}/status`,{status:'confirmed'},other)).status,403));
  await check('Assigned master confirms booking',async()=>assert.equal((await call('PATCH',`/bookings/${bid}/status`,{status:'confirmed'},master)).status,200));
  await check('Cannot complete a future booking',async()=>assert.equal((await call('PATCH',`/bookings/${bid}/status`,{status:'completed'},master)).status,400));
  await check('Cannot review unfinished booking',async()=>assert.equal((await call('POST',`/services/${serviceId}/reviews`,{rating:5,text:'Good'},client)).status,403));
  await check('Booking price remains fixed after service edit',async()=>{await db.query('UPDATE services SET price=7000 WHERE id=$1',[serviceId]);const r=await call('GET','/bookings/my',null,client);assert.equal(r.data[0].price,9000);});
  await db.query("UPDATE bookings SET scheduled_at=now()-interval '1 day' WHERE id=$1",[bid]);
  await check('Late client cancellation rejected',async()=>assert.equal((await call('PATCH',`/bookings/${bid}/status`,{status:'cancelled'},client)).status,400));
  await check('Complete past confirmed booking',async()=>assert.equal((await call('PATCH',`/bookings/${bid}/status`,{status:'completed'},master)).status,200));
  await check('Completed booking cannot return to confirmed',async()=>assert.equal((await call('PATCH',`/bookings/${bid}/status`,{status:'confirmed'},master)).status,400));
  await check('Review after completed booking succeeds',async()=>assert.equal((await call('POST',`/services/${serviceId}/reviews`,{rating:5,text:'Хорошая уборка'},client)).status,201));
  await check('Ratings use saved reviews',async()=>assert.equal((await call('GET','/services/'+serviceId)).data.rating,5));
  await check('Master marks payment received',async()=>assert.equal((await call('PATCH',`/bookings/${bid}/payment`,{},master)).status,200));
  await check('Admin total counts paid completed bookings',async()=>assert.equal((await call('GET','/admin/stats',null,admin)).data.revenue,9000));
  await check('Notifications reach client',async()=>assert((await call('GET','/notifications',null,client)).data.length>=2));
  await check('Profile update persists',async()=>{const r=await call('PATCH','/auth/me',{name:'Обновлённый клиент',phone:'+7 701 000 00 00'},client);assert.equal(r.data.user.name,'Обновлённый клиент');});
  await check('Hide service without losing history',async()=>{assert.equal((await call('PATCH',`/services/${serviceId}/active`,{active:false},master)).status,200);assert.equal((await call('GET','/services/'+serviceId)).status,404);assert.equal((await call('GET','/bookings/my',null,client)).data.length,1);});
  await check('Logout revokes old session',async()=>{assert.equal((await call('POST','/auth/logout',{},client)).status,200);assert.equal((await call('GET','/auth/me',null,client)).status,401);});
  console.log(`\n${checks} checks passed. Application data unchanged.`);
}
main().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;}).finally(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(db)await db.pool.end();
  if(!/^cleanlink_test_\d+$/.test(schema))throw new Error('Unsafe test schema');
  await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await adminPool.end();
});
