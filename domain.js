function invalid(message){return Object.assign(new Error(message),{status:400});}
export const FIRST_NEW_NUMBER = 37;
export const MASTER_LAST_NUMBER = 36;
export const recordFields = ['date','unit','useLocation','item','amount','form2','inventoryNo','note','sourceEvidence'];
const months = {'ม.ค.':1,'ก.พ.':2,'มี.ค.':3,'เม.ย.':4,'พ.ค.':5,'มิ.ย.':6,'ก.ค.':7,'ส.ค.':8,'ก.ย.':9,'ต.ค.':10,'พ.ย.':11,'ธ.ค.':12};
export function dateInDays(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const value=raw.trim().replace(/\s+/g,' ');
  let y,m,d;
  const iso=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const thai=value.match(/^(\d{1,2})\s+(\S+)\s+(\d{2,4})$/);
  if(iso){y=Number(iso[1]);m=Number(iso[2]);d=Number(iso[3]);}
  else if(thai){d=Number(thai[1]);m=months[thai[2]];y=Number(thai[3]);if(y<100)y+=2500;if(y>2400)y-=543;}
  else return null;
  if(!m || y<1900 || y>2200)return null;
  const ms=Date.UTC(y,m-1,d),check=new Date(ms);
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)return null;
  return ms/86400000;
}
export function durationDays(first,second){const a=dateInDays(first),b=dateInDays(second);return a===null||b===null||b<a?null:b-a;}
export function formatNumber(number){return String(number).padStart(3,'0');}
export function parseRecord(input) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw invalid('ข้อมูลรายการไม่ถูกต้อง');
  const r={};
  for(const key of recordFields.filter(k=>k!=='amount')){
    const value=input[key]??'';
    if(typeof value!=='string'||value.length>2000)throw invalid(`ช่อง ${key} ต้องเป็นข้อความไม่เกิน 2,000 ตัวอักษร`);
    r[key]=value.trim();
  }
  if(!r.unit||!r.item)throw invalid('กรุณาระบุหน่วยงานผู้ขอและรายการ');
  const amount=typeof input.amount==='string'?input.amount.replace(/,/g,'').trim():input.amount;
  if((typeof amount!=='number'&&typeof amount!=='string')||!/^\d+(?:\.\d{1,2})?$/.test(String(amount)))throw invalid('วงเงินต้องเป็นจำนวนเงินที่ถูกต้อง ทศนิยมไม่เกิน 2 ตำแหน่ง');
  r.amount=Number(amount);
  if(r.amount<=0||r.amount>50000)throw invalid('วงเงิน ว804 ต้องมากกว่า 0 และไม่เกิน 50,000 บาท');
  for(const key of ['date','form2'])if(r[key]&&dateInDays(r[key])===null && !(key==='form2'&&r[key]==='ยกเลิก'))throw invalid(`วันที่ ${key} ไม่ถูกต้อง ใช้ YYYY-MM-DD หรือ เช่น 19 ก.พ. 69`);
  if(r.date&&r.form2&&r.form2!=='ยกเลิก'&&durationDays(r.date,r.form2)===null)throw invalid('วันที่รับฟอร์ม 2 ต้องไม่ก่อนวันที่รับฟอร์ม 1');
  return r;
}
export function normalizeMaster(input) {
  const raw=String(input?.no??'').trim().replace(/^ว804\s*\/\s*/, '');
  if(!/^\d{1,3}$/.test(raw))throw invalid('เลข Master ต้องอยู่ระหว่าง 001–036');
  const number=Number(raw);
  if(number<1||number>MASTER_LAST_NUMBER)throw invalid('Import Master ได้เฉพาะเลข 001–036');
  const record=parseRecord(input);
  if(!record.sourceEvidence)throw invalid('ระบุชื่อไฟล์ต้นทาง Excel หรือ B1-032 ถึง B1-036 ก่อน Import');
  if(number>=32 && !new RegExp(`B1[-_ ]?0?${number}`, 'i').test(record.sourceEvidence))throw invalid(`เลข ${formatNumber(number)} ต้องอ้างอิงไฟล์ B1-${formatNumber(number)}`);
  const permanent=number===35||number===36;
  const cancelled=permanent||input.cancelled===true||input.status==='ยกเลิก'||record.form2==='ยกเลิก';
  const cancelReason=cancelled?String(input.cancelReason||'ยกเลิก').trim():'';
  if(permanent && !record.note.includes('ยกเลิก'))record.note=[record.note,'ยกเลิก'].filter(Boolean).join(' · ');
  return {...record,number,no:formatNumber(number),cancelled,cancelReason};
}
export function validateMaster(rows) {
  if(!Array.isArray(rows)||!rows.length||rows.length>36)throw invalid('ไฟล์ต้องมีข้อมูลจริง 1–36 รายการสำหรับ Master 001–036');
  const records=[],errors=[],seen=new Set();
  rows.forEach((input,index)=>{try{const r=normalizeMaster(input);if(seen.has(r.number))throw invalid('เลขซ้ำในไฟล์');seen.add(r.number);records.push(r);}catch(e){errors.push({row:index+1,no:String(input?.no??''),error:e.message});}});
  return {records,errors};
}
export function sameMaster(a,b){return recordFields.every(k=>k==='amount'?Number(a[k])===Number(b[k]):String(a[k]??'')===String(b[k]??''))&&Boolean(a.cancelled)===Boolean(b.cancelled)&&String(a.cancelReason??'')===String(b.cancelReason??'');}

