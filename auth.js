(() => {
  "use strict";
  const SUPABASE_URL = "https://backppaojjbhyaksprfe.supabase.co";
  const SUPABASE_KEY = "sb_publishable_e-NOWhUbjmEPTV-FI6wscg_JnMyxhhu";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true} });
  let currentMode = "signin";
  let currentUser = null;

  function loadHouseholdModule(){
    if(!document.querySelector('link[href*="households.css"]')){
      const link=document.createElement("link"); link.rel="stylesheet"; link.href="./households.css?v=11"; document.head.appendChild(link);
    }
    return new Promise((resolve,reject)=>{
      if(window.corvusHouseholds) return resolve();
      const script=document.createElement("script"); script.src="./households.js?v=11"; script.onload=resolve; script.onerror=reject; document.head.appendChild(script);
    });
  }

  function setAppVisible(visible){
    document.body.classList.toggle("auth-locked",!visible);
    [".app-shell",".floating-add",".bottom-nav","dialog"].forEach(selector=>document.querySelectorAll(selector).forEach(element=>{
      element.toggleAttribute("inert",!visible); element.setAttribute("aria-hidden",String(!visible));
    }));
    const gate=document.getElementById("authGate"); if(gate) gate.hidden=visible;
  }

  function authMarkup(){return `<section id="authGate" class="auth-gate" aria-label="Corvus account access"><div class="auth-backdrop"></div><div class="auth-card"><div class="auth-brand"><img src="./raven-logo.svg?v=11" alt="Corvus Planner raven"><p>CORVUS PLANNER</p><h1 id="authTitle">Welcome back</h1><span id="authSubtitle">Sign in to securely access your household planner.</span></div><form id="authForm" class="auth-form" novalidate><label id="authNameWrap" hidden>Full name<input id="authName" type="text" autocomplete="name" maxlength="80" placeholder="Your name"></label><label>Email<input id="authEmail" type="email" autocomplete="email" required placeholder="you@example.com"></label><label id="authPasswordWrap">Password<input id="authPassword" type="password" autocomplete="current-password" minlength="8" required placeholder="At least 8 characters"></label><label id="authConfirmWrap" hidden>Confirm password<input id="authConfirm" type="password" autocomplete="new-password" minlength="8" placeholder="Repeat your password"></label><button id="authSubmit" class="auth-primary" type="submit">Sign in</button><p id="authMessage" class="auth-message" role="status" aria-live="polite"></p></form><div id="authLinks" class="auth-links"><button type="button" data-auth-mode="signup">Create account</button><button type="button" data-auth-mode="reset">Forgot password?</button></div><button id="authBack" class="auth-back" type="button" hidden>Back to sign in</button><p class="auth-security">Protected by Supabase authentication.</p></div></section>`}

  function mountGate(){document.body.insertAdjacentHTML("afterbegin",authMarkup());document.getElementById("authForm").addEventListener("submit",submitAuth);document.querySelectorAll("[data-auth-mode]").forEach(button=>button.addEventListener("click",()=>setMode(button.dataset.authMode)));document.getElementById("authBack").addEventListener("click",()=>setMode("signin"));}
  function setMessage(message,type=""){const el=document.getElementById("authMessage");el.textContent=message;el.dataset.type=type;}
  function setMode(mode){currentMode=mode;const password=document.getElementById("authPassword");document.getElementById("authNameWrap").hidden=mode!=="signup";document.getElementById("authConfirmWrap").hidden=!["signup","recovery"].includes(mode);document.getElementById("authPasswordWrap").hidden=mode==="reset";document.getElementById("authLinks").hidden=mode!=="signin";document.getElementById("authBack").hidden=mode==="signin";password.required=mode!=="reset";password.autocomplete=["signup","recovery"].includes(mode)?"new-password":"current-password";const copy={signup:["Create your account","Start a secure Corvus Planner account.","Create account"],reset:["Reset your password","We’ll email you a secure reset link.","Send reset link"],recovery:["Choose a new password","Enter and confirm your new password.","Update password"],signin:["Welcome back","Sign in to securely access your household planner.","Sign in"]}[mode];document.getElementById("authTitle").textContent=copy[0];document.getElementById("authSubtitle").textContent=copy[1];document.getElementById("authSubmit").textContent=copy[2];setMessage("");}

  async function unlock(user){currentUser=user;setAppVisible(true);installAccountButton(user);await loadHouseholdModule();await window.corvusHouseholds.initialize(client);}

  async function submitAuth(event){event.preventDefault();const submit=document.getElementById("authSubmit"),email=document.getElementById("authEmail").value.trim(),password=document.getElementById("authPassword").value,confirm=document.getElementById("authConfirm").value,fullName=document.getElementById("authName").value.trim();submit.disabled=true;setMessage("Working…");try{if(currentMode==="signup"){if(password!==confirm)throw new Error("Passwords do not match.");const{data,error}=await client.auth.signUp({email,password,options:{data:{full_name:fullName},emailRedirectTo:`${location.origin}${location.pathname}`}});if(error)throw error;if(data.session)await unlock(data.user);else setMessage("Account created. Check your email to confirm your address.","success");}else if(currentMode==="reset"){const{error}=await client.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${location.pathname}`});if(error)throw error;setMessage("Password-reset email sent. Check your inbox.","success");}else if(currentMode==="recovery"){if(password!==confirm)throw new Error("Passwords do not match.");const{error}=await client.auth.updateUser({password});if(error)throw error;const{data:{user}}=await client.auth.getUser();await unlock(user);}else{const{data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;await unlock(data.user);}}catch(error){setMessage(error?.message||"Authentication failed. Please try again.","error");}finally{submit.disabled=false;}}

  function installAccountButton(user){if(!user||document.getElementById("accountMenuButton"))return;const sidebar=document.querySelector(".sidebar-note");if(!sidebar)return;const name=user.user_metadata?.full_name||user.email||"Account";sidebar.insertAdjacentHTML("beforebegin",`<div class="account-panel"><span>Signed in as</span><strong>${escapeHtml(name)}</strong><button id="accountMenuButton" class="secondary-btn" type="button">Sign out</button></div>`);document.getElementById("accountMenuButton").addEventListener("click",async()=>{await client.auth.signOut();location.reload();});}
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);}

  async function initialize(){mountGate();setAppVisible(false);const{data:{session}}=await client.auth.getSession();if(session)await unlock(session.user);client.auth.onAuthStateChange(async(event,nextSession)=>{if(event==="PASSWORD_RECOVERY"){setAppVisible(false);setMode("recovery");return;}if(nextSession&&!currentUser)await unlock(nextSession.user);else if(!nextSession){currentUser=null;setAppVisible(false);setMode("signin");}});}
  window.corvusAuth={client,get user(){return currentUser;}};
  window.addEventListener("DOMContentLoaded",initialize,{once:true});
})();