import test from 'node:test';
import assert from 'node:assert/strict';
import {dateInDays,durationDays,parseRecord,normalizeMaster,validateMaster,parseCsv,tableToMaster,importColumns} from '../domain.js';
import {guardedUrl} from '../db.js';
import {lookupInventory} from '../inventory.js';

const fixture={no:'035',date:'2026-10-03',unit:'fixture only',item:'rollback test only',amount:'1.25',sourceEvidence:'B1-035.pdf'};
test('validates dates and amount without guessing missing fields',()=>{
  assert.equal(dateInDays('19 ก.พ. 69'),dateInDays('2026-02-19'));
  assert.equal(dateInDays('31 ก.พ. 69'),null);
  assert.equal(dateInDays('2026-02-29'),null);
  assert.equal(durationDays('2026-10-01','2026-10-03'),2);
  assert.equal(durationDays('2026-10-03','2026-10-01'),null);
  assert.throws(()=>parseRecord({...fixture,amount:50000.01}),/50,000/);
  assert.throws(()=>parseRecord({...fixture,unit:''}),/หน่วยงาน/);
  assert.throws(()=>parseRecord({...fixture,amount:'1.234'}),/2 ตำแหน่ง/);
});
test('35 and 36 are permanently cancelled on import; 37 is not an importable Master number',()=>{
  for(const number of [35,36]){const r=normalizeMaster({...fixture,no:String(number),sourceEvidence:`B1-0${number}.pdf`,cancelled:false});assert.equal(r.cancelled,true);assert.match(r.note,/ยกเลิก/);}
  assert.throws(()=>normalizeMaster({...fixture,no:'037'}),/001–036/);
  assert.throws(()=>normalizeMaster({...fixture,sourceEvidence:'unknown.pdf'}),/B1-035/);
  assert.equal(validateMaster([fixture,fixture]).errors.length,1);
  assert.throws(()=>validateMaster([]),/ข้อมูลจริง/);
});
test('CSV handles Thai text, quoted delimiters and newlines; empty template creates no records',()=>{
  const table=parseCsv('\uFEFFno,unit,item,amount,sourceEvidence\r\n001,หน่วยงาน,"รายการ, มีสองชิ้น\nบรรทัดใหม่",125,Master.xlsx\r\n');
  const rows=tableToMaster(table);assert.equal(rows.length,1);assert.match(rows[0].item,/สองชิ้น\n/);
  assert.throws(()=>tableToMaster(parseCsv(importColumns.join(',')+'\n')),/ไม่มีรายการ/);
  assert.throws(()=>parseCsv('a,"unclosed'),/คำพูด/);
});
test('W804 refuses announcement database and generic DATABASE_URL fallback',()=>{
  assert.throws(()=>guardedUrl(undefined),/no fallback/);
  assert.throws(()=>guardedUrl('postgresql://example:secret@localhost/announcement_register'),/dedicated/);
  assert.equal(guardedUrl('postgresql://example:secret@localhost/w804_register'),'postgresql://example:secret@localhost/w804_register');
});
test('Inventory integration uses only GET, matches exact numbers, preserves document dates',async()=>{
  const calls=[];
  const fake=async(url,options)=>{calls.push({url:String(url),options});return Response.json({items:[{inventory:'69-05508',item:'source item',unit:'source unit',amount:54000,note:'source note'}],pages:1});};
  const r=await lookupInventory('69-05508',fake);
  assert.equal(r.fields.item,'source item');assert.equal(r.fields.amount,54000);assert.equal(r.fields.date,undefined);assert.equal(r.fields.form2,undefined);
  assert.equal(calls[0].options.method,'GET');assert.match(calls[0].url,/inventory=69-05508/);
  const missing=await lookupInventory('69-00000',fake);assert.equal(missing.found,false);
});
