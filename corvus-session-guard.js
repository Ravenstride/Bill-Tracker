(()=>{'use strict';
const SESSION_KEY='corvus.session.active.v1';
const LAST_KEY='corvus.session.lastActivity.v1';
const SETTINGS_KEY='corvus.settings.v1';
let client=null,timer=null,lastWrite=0;
const loginUrl=reason=>`login.html${reason?`?reason=${encodeURIComponent(reason)}`:''}`;
function readSettings(){try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch{return{}}}
function timeoutMs(){const value=Number(readSettings().autoLockMinutes??30);return value>0?value*60*1000:30*60*1000}
function markActivity(){const now=Date.now();sessionStorage.setItem(SESSION_KEY,'1');if(now-lastWrite>5000){sessionStorage.setItem(LAST_KEY,String(now));lastWrite=now}}
async function lock(reason='locked'){
  try{if(client)await client.auth.signOut({scope:'local'})}catch{}
  sessionStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(LAST_KEY);
  location.replace(loginUrl(reason));
}
async function boot(){
  if(location.pathname.endsWith('/login.html')||location.pathname.endsWith('login.html'))return;
  const cfg=window.CORVUS_SUPABASE;
  if(!cfg?.url||!cfg?.publishableKey||!window.supabase){location.replace(loginUrl('setup'));return}
  client=window.supabase.createClient(cfg.url,cfg.publishableKey);
  const {data:{session}}=await client.auth.getSession();
  if(!session){location.replace(loginUrl('signin'));return}
  if(sessionStorage.getItem(SESSION_KEY)!=='1'){
    await lock('closed');return;
  }
  const last=Number(sessionStorage.getItem(LAST_KEY)||0);
  if(!last||Date.now()-last>timeoutMs()){await lock('timeout');return}
  ['pointerdown','keydown','touchstart','scroll','focus'].forEach(name=>window.addEventListener(name,markActivity,{passive:true}));
  markActivity();
  timer=setInterval(()=>{const seen=Number(sessionStorage.getItem(LAST_KEY)||0);if(!seen||Date.now()-seen>timeoutMs())lock('timeout')},15000);
  window.CorvusSession={lock:()=>lock('manual'),activity:markActivity};
  window.dispatchEvent(new CustomEvent('corvus-session-ready'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();