export function parseCsv(text) {
  const records=[];let row=[],value='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(value);value='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))records.push(row);row=[];value='';}
    else value+=c;
  }
  if(quoted)throw invalid('CSV มีเครื่องหมายคำพูดไม่ครบ');
  row.push(value);if(row.some(x=>x.trim()))records.push(row);
  return records;
}
export const importColumns=['no','date','unit','useLocation','item','amount','form2','inventoryNo','status','cancelReason','note','sourceEvidence'];
export const columnAliases={ 'เลข ว804':'no','เลขว804':'no','เลขที่':'no','เลขทะเบียน':'no','รับฟอร์ม 1':'date','รับฟอร์ม1':'date','วันที่':'date','วันที่รับฟอร์ม 1':'date','หน่วยงานผู้ขอ':'unit','หน่วยงาน':'unit','สถานที่ใช้':'useLocation','หน่วยงานที่ใช้':'useLocation','รายการ':'item','วงเงิน':'amount','วงเงิน (บาท)':'amount','รับฟอร์ม 2':'form2','รับฟอร์ม2':'form2','วันที่รับฟอร์ม 2':'form2','เลข Inventory':'inventoryNo','สถานะ':'status','เหตุผลยกเลิก':'cancelReason','หมายเหตุ':'note','ไฟล์ต้นทาง':'sourceEvidence','แหล่งที่มา':'sourceEvidence'};
export function tableToMaster(table,sourceName=''){
  if(!Array.isArray(table)||table.length<2)throw invalid('ไฟล์มีเฉพาะหัวตารางหรือไม่มีรายการ Master');
  const headers=table[0].map(value=>{const s=String(value??'').trim();return columnAliases[s]||s;});
  if(!['no','unit','item','amount'].every(k=>headers.includes(k)))throw invalid('ไม่พบคอลัมน์เลข ว804, หน่วยงาน, รายการ และวงเงิน ใช้ไฟล์แม่แบบหรือจัดหัวตารางก่อน');
  if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw invalid('หัวคอลัมน์ซ้ำ');
  return table.slice(1).filter(row=>row.some(value=>String(value??'').trim())).map(row=>{
    const r={};headers.forEach((key,index)=>{if(key)r[key]=row[index]??'';});
    if(!r.sourceEvidence && /\.xlsx?$/i.test(sourceName) && Number(String(r.no).replace('ว804/',''))<=31)r.sourceEvidence=sourceName;
    return r;
  });
}

