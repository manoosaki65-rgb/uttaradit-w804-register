import express from 'express';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {database,httpError} from './db.js';
import {auth} from './auth.js';
import {importColumns} from './domain.js';
import {parseImportFile} from './import-parser.js';
import {lookupInventory} from './inventory.js';

export function createApp({store,transaction},credentials){
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
  app.get('/api/auth',(req,res)=>res.json({editor:credentials.valid(req)}));
  const attempts=new Map();
  app.post('/api/auth/login',(req,res)=>{
    const now=Date.now(),key=req.ip;const attempt=attempts.get(key)||{count:0,until:now+15*60*1000};
    if(attempt.until<now){attempt.count=0;attempt.until=now+15*60*1000;}
    if(attempt.count>=10)return res.status(429).json({error:'ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที'});
    if(!credentials.passwordMatches(req.body?.password)){attempt.count++;attempts.set(key,attempt);return res.status(401).json({error:'รหัส ว804 ไม่ถูกต้อง'});}
    attempts.delete(key);credentials.set(res,req.secure);res.json({editor:true});
  });
  app.post('/api/auth/logout',(req,res)=>{credentials.clear(res,req.secure);res.json({editor:false});});
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
  app.use('/api',(req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!credentials.valid(req))return res.status(401).json({error:'กรุณาเข้าสู่โหมดแก้ไข ว804 ก่อนบันทึก'});next();});
  const documentInput=body=>{
    if(typeof body?.original!=='string'||body.original.length>16777216||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.original))throw httpError('ข้อมูล PDF ไม่ถูกต้องหรือเกิน 12 MB');
    const filename=String(body.filename||'document.pdf').replace(/[\r\n\/\\]/g,'_').slice(0,180);
    return {filename,content:Buffer.from(body.original,'base64')};
  };
  app.post('/api/w804',async(req,res)=>{
    if(!req.body?.record)throw httpError('ไม่พบข้อมูลรายการ');
    const pdf=req.body.form1?documentInput(req.body.form1):null;
    const row=await transaction(async tx=>{const row=await tx.issue(req.body.record,req.body.requestKey);if(pdf)await tx.attach(row.id,'form1',pdf.filename,pdf.content);return row;});
    res.status(201).json({row});
  });
  app.put('/api/w804/:id',async(req,res)=>res.json({row:await transaction(tx=>tx.update(req.params.id,req.body))}));
  app.post('/api/w804/:id/cancel',async(req,res)=>res.json({row:await transaction(tx=>tx.cancel(req.params.id,req.body?.reason,req.body?.version))}));
  app.post('/api/w804/:id/documents/:kind',async(req,res)=>{
    const pdf=documentInput(req.body);res.json(await transaction(tx=>tx.attach(req.params.id,req.params.kind,pdf.filename,pdf.content)));
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
  app.get('/api/audit',async(req,res)=>{if(!credentials.valid(req))throw httpError('กรุณาเข้าสู่โหมดแก้ไข',401);res.json({items:await store.audit()});});
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
  const db=database(process.env.W804_DATABASE_URL);const credentials=auth(process.env.W804_SESSION_SECRET,process.env.W804_EDITOR_PASSWORD);
  const server=createApp(db,credentials).listen(Number(process.env.PORT)||3001,'0.0.0.0',()=>console.log('W804 listening with separate persistent database'));
  process.on('SIGTERM',()=>server.close(()=>db.pool.end().finally(()=>process.exit(0))));
}
