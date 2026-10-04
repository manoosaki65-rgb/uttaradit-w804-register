import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {drizzle} from 'drizzle-orm/node-postgres';
import {sql} from 'drizzle-orm';
import {newPool} from './db.js';

export async function migrate(){
  const pool=newPool(process.env.W804_DATABASE_URL_UNPOOLED);
  try{
    const db=drizzle(pool);
    const here=dirname(fileURLToPath(import.meta.url));
    const dir=resolve(here,'migrations');
    const files=(await readdir(dir)).filter(name=>name.endsWith('.sql')).sort();
    for(const name of files){
      const source=await readFile(resolve(dir,name),'utf8');
      await db.transaction(async tx=>{
        await tx.execute(sql.raw(source));
      });
      console.log(`W804 migration applied: ${name}`);
    }
    const check=await db.execute(sql`
      SELECT
        count(*)::integer AS total,
        count(*) FILTER (WHERE number IN (35,36) AND cancelled)::integer AS cancelled_reserved,
        min(number)::integer AS min_number,
        max(number)::integer AS max_number,
        (SELECT next_number FROM w804_counter WHERE singleton=true)::integer AS next_number
      FROM w804_records
      WHERE number BETWEEN 1 AND 36
    `);
    const row=check.rows[0];
    const total=Number(row?.total||0);
    const cancelledReserved=Number(row?.cancelled_reserved||0);
    const minNumber=Number(row?.min_number||0);
    const maxNumber=Number(row?.max_number||0);
    const nextNumber=Number(row?.next_number||0);
    if(total!==36||cancelledReserved!==2||minNumber!==1||maxNumber!==36||nextNumber<37){
      throw new Error(`W804 Master verification failed: total=${total}, cancelledReserved=${cancelledReserved}, range=${minNumber}-${maxNumber}, next=${nextNumber}`);
    }
    console.log(`W804 Master verified: 36/36 records, 035-036 cancelled, next=${String(nextNumber).padStart(3,'0')}`);
  }finally{await pool.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await migrate();
