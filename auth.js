import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const cookieName='w804_editor';
export function auth(secret,password){
  if(!secret||secret.length<32||!password||password.length<10)throw Error('Configure separate W804_SESSION_SECRET and W804_EDITOR_PASSWORD');
  const sign=value=>createHmac('sha256',secret).update(value).digest('base64url');
  const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);};
  return {
    passwordMatches:value=>equal(value,password),
    valid:req=>{const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(!cookie)return false;const [expires,nonce,sig]=cookie.split('.');return Boolean(expires&&nonce&&sig&&Number(expires)>Date.now()&&equal(sig,sign(expires+'.'+nonce)));},
    set:(res,secure)=>{const value=String(Date.now()+8*60*60*1000)+'.'+randomBytes(16).toString('hex');res.setHeader('Set-Cookie',`${cookieName}=${value}.${sign(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure?'; Secure':''}`);},
    clear:(res,secure)=>res.setHeader('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`),
  };
}
