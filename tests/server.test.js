import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('public read and write without login, cross-origin rejection, header-only import template',async()=>{
  let writes=0;
  const metadata=async()=>({next:'037',masterImported:0,masterExpected:36});
  const store={metadata,list:async()=>[],previewImport:async()=>({records:[],errors:[],canImport:false})};
  const app=createApp({store,transaction:async()=>{writes++;return {};}});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await (await fetch(base+'/api/w804')).json()).next,'037');
    assert.equal((await fetch(base+'/api/w804',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
    assert.equal((await fetch(base+'/api/w804',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({record:{unit:'fixture',item:'fixture',amount:1}})})).status,201);
    assert.equal((await fetch(base+'/api/auth/login',{method:'POST'})).status,404);
    const cross=await fetch(base+'/api/w804',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://other.example'},body:'{}'});assert.equal(cross.status,403);
    const template=await(await fetch(base+'/api/import/template')).text();assert.equal(template.trim().split(/\r?\n/).length,1);assert.match(template,/sourceEvidence/);assert.equal(writes,1);
    assert.equal((await fetch(base+'/api/w804/00000000-0000-0000-0000-000000000000',{method:'DELETE'})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
