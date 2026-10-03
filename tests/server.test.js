import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {auth} from '../auth.js';

test('public read, protected writes, cross-origin rejection, header-only import template',async()=>{
  let writes=0;
  const metadata=async()=>({next:'037',masterImported:0,masterExpected:36});
  const store={metadata,list:async()=>[],previewImport:async()=>({records:[],errors:[],canImport:false})};
  const app=createApp({store,transaction:async()=>{writes++;return {};}},auth('s'.repeat(32),'fixture-only-password'));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    assert.equal((await (await fetch(base+'/api/w804')).json()).next,'037');
    assert.equal((await fetch(base+'/api/w804',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'fixture-only-password'})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
    const cross=await fetch(base+'/api/w804',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'https://other.example'},body:'{}'});assert.equal(cross.status,403);
    const template=await(await fetch(base+'/api/import/template')).text();assert.equal(template.trim().split(/\r?\n/).length,1);assert.match(template,/sourceEvidence/);assert.equal(writes,0);
    assert.equal((await fetch(base+'/api/w804/00000000-0000-0000-0000-000000000000',{method:'DELETE',headers:{Cookie:cookie}})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
