import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {drizzle} from 'drizzle-orm/node-postgres';
import {sql} from 'drizzle-orm';
import {newPool} from './db.js';
export async function migrate(){
  const pool=newPool(process.env.W804_DATABASE_URL_UNPOOLED);
  try{
    const source=await readFile(fileURLToPath(new URL('./migrations/001_w804.sql',import.meta.url)),'utf8');
    await drizzle(pool).transaction(async tx=>{
      await tx.execute(sql.raw(source));
    });
    console.log('W804 schema ready; reservations 001–036; next new number 037 on first initialization; no Master records imported');
  }finally{await pool.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await migrate();
