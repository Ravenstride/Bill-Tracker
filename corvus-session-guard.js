(()=>{'use strict';
const SESSION_KEY='corvus.session.active.v1';
const LAST_KEY='corvus.session.lastActivity.v1';
const SETTINGS_KEY='corvus.settings.v1';
let client=null,timer=null,lastWrite=0,redirecting=false;
const loginUrl=reason=>`login.html${reason?`?reason=${encodeURIComponent(reason)}`:''}`;
function readSettings(){try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch{return{}}}
function timeoutMs(){const value=Number(readSettings().autoLockMinutes??30);return value>0?value*60*1000:30*60*1000}
function markActivity(){if(redirecting)return;const now=Date.now();sessionStorage.setItem(SESSION_KEY,'1');if(now-lastWrite>5000){sessionStorage.setItem(LAST_KEY,String(now));lastWrite=now}}
function clearSessionMarker(){sessionStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(LAST_KEY)}
function goToLogin(reason){if(redirecting)return;redirecting=true;clearInterval(timer);clearSessionMarker();location.replace(loginUrl(reason))}
async function lock(reason='locked'){
  if(redirecting)return;
  try{if(client)await client.auth.signOut({scope:'local'})}catch{}
  goToLogin(reason);
}
async function verifySession(reason='signin'){
  if(redirecting||!client)return false;
  try{
    const {data:{session}}=await client.auth.getSession();
    if(!session){goToLogin(reason);return false}
    return true;
  }catch{goToLogin(reason);return false}
}
async function boot(){
  if(location.pathname.endsWith('/login.html')||location.pathname.endsWith('login.html'))return;
  const cfg=window.CORVUS_SUPABASE;
  if(!cfg?.url||!cfg?.publishableKey||!window.supabase){goToLogin('setup');return}
  client=window.supabase.createClient(cfg.url,cfg.publishableKey);
  if(!await verifySession('signin'))return;
  if(sessionStorage.getItem(SESSION_KEY)!=='1'){await lock('closed');return}
  const last=Number(sessionStorage.getItem(LAST_KEY)||0);
  if(!last||Date.now()-last>timeoutMs()){await lock('timeout');return}
  client.auth.onAuthStateChange(event=>{
    if(event==='SIGNED_OUT')goToLogin('signin');
  });
  ['pointerdown','keydown','touchstart','scroll','focus'].forEach(name=>window.addEventListener(name,markActivity,{passive:true}));
  window.addEventListener('pageshow',()=>verifySession('signin'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)verifySession('signin')});
  window.addEventListener('storage',event=>{if(event.key&&event.key.includes('auth-token'))verifySession('signin')});
  markActivity();
  timer=setInterval(async()=>{
    if(!await verifySession('signin'))return;
    const seen=Number(sessionStorage.getItem(LAST_KEY)||0);
    if(!seen||Date.now()-seen>timeoutMs())lock('timeout');
  },5000);
  window.CorvusSession={lock:()=>lock('manual'),activity:markActivity};
  window.dispatchEvent(new CustomEvent('corvus-session-ready'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();