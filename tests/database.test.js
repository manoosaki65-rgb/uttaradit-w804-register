import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {drizzle} from 'drizzle-orm/node-postgres';
import {createStore,newPool} from '../db.js';
const enabled=Boolean(process.env.W804_DATABASE_URL_UNPOOLED);

test('real PostgreSQL transaction: numbering, edits, cancellation, retry and durable PDF; rollback all fixture records',{skip:!enabled},async()=>{
  const pool=newPool(process.env.W804_DATABASE_URL_UNPOOLED);const client=await pool.connect();
  try{
    const before=(await client.query('SELECT count(*)::int AS count FROM w804_records')).rows[0].count;
    const documentsBefore=(await client.query('SELECT count(*)::int AS count FROM w804_documents')).rows[0].count;
    const counter=(await client.query('SELECT next_number FROM w804_counter')).rows[0].next_number;
    await client.query('BEGIN');const store=createStore(drizzle(client));
    const fixture={date:'2026-10-03',unit:'automated fixture; rollback only',item:'not Master; never committed',amount:1.25};
    const key=randomUUID();const first=await store.issue(fixture,key);const retry=await store.issue(fixture,key);
    assert.equal(first.id,retry.id);assert.equal(first.number,counter);
    const second=await store.issue({...fixture,item:'second uncommitted fixture'},randomUUID());assert.equal(second.number,counter+1);
    const edited=await store.update(first.id,{...fixture,item:'edited uncommitted fixture',version:first.version});assert.equal(edited.no,first.no);
    await assert.rejects(()=>store.update(first.id,{...fixture,version:first.version}),/โหลดใหม่/);
    const cancelled=await store.cancel(first.id,'uncommitted fixture cancellation',edited.version);assert.equal(cancelled.cancelled,true);
    await assert.rejects(()=>store.update(first.id,{...fixture,version:cancelled.version,restore:true}),/ห้าม/);
    assert.equal((await store.metadata()).next,String(counter+2).padStart(3,'0'));
    const pdf=Buffer.from('%PDF-1.4\n% uncommitted test PDF\n%%EOF');await store.attach(first.id,'form1','fixture.pdf',pdf);
    assert.deepEqual((await store.document(first.id,'form1')).content,pdf);
    await client.query('ROLLBACK');
    assert.equal((await client.query('SELECT count(*)::int AS count FROM w804_records')).rows[0].count,before);
    assert.equal((await client.query('SELECT next_number FROM w804_counter')).rows[0].next_number,counter);
    assert.equal((await client.query('SELECT count(*)::int AS count FROM w804_documents')).rows[0].count,documentsBefore);
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release();await pool.end();}
});
test('counter lock blocks another writer until transaction ends; no number consumed',{skip:!enabled},async()=>{
  const pool=newPool(process.env.W804_DATABASE_URL_UNPOOLED);const a=await pool.connect(),b=await pool.connect();
  try{
    await a.query('BEGIN');await b.query('BEGIN');await b.query("SET LOCAL lock_timeout = '150ms'");
    await a.query('SELECT next_number FROM w804_counter WHERE singleton=true FOR UPDATE');
    await assert.rejects(()=>b.query('SELECT next_number FROM w804_counter WHERE singleton=true FOR UPDATE'),e=>e.code==='55P03');
  }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();await pool.end();}
});
test('Master 035 import cancellation and replay validation inside rolled-back transaction',{skip:!enabled},async t=>{
  const pool=newPool(process.env.W804_DATABASE_URL_UNPOOLED);const client=await pool.connect();
  try{
    await client.query('BEGIN');const store=createStore(drizzle(client));
    if(await store.byNumber(35)){t.skip('Actual Master 035 already exists; no fixture import attempted');return;}
    const row={no:'035',date:'2026-10-03',unit:'uncommitted validation fixture',item:'not real Master',amount:1,sourceEvidence:'B1-035.pdf'};
    const counter=(await store.metadata()).next;
    await store.importMaster([row],'rollback-only.json','test-only-digest');
    const r=await store.byNumber(35);assert.equal(r.cancelled,true);assert.match(r.note,/ยกเลิก/);
    assert.deepEqual((await store.previewImport([row])).alreadyImported,['035']);
    assert.equal((await store.previewImport([{...row,item:'conflicting'}])).canImport,false);
    assert.equal((await store.metadata()).next,counter);
    await client.query('SAVEPOINT number_guard');
    await assert.rejects(()=>client.query('UPDATE w804_records SET number=99 WHERE id=$1',[r.id]),/cannot be changed/);
    await client.query('ROLLBACK TO SAVEPOINT number_guard');
    await client.query('SAVEPOINT delete_guard');
    await assert.rejects(()=>client.query('DELETE FROM w804_records WHERE id=$1',[r.id]),/cannot be deleted/);
    await client.query('ROLLBACK TO SAVEPOINT delete_guard');
  }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});
