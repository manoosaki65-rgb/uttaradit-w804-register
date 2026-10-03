import pg from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {sql} from 'drizzle-orm';
import {randomUUID,createHash} from 'node:crypto';
import {formatNumber,parseRecord,recordFields,sameMaster,validateMaster} from './domain.js';

export function guardedUrl(value) {
  if(!value)throw Error('W804_DATABASE_URL is required; no fallback to another database');
  const url=new URL(value);
  if(url.pathname!=='/w804_register')throw Error('W804 must connect only to its dedicated w804_register database');
  return value;
}
export function newPool(value){return new pg.Pool({connectionString:guardedUrl(value),max:5,connectionTimeoutMillis:15000,idleTimeoutMillis:30000,application_name:'uttaradit-w804'});}
export function httpError(message,status=400){return Object.assign(new Error(message),{status});}
const mapping={date:'date',unit:'unit',useLocation:'use_location',item:'item',amount:'amount',form2:'form2',inventoryNo:'inventory_no',note:'note',sourceEvidence:'source_evidence'};
const selection=sql.raw('id,number,date,unit,use_location AS "useLocation",item,amount,form2,inventory_no AS "inventoryNo",note,source_evidence AS "sourceEvidence",cancelled,cancel_reason AS "cancelReason",cancelled_at AS "cancelledAt",created_at AS "createdAt",updated_at AS "updatedAt",version');
const resultRows=async(db,query)=>(await db.execute(query)).rows.map(r=>({...r,amount:r.amount===undefined?undefined:Number(r.amount),number:r.number===undefined?undefined:Number(r.number),...(r.number===undefined?{}:{no:formatNumber(r.number)})}));

