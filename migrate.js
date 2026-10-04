import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {drizzle} from 'drizzle-orm/node-postgres';
import {sql} from 'drizzle-orm';
import {newPool} from './db.js';

export async function migrate(){
  const pool=newPool(process.env.W804_DATABASE_URL_UNPOOLED);
  try{
    const here=dirname(fileURLToPath(import.meta.url));
    const dir=resolve(here,'migrations');
    const files=(await readdir(dir)).filter(name=>name.endsWith('.sql')).sort();
    for(const name of files){
      const source=await readFile(resolve(dir,name),'utf8');
      await drizzle(pool).transaction(async tx=>{
        await tx.execute(sql.raw(source));
      });
      console.log(`W804 migration applied: ${name}`);
    }
    console.log('W804 schema and verified Master repair complete; numbers 035-036 remain cancelled; next new number is at least 037');
  }finally{await pool.end();}
}
if(process.argv[1]===fileURLToPath(import.meta.url))await migrate();
