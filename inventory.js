import {httpError} from './db.js';
const source='https://uttaradit-inventory.pages.dev/api/current';
export async function lookupInventory(number,fetcher=fetch){
  if(!/^\d{2}-\d{4,8}$/.test(number))throw httpError('รูปแบบเลข Inventory ไม่ถูกต้อง เช่น 69-05508');
  for(let page=1;page<=20;page++){
    const url=new URL(source);url.search=new URLSearchParams({inventory:number,page:String(page),pageSize:'100'}).toString();
    const response=await fetcher(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw httpError('เชื่อมต่อทะเบียนรับ Inventory ไม่สำเร็จ',502);
    const payload=await response.json();if(!Array.isArray(payload.items))throw httpError('ข้อมูล Inventory ไม่ถูกต้อง',502);
    const matches=payload.items.filter(r=>String(r.inventory??'').trim()===number);
    if(matches.length>1)throw httpError('พบ Inventory ซ้ำ กรุณาตรวจรายการต้นทางก่อน',409);
    if(matches.length===1){const r=matches[0];return {found:true,source,fields:{inventoryNo:number,item:typeof r.item==='string'?r.item.trim():'',unit:typeof r.unit==='string'?r.unit.trim():'',amount:r.amount==null||r.amount===''?null:Number(r.amount),note:typeof r.note==='string'?r.note.trim():''}};}
    if(page>=Number(payload.pages||1))return {found:false,source,message:'ไม่พบเลข Inventory สามารถกรอกข้อมูลเองได้'};
  }
  throw httpError('ผลค้นหา Inventory มากเกินไป',502);
}
