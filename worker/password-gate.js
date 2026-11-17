// Shared-password gate. The password is supplied exclusively through a Worker secret.
const COOKIE = "__Host-betarox_session";
const TTL = 24 * 60 * 60;
const encoder = new TextEncoder();
const noStore = {"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join("");
const key = password => crypto.subtle.importKey("raw",encoder.encode(password),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
const payload = (host, expiry, nonce) => encoder.encode("betarox-session-v1\n"+host+"\n"+expiry+"\n"+nonce);
async function validSession(request,password,host) {
  const token = request.headers.get("cookie")?.split(/;\s*/).find(v=>v.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  const m = token?.match(/^(\d{10})\.([a-f0-9]{32})\.([a-f0-9]{64})$/);
  if(!m) return false;
  const now = Math.floor(Date.now()/1000);
  if(Number(m[1])<=now || Number(m[1])>now+TTL) return false;
  const signature = Uint8Array.from(m[3].match(/../g),s=>parseInt(s,16));
  return crypto.subtle.verify("HMAC",await key(password),signature,payload(host,m[1],m[2]));
}
async function passwordMatches(input,password) {
  const k=await key(password), expected=await crypto.subtle.sign("HMAC",k,encoder.encode(password));
  return crypto.subtle.verify("HMAC",k,expected,encoder.encode(input));
}
function json(status,data,extra={}) {
  return new Response(JSON.stringify(data),{status,headers:{...noStore,"Content-Type":"application/json",...extra}});
}
function loginPage() {
  const nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BetaRox | Private preview</title><style nonce="'+nonce+'">body{font:16px system-ui;background:#121218;color:#eee;display:grid;place-items:center;min-height:95vh;margin:0}main{width:min(480px,84vw);box-sizing:border-box;padding:28px;background:#20202b;border:1px solid #414150;border-radius:12px}h1{margin:0;color:#e7c56c}p{color:#ccc;line-height:1.55}a{color:#e7c56c}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:12px;border-radius:6px;margin:8px 0 16px}input{background:#14141c;border:1px solid #777;color:#fff}button{background:#e7c56c;color:#181818;border:0;cursor:pointer;font-weight:600}#message{min-height:1.5em;color:#ffb4a8}</style><main><h1>Welcome beta testers!</h1><p>BetaRox is a new member of the <a href="https://www.beepbox.co/" target="_blank" rel="noopener noreferrer">BeepBox</a> family, building upon the original work of John Nesky.</p><p>Create and share music with a standalone editor in the BeepBox family. BetaRox builds on the open-source work of GoldBox, JummBox, and BeepBox.</p><form id="login" method="post" action="/_betarox/login"><label for="password">Please enter password below.</label><input type="password" id="password" name="password" autocomplete="current-password" maxlength="256" required autofocus><button>Enter</button><p id="message" role="status" aria-live="polite"></p></form></main><script nonce="'+nonce+'">document.getElementById("login").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector("button"),message=document.getElementById("message");button.disabled=true;message.textContent="";try{const response=await fetch(form.action,{method:"POST",body:new URLSearchParams(new FormData(form)),headers:{Accept:"application/json"}});if(response.ok){location.reload();return}const result=await response.json();message.textContent=result.error||"Unable to sign in."}catch{message.textContent="Unable to sign in. Try again."}finally{button.disabled=false}});</script></html>';
  return new Response(html,{status:401,headers:{...noStore,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'nonce-"+nonce+"'; script-src 'nonce-"+nonce+"'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"}});
}
export async function passwordGate(request,env) {
  const url=new URL(request.url),password=env.BETAROX_PASSWORD;
  if(typeof password!=="string"||!password.length) return json(503,{error:"Private preview is not configured. Contact the site owner."});
  if(url.pathname==="/_betarox/login") {
    if(request.method!=="POST") return loginPage();
    if(request.headers.get("origin")!==url.origin) return json(403,{error:"Sign in from this site."});
    if(!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return json(415,{error:"Invalid sign-in form."});
    const ip=request.headers.get("cf-connecting-ip")||"unknown";
    const allowed=await env.LOOP_USER_LIMIT.limit({key:"betarox-login:"+ip});
    if(!allowed.success) return json(429,{error:"Too many attempts. Try again in a minute."});
    if(Number(request.headers.get("content-length")||0)>4096) return json(413,{error:"Invalid sign-in form."});
    const raw=await request.text();
    if(raw.length>4096) return json(413,{error:"Invalid sign-in form."});
    const input=new URLSearchParams(raw).get("password");
    if(!input||input.length>256||!(await passwordMatches(input,password))) return json(401,{error:"Incorrect password."});
    const expiry=String(Math.floor(Date.now()/1000)+TTL),nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
    const sig=hex(await crypto.subtle.sign("HMAC",await key(password),payload(url.hostname,expiry,nonce)));
    const cookie=COOKIE+"="+expiry+"."+nonce+"."+sig+"; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age="+TTL;
    if(request.headers.get("accept")?.includes("application/json")) return json(200,{ok:true},{"Set-Cookie":cookie});
    return new Response(null,{status:303,headers:{...noStore,Location:"/","Set-Cookie":cookie}});
  }
  if(await validSession(request,password,url.hostname)) return null;
  if(url.pathname.startsWith("/api/")||request.method!=="GET"||!request.headers.get("accept")?.includes("text/html")) return json(401,{error:"Sign in to BetaRox first."});
  return loginPage();
}
