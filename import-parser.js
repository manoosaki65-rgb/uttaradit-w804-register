import ExcelJS from 'exceljs';
import {parseCsv,tableToMaster} from './domain.js';
export async function parseImportFile(filename,content){
  if(!filename||typeof filename!=='string'||filename.length>180||!Buffer.isBuffer(content)||!content.length||content.length>5*1024*1024)throw Error('เลือกไฟล์ Master JSON, CSV หรือ XLSX ขนาดไม่เกิน 5 MB');
  if(/\.json$/i.test(filename)){const value=JSON.parse(content.toString('utf8'));return Array.isArray(value)?value:value.rows;}
  if(/\.csv$/i.test(filename))return tableToMaster(parseCsv(content.toString('utf8')),filename);
  if(/\.xlsx$/i.test(filename)){
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(content);
    const sheets=workbook.worksheets.filter(s=>s.rowCount>0);
    if(sheets.length!==1)throw Error('ไฟล์ Excel ต้องมีชีตข้อมูลหนึ่งชีต เพื่อไม่เลือกชีตผิด');
    if(sheets[0].rowCount>100)throw Error('ไฟล์ Master เกินจำนวนแถวที่รองรับ');
    const table=[];
    sheets[0].eachRow(row=>{const cells=[];row.eachCell({includeEmpty:true},cell=>{
      if(cell.type===ExcelJS.ValueType.Formula)throw Error('ไฟล์ Import ต้องเป็นค่าที่ตรวจแล้ว ไม่ใช้สูตร Excel');
      const value=cell.value;
      if(value instanceof Date)cells.push(value.toISOString().slice(0,10));
      else if(value&&typeof value==='object'&&'richText' in value)cells.push(value.richText.map(x=>x.text).join(''));
      else if(value!==null&&typeof value==='object')throw Error('พบเซลล์ Excel ที่ไม่รองรับ กรุณาแปลงเป็นข้อความหรือค่า');
      else cells.push(value??'');
    });table.push(cells);});
    return tableToMaster(table,filename);
  }
  throw Error('Import รับ JSON, CSV และ XLSX; สำหรับ PDF ให้ตรวจข้อมูล B1 แล้วจัดเป็นไฟล์แม่แบบก่อน');
}