export function createStore(db) {
  const run=query=>resultRows(db,query);
  const get=async id=>(await run(sql`SELECT ${selection} FROM w804_records WHERE id=${id}`))[0];
  const byNumber=async number=>(await run(sql`SELECT ${selection} FROM w804_records WHERE number=${number}`))[0];
  const audit=(action,id,before,after)=>db.execute(sql`INSERT INTO w804_audit(id,record_id,action,before_data,after_data) VALUES(${randomUUID()},${id},${action},${JSON.stringify(before??null)}::jsonb,${JSON.stringify(after??null)}::jsonb)`);
  const lock=()=>db.execute(sql`SELECT next_number FROM w804_counter WHERE singleton=true FOR UPDATE`);
  const insert=async(record,number,requestKey=null)=>{
    const id=randomUUID();
    const keys=recordFields.map(k=>sql.identifier(mapping[k]));
    const values=recordFields.map(k=>sql`${record[k]}`);
    const r=(await run(sql`INSERT INTO w804_records(id,number,${sql.join(keys,sql`,`)},cancelled,cancel_reason,cancelled_at,request_key) VALUES(${id},${number},${sql.join(values,sql`,`)},${Boolean(record.cancelled)},${record.cancelReason||''},${record.cancelled?new Date():null},${requestKey}) RETURNING ${selection}`))[0];
    await audit(number<=36?'import-master':'issue',id,null,r);
    return r;
  };
  return {
    get,byNumber,lock,
    list:async()=>{
      const records=await run(sql`SELECT ${selection} FROM w804_records ORDER BY number DESC`);
      const docs=(await db.execute(sql`SELECT record_id,kind FROM w804_documents`)).rows;
      return records.map(r=>({...r,form1Path:docs.some(d=>d.record_id===r.id&&d.kind==='form1')?`/api/w804/${r.id}/documents/form1`:'',form2Path:docs.some(d=>d.record_id===r.id&&d.kind==='form2')?`/api/w804/${r.id}/documents/form2`:''}));
    },
    metadata:async()=>{
      const row=(await db.execute(sql`SELECT (SELECT next_number FROM w804_counter WHERE singleton=true) AS next_number,(SELECT count(*)::integer FROM w804_records WHERE number BETWEEN 1 AND 36) AS imported,(SELECT count(*)::integer FROM w804_reserved_numbers) AS reserved`)).rows[0];
      if(!row||!Number.isInteger(Number(row.next_number))||Number(row.next_number)<37)throw Error('W804 number counter is not initialized');
      return {next:formatNumber(row.next_number),masterImported:Number(row.imported),masterExpected:36,reservedNumbers:Number(row.reserved),permanentlyCancelled:['035','036']};
    },
    issue:async(input,requestKey)=>{
      const record=parseRecord(input);
      if('no' in input||'number' in input)throw httpError('เลขใหม่ออกอัตโนมัติ ห้ามระบุหรือเปลี่ยนเลขเอง');
      if(record.form2==='ยกเลิก')throw httpError('เพิ่มรายการก่อน แล้วใช้ปุ่มยกเลิกพร้อมเหตุผล');
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestKey||''))throw httpError('รหัสคำขอบันทึกไม่ถูกต้อง กรุณาลองใหม่');
      await lock();
      const previous=(await run(sql`SELECT ${selection} FROM w804_records WHERE request_key=${requestKey}`))[0];
      if(previous){if(!recordFields.every(k=>String(previous[k])===String(record[k])))throw httpError('คำขอนี้เคยบันทึกข้อมูลอีกชุดแล้ว',409);return previous;}
      const number=Number((await db.execute(sql`SELECT next_number FROM w804_counter WHERE singleton=true`)).rows[0].next_number);
      const r=await insert(record,number,requestKey);
      await db.execute(sql`UPDATE w804_counter SET next_number=next_number+1 WHERE singleton=true`);
      return r;
    },
    update:async(id,input)=>{
      if('no' in input||'number' in input||input.restore||input.cancelled===false)throw httpError('คงเลขและสถานะยกเลิกเดิมไว้ ห้ามออกเลขซ้ำหรือเปิดเลขยกเลิก');
      const old=await get(id);if(!old)throw httpError('ไม่พบรายการ',404);
      if(!Number.isInteger(input.version)||input.version!==old.version)throw httpError('รายการถูกแก้ไขแล้ว กรุณาโหลดใหม่ก่อนบันทึก',409);
      const r=parseRecord({...old,...input});
      if(r.form2==='ยกเลิก'&&!old.cancelled)throw httpError('ใช้ปุ่มยกเลิกเพื่อเก็บเหตุผล');
      if([35,36].includes(old.number)&&!r.note.includes('ยกเลิก'))r.note=[r.note,'ยกเลิก'].filter(Boolean).join(' · ');
      const updated=(await run(sql`UPDATE w804_records SET ${sql.join(recordFields.map(k=>sql`${sql.identifier(mapping[k])}=${r[k]}`),sql`,`)},updated_at=now(),version=version+1 WHERE id=${id} AND version=${input.version} RETURNING ${selection}`))[0];
      if(!updated)throw httpError('มีผู้แก้ไขรายการพร้อมกัน กรุณาโหลดใหม่',409);
      await audit('edit',id,old,updated);return updated;
    },
    cancel:async(id,reason,version)=>{
      if(typeof reason!=='string'||!reason.trim()||reason.length>2000)throw httpError('กรุณาระบุเหตุผลยกเลิก');
      const old=await get(id);if(!old)throw httpError('ไม่พบรายการ',404);
      if(old.cancelled)return old;
      if(!Number.isInteger(version)||old.version!==version)throw httpError('รายการถูกแก้ไขแล้ว กรุณาโหลดใหม่',409);
      const updated=(await run(sql`UPDATE w804_records SET cancelled=true,cancel_reason=${reason.trim()},cancelled_at=now(),updated_at=now(),version=version+1 WHERE id=${id} AND version=${version} RETURNING ${selection}`))[0];
      if(!updated)throw httpError('มีผู้แก้ไขรายการพร้อมกัน กรุณาโหลดใหม่',409);
      await audit('cancel',id,old,updated);return updated;
    },
    previewImport:async(rows)=>{
      const {records,errors}=validateMaster(rows);const incoming=[],alreadyImported=[];
      for(const r of records){const old=await byNumber(r.number);if(!old)incoming.push(r);else if(sameMaster(old,r))alreadyImported.push(r.no);else errors.push({no:r.no,error:'เลขนี้มีข้อมูลแล้วและข้อมูลไม่ตรงกัน จะไม่เขียนทับรายการเดิม'});}
      return {records:incoming,alreadyImported,errors,canImport:errors.length===0&&incoming.length>0};
    },
    importMaster:async(rows,sourceName,digest)=>{
      await lock();const preview=await createStore(db).previewImport(rows);
      if(preview.errors.length)throw httpError('ข้อมูล Import ไม่ผ่านการตรวจ: '+preview.errors.map(e=>e.no+': '+e.error).join('; '),409);
      const imported=[];for(const r of preview.records)imported.push(await insert(r,r.number));
      if(imported.length)await db.execute(sql`INSERT INTO w804_import_batches(id,source_name,file_sha256,imported_numbers) VALUES(${randomUUID()},${sourceName},${digest},ARRAY[${sql.join(imported.map(r=>sql`${r.number}`),sql`,`)}]::integer[])`);
      return {imported:imported.map(r=>r.no),alreadyImported:preview.alreadyImported};
    },
    attach:async(id,kind,filename,content)=>{
      if(!['form1','form2'].includes(kind)||!Buffer.isBuffer(content)||!content.length||content.length>12*1024*1024||content.subarray(0,5).toString()!=='%PDF-')throw httpError('รับเฉพาะ PDF จริงขนาดไม่เกิน 12 MB');
      const r=await get(id);if(!r)throw httpError('ไม่พบรายการ กรุณาบันทึกก่อนแนบไฟล์',404);
      const sha=createHash('sha256').update(content).digest('hex');
      await db.execute(sql`INSERT INTO w804_documents(id,record_id,kind,filename,content,sha256) VALUES(${randomUUID()},${id},${kind},${filename},${content},${sha}) ON CONFLICT(record_id,kind) DO UPDATE SET filename=excluded.filename,content=excluded.content,sha256=excluded.sha256,created_at=now()`);
      await audit('attach-'+kind,id,null,{kind,filename,sha256:sha,bytes:content.length});
      return {ok:true};
    },
    document:async(id,kind)=>(await db.execute(sql`SELECT filename,content,sha256 FROM w804_documents WHERE record_id=${id} AND kind=${kind}`)).rows[0],
    audit:async()=>(await db.execute(sql`SELECT action,record_id,created_at,before_data,after_data FROM w804_audit ORDER BY created_at DESC`)).rows,
  };
}

export function database(value){const pool=newPool(value);const db=drizzle(pool);return {pool,store:createStore(db),transaction:fn=>db.transaction(tx=>fn(createStore(tx)))};}
