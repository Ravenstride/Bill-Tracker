(() => {
  "use strict";

  const SUPABASE_URL = "https://backppaojjbhyaksprfe.supabase.co";
  const SUPABASE_KEY = "sb_publishable_e-NOWhUbjmEPTV-FI6wscg_JnMyxhhu";
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const shellSelectors = [".app-shell", ".floating-add", ".bottom-nav", "dialog"];
  let currentMode = "signin";

  function setAppVisible(visible) {
    document.body.classList.toggle("auth-locked", !visible);
    shellSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.toggleAttribute("inert", !visible);
        element.setAttribute("aria-hidden", String(!visible));
      });
    });
    const gate = document.getElementById("authGate");
    if (gate) gate.hidden = visible;
  }

  function authMarkup() {
    return `
      <section id="authGate" class="auth-gate" aria-label="Corvus account access">
        <div class="auth-backdrop"></div>
        <div class="auth-card">
          <div class="auth-brand">
            <img src="./raven-logo.svg?v=10" alt="Corvus raven">
            <p>CORVUS PLANNER</p>
            <h1 id="authTitle">Welcome back</h1>
            <span id="authSubtitle">Sign in to securely access your household planner.</span>
          </div>

          <form id="authForm" class="auth-form" novalidate>
            <label id="authNameWrap" hidden>Full name
              <input id="authName" type="text" autocomplete="name" maxlength="80" placeholder="Joseph Ravenstride">
            </label>
            <label>Email
              <input id="authEmail" type="email" autocomplete="email" required placeholder="you@example.com">
            </label>
            <label id="authPasswordWrap">Password
              <input id="authPassword" type="password" autocomplete="current-password" minlength="8" required placeholder="At least 8 characters">
            </label>
            <label id="authConfirmWrap" hidden>Confirm password
              <input id="authConfirm" type="password" autocomplete="new-password" minlength="8" placeholder="Repeat your password">
            </label>
            <button id="authSubmit" class="auth-primary" type="submit">Sign in</button>
            <p id="authMessage" class="auth-message" role="status" aria-live="polite"></p>
          </form>

          <div id="authLinks" class="auth-links">
            <button type="button" data-auth-mode="signup">Create account</button>
            <button type="button" data-auth-mode="reset">Forgot password?</button>
          </div>
          <button id="authBack" class="auth-back" type="button" hidden>Back to sign in</button>
          <p class="auth-security">Protected by Supabase authentication. Your service-role key is never stored in this app.</p>
        </div>
      </section>`;
  }

  function mountGate() {
    document.body.insertAdjacentHTML("afterbegin", authMarkup());
    document.getElementById("authForm").addEventListener("submit", submitAuth);
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.authMode));
    });
    document.getElementById("authBack").addEventListener("click", () => setMode("signin"));
  }

  function setMessage(message, type = "") {
    const element = document.getElementById("authMessage");
    element.textContent = message;
    element.dataset.type = type;
  }

  function setMode(mode) {
    currentMode = mode;
    const title = document.getElementById("authTitle");
    const subtitle = document.getElementById("authSubtitle");
    const submit = document.getElementById("authSubmit");
    const nameWrap = document.getElementById("authNameWrap");
    const passwordWrap = document.getElementById("authPasswordWrap");
    const confirmWrap = document.getElementById("authConfirmWrap");
    const links = document.getElementById("authLinks");
    const back = document.getElementById("authBack");
    const password = document.getElementById("authPassword");

    setMessage("");
    nameWrap.hidden = mode !== "signup";
    confirmWrap.hidden = !["signup", "recovery"].includes(mode);
    passwordWrap.hidden = mode === "reset";
    links.hidden = mode !== "signin";
    back.hidden = mode === "signin";
    password.required = mode !== "reset";
    password.autocomplete = ["signup", "recovery"].includes(mode) ? "new-password" : "current-password";

    if (mode === "signup") {
      title.textContent = "Create your account";
      subtitle.textContent = "Start with a secure personal account. Household sharing comes next.";
      submit.textContent = "Create account";
    } else if (mode === "reset") {
      title.textContent = "Reset your password";
      subtitle.textContent = "We’ll email you a secure password-reset link.";
      submit.textContent = "Send reset link";
    } else if (mode === "recovery") {
      title.textContent = "Choose a new password";
      subtitle.textContent = "Enter and confirm your new password.";
      submit.textContent = "Update password";
    } else {
      title.textContent = "Welcome back";
      subtitle.textContent = "Sign in to securely access your household planner.";
      submit.textContent = "Sign in";
    }
  }

  async function submitAuth(event) {
    event.preventDefault();
    const submit = document.getElementById("authSubmit");
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const confirm = document.getElementById("authConfirm").value;
    const fullName = document.getElementById("authName").value.trim();
    submit.disabled = true;
    setMessage("Working…");

    try {
      if (currentMode === "signup") {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${location.origin}${location.pathname}`
          }
        });
        if (error) throw error;
        if (data.session) {
          setAppVisible(true);
          installAccountButton(data.user);
        } else {
          setMessage("Account created. Check your email to confirm your address.", "success");
        }
      } else if (currentMode === "reset") {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}${location.pathname}`
        });
        if (error) throw error;
        setMessage("Password-reset email sent. Check your inbox.", "success");
      } else if (currentMode === "recovery") {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMessage("Password updated. You are signed in.", "success");
        setTimeout(() => setAppVisible(true), 600);
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setAppVisible(true);
        installAccountButton(data.user);
      }
    } catch (error) {
      setMessage(error?.message || "Authentication failed. Please try again.", "error");
    } finally {
      submit.disabled = false;
    }
  }

  function installAccountButton(user) {
    if (!user || document.getElementById("accountMenuButton")) return;
    const sidebar = document.querySelector(".sidebar-note");
    if (!sidebar) return;
    const name = user.user_metadata?.full_name || user.email || "Account";
    sidebar.insertAdjacentHTML("beforebegin", `
      <div class="account-panel">
        <span>Signed in as</span>
        <strong>${escapeHtml(name)}</strong>
        <button id="accountMenuButton" class="secondary-btn" type="button">Sign out</button>
      </div>`);
    document.getElementById("accountMenuButton").addEventListener("click", async () => {
      await client.auth.signOut();
      location.reload();
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[character]);
  }

  async function initialize() {
    mountGate();
    setAppVisible(false);

    const { data: { session } } = await client.auth.getSession();
    if (session) {
      setAppVisible(true);
      installAccountButton(session.user);
    }

    client.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setAppVisible(false);
        setMode("recovery");
        return;
      }
      if (nextSession) {
        setAppVisible(true);
        installAccountButton(nextSession.user);
      } else {
        setAppVisible(false);
        setMode("signin");
      }
    });
  }

  window.corvusAuth = { client };
  window.addEventListener("DOMContentLoaded", initialize, { once: true });
})();
