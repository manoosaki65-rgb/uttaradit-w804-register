import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

// Runs the real application store in one transaction; successful checks also roll back.
export async function verifyWorkflows({store,transaction}) {
  const before=await store.list();
  const metadata=await store.metadata();
  let result;
  const rollback=Object.assign(new Error('Rollback verification transaction'),{verification:true});
  try {
    await transaction(async tx=>{
      const input={date:'2026-10-03',unit:'ทดสอบระบบ — rollback เท่านั้น',item:'รายการทดสอบชั่วคราว ไม่บันทึกจริง',amount:1};
      const key=randomUUID();const issued=await tx.issue(input,key);
      assert.equal(issued.no,metadata.next);
      assert.equal((await tx.issue(input,key)).id,issued.id);
      const edited=await tx.update(issued.id,{...input,item:'แก้ไขรายการทดสอบ — rollback',version:issued.version});
      assert.equal(edited.no,issued.no);
      const cancelled=await tx.cancel(issued.id,'ทดสอบยกเลิก — rollback เท่านั้น',edited.version);
      assert.equal(cancelled.cancelled,true);
      assert.equal((await tx.byNumber(issued.number)).id,issued.id);
      result={issued:issued.no,edit:true,cancel:true,idempotency:true,numberRetained:true,rolledBack:true};
      throw rollback;
    });
  } catch(error) {if(error!==rollback)throw error;}
  assert.deepEqual(await store.list(),before);
  assert.deepEqual(await store.metadata(),metadata);
  return {...result,masterUnchanged:true,next:metadata.next,records:before.length};
}
