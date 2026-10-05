// Separate temporary schema for browser testing. Never uses production records.
const fs=require('node:fs');
const path=require('node:path');
require('dotenv').config({path:path.join(__dirname,'../.env')});
const {Pool}=require('pg');
const bcrypt=require('bcryptjs');
const schema='cleanlink_ui_'+Date.now();
const connection={connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined};
const manager=new Pool(connection);
async function main(){
  await manager.query(`CREATE SCHEMA "${schema}"`);
  process.env.PGOPTIONS=`-c search_path=${schema}`;
  const db=require('../src/db');
  await db.query(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8'));
  await db.query(fs.readFileSync(path.join(__dirname,'../db/upgrade-v2.sql'),'utf8'));
  const hash=await bcrypt.hash('Testing2026!',10);
  for(const [name,role] of [['admin','admin'],['master','master'],['client','user']])await db.query(`INSERT INTO users(name,email,password_hash,role,phone,verification_status)
    VALUES($1,$2,$3,$4,'+7 700 000 00 00',$5)`,[name==='client'?'Алия':name==='master'?'Айдана':'Администратор',name+'@test.local',hash,role,role==='master'?'verified':'not_required']);
  await db.query("INSERT INTO categories(slug,name) VALUES('apartment','Уборка квартиры'),('office','Уборка офиса')");
  await db.query(`INSERT INTO services(master_id,category_id,title,description,full_desc,price,extra_rate,duration,duration_minutes,provider_name,included,excluded)
    VALUES(2,1,'Лёгкость каждый день','Уборка квартиры с заботой о деталях.','Полы, кухня, санузел и доступные поверхности. Средства и инвентарь включены.',5000,100,'2 часа',120,'Айдана','["Влажная уборка пола","Пыль на поверхностях","Кухня и санузел","Инвентарь и средства"]','["Окна и балкон","Уборка внутри техники"]')`);
  const app=require('../src/app');
  const server=app.listen(Number(process.env.PORT||4032),'127.0.0.1',()=>console.log(`UI test server: ${server.address().port}; schema: ${schema}`));
  const cleanup=()=>server.close(async()=>{await db.pool.end();await manager.query(`DROP SCHEMA "${schema}" CASCADE`);await manager.end();process.exit(0);});
  process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;});
