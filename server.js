import express from 'express';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {database,httpError} from './db.js';
import {importColumns} from './domain.js';
import {parseImportFile} from './import-parser.js';
import {lookupInventory} from './inventory.js';
import {verifyWorkflows} from './verify-workflows.js';

export function createApp({store,transaction}){
  const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
  app.use(express.json({limit:'20mb'}));
  app.use((req,res,next)=>{
    res.set('X-Content-Type-Options','nosniff');res.set('Referrer-Policy','same-origin');
    if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')){
      try{if(new URL(req.get('origin')).host!==req.get('host'))return res.status(403).json({error:'คำขอจากเว็บอื่นถูกปฏิเสธ'});}catch{return res.status(403).json({error:'Origin ไม่ถูกต้อง'});}
    }
    next();
  });
  app.get('/api/health',async(req,res)=>res.json({ok:true,system:'w804',storage:'neon-postgresql',...(await store.metadata())}));
  app.get('/api/w804',async(req,res)=>res.json({rows:await store.list(),...(await store.metadata())}));
  app.get('/api/inventory-lookup',async(req,res)=>res.json(await lookupInventory(String(req.query.number||'').trim())));
  app.get('/api/import/template',(req,res)=>{res.type('text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="w804-master-template.csv"');res.send('\uFEFF'+importColumns.join(',')+'\r\n');});
  app.get('/api/export',async(req,res)=>{res.set('Content-Disposition','attachment; filename="w804-register.json"');res.json({system:'w804',exportedAt:new Date().toISOString(),rows:await store.list(),metadata:await store.metadata()});});
  app.param('id',(req,res,next,id)=>{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return res.status(400).json({error:'รหัสรายการไม่ถูกต้อง'});next();});
  app.get('/api/w804/:id/documents/:kind',async(req,res)=>{
    if(!['form1','form2'].includes(req.params.kind))throw httpError('ประเภทเอกสารไม่ถูกต้อง');
    const d=await store.document(req.params.id,req.params.kind);if(!d)throw httpError('ยังไม่มี PDF แนบในรายการ',404);
    res.type('application/pdf');res.set('Content-Disposition',`inline; filename="${req.params.kind}.pdf"; filename*=UTF-8''${encodeURIComponent(d.filename)}`);res.send(d.content);
  });
  app.post('/api/verify-workflows',async(req,res)=>{
    if(req.body?.confirmation!=='rollback-only')throw httpError('การตรวจระบบต้อง rollback ข้อมูลทดสอบ');
    res.json(await verifyWorkflows({store,transaction}));
  });
  const documentInput=body=>{
    const filename=String(body?.filename||'').trim();
    if(!filename)throw httpError('ไม่พบชื่อไฟล์ กรุณาเลือกไฟล์ PDF ใหม่');
    if(!filename.toLowerCase().endsWith('.pdf'))throw httpError('แนบได้เฉพาะไฟล์ PDF เท่านั้น');
    if(typeof body?.original!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.original))throw httpError('อ่านข้อมูลไฟล์ไม่ได้ กรุณาเลือก PDF ใหม่');
    if(body.original.length>16777216)throw httpError('ไฟล์ PDF ใหญ่เกิน 12 MB กรุณาลดขนาดไฟล์แล้วลองใหม่');
    const content=Buffer.from(body.original,'base64');
    if(content.length===0)throw httpError('ไฟล์ PDF ว่างหรืออ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์ใหม่');
    if(content.length>12*1024*1024)throw httpError('ไฟล์ PDF ใหญ่เกิน 12 MB กรุณาลดขนาดไฟล์แล้วลองใหม่');
    if(content.subarray(0,5).toString('ascii')!=='%PDF-')throw httpError('ไฟล์ที่เลือกไม่ใช่ PDF ที่ถูกต้อง');
    const safeFilename=filename.replace(/[\r\n\/\\]/g,'_').slice(0,180);
    return {filename:safeFilename,content};
  };
  app.post('/api/w804',async(req,res)=>{
    if(!req.body?.record)throw httpError('ไม่พบข้อมูลรายการ');
    // Always save the W804 record first. PDF attachment is deliberately a separate step
    // so a bad/large file can never roll back or lose the newly issued W804 number.
    const row=await transaction(tx=>tx.issue(req.body.record,req.body.requestKey));
    res.status(201).json({row,attachmentDeferred:Boolean(req.body?.form1),message:'บันทึกรายการ ว804 แล้ว กรุณาแนบ Form 1/Form 2 จากรายการภายหลัง'});
  });
  app.put('/api/w804/:id',async(req,res)=>res.json({row:await transaction(tx=>tx.update(req.params.id,req.body))}));
  app.post('/api/w804/:id/cancel',async(req,res)=>res.json({row:await transaction(tx=>tx.cancel(req.params.id,req.body?.reason,req.body?.version))}));
  app.post('/api/w804/:id/documents/:kind',async(req,res)=>{
    if(!['form1','form2'].includes(req.params.kind))throw httpError('ประเภทเอกสารไม่ถูกต้อง เลือกได้เฉพาะ Form 1 หรือ Form 2');
    const pdf=documentInput(req.body);
    try{
      res.json(await transaction(tx=>tx.attach(req.params.id,req.params.kind,pdf.filename,pdf.content)));
    }catch(err){
      if(err?.status)throw err;
      throw httpError('บันทึกรายการ ว804 ไว้แล้ว แต่แนบ PDF ไม่สำเร็จ กรุณาลองแนบไฟล์อีกครั้ง');
    }
  });
  const importInput=async body=>{
    if(typeof body?.original!=='string'||body.original.length>6990508||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.original))throw httpError('เลือกไฟล์ Import ไม่เกิน 5 MB');
    const content=Buffer.from(body.original,'base64');const filename=String(body.filename||'');
    let rows;try{rows=await parseImportFile(filename,content);}catch(e){throw httpError(e.message);}
    return {rows,filename,digest:createHash('sha256').update(content).digest('hex')};
  };
  app.post('/api/import/preview',async(req,res)=>{
    const data=await importInput(req.body);res.json({...(await store.previewImport(data.rows)),sourceName:data.filename,digest:data.digest});
  });
  app.post('/api/import/commit',async(req,res)=>{
    if(req.body?.confirmed!==true)throw httpError('ต้องตรวจ Preview และยืนยัน Import ข้อมูลจริงก่อน');
    const data=await importInput(req.body);
    res.json(await transaction(tx=>tx.importMaster(data.rows,data.filename,data.digest)));
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'ไม่พบเส้นทาง API'}));
  app.use(express.static(resolve(fileURLToPath(new URL('.',import.meta.url)),'dist')));
  app.use((err,req,res,next)=>{
    const code=err.code||err.cause?.code;
    const status=err.status||((code==='23505'||code==='40001')?409:code==='22P02'?400:500);
    if(status>=500)console.error('W804 request failed',code||err.name);
    res.status(status).json({error:status>=500?'บันทึกหรืออ่านข้อมูลไม่สำเร็จ กรุณาลองใหม่':code==='23505'?'เลขซ้ำหรือมีคำขอบันทึกซ้ำ กรุณาโหลดใหม่':err.message});
  });
  return app;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const db=database(process.env.W804_DATABASE_URL);
  const server=createApp(db).listen(Number(process.env.PORT)||3001,'0.0.0.0',()=>console.log('W804 listening with separate persistent database'));
  process.on('SIGTERM',()=>server.close(()=>db.pool.end().finally(()=>process.exit(0))));
}
