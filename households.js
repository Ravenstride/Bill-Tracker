(() => {
  "use strict";

  let client;
  let currentHousehold = null;

  function markup() {
    return `
      <section id="householdGate" class="household-gate" hidden aria-label="Household setup">
        <div class="household-card">
          <img src="./raven-logo.svg?v=11" alt="Corvus Planner raven">
          <p class="eyebrow">CORVUS PLANNER</p>
          <h1>Set up your household</h1>
          <p class="household-intro">Create a new shared space or join one with an invite code.</p>

          <div class="household-choice">
            <button type="button" data-household-mode="create">
              <strong>Create household</strong>
              <span>Start a new planner and become the owner.</span>
            </button>
            <button type="button" data-household-mode="join">
              <strong>Join household</strong>
              <span>Use an invite code from a household owner.</span>
            </button>
          </div>

          <form id="householdForm" hidden>
            <label id="householdNameWrap">Household name
              <input id="householdName" maxlength="80" placeholder="The Smith Family">
            </label>
            <label id="inviteCodeWrap" hidden>Invite code
              <input id="householdInviteCode" maxlength="9" autocomplete="off" placeholder="ABCD-1234">
            </label>
            <button id="householdSubmit" class="primary-btn" type="submit">Create household</button>
            <p id="householdMessage" class="auth-message" role="status" aria-live="polite"></p>
            <button id="householdCancel" class="auth-back" type="button">Choose another option</button>
          </form>
        </div>
      </section>

      <dialog id="householdDialog" class="household-dialog">
        <form method="dialog">
          <div class="dialog-header">
            <div><p class="eyebrow">HOUSEHOLD</p><h2 id="householdDialogName">Household</h2></div>
            <button class="icon-button" value="cancel" aria-label="Close">✕</button>
          </div>
          <div class="dialog-body">
            <div class="invite-panel"><span>Invite code</span><strong id="householdCode">—</strong><button id="copyInviteCode" type="button" class="secondary-btn">Copy code</button></div>
            <div><p class="eyebrow">MEMBERS</p><div id="householdMemberList" class="member-list"></div></div>
          </div>
        </form>
      </dialog>`;
  }

  function mount() {
    if (document.getElementById("householdGate")) return;
    document.body.insertAdjacentHTML("beforeend", markup());
    document.querySelectorAll("[data-household-mode]").forEach((button) => {
      button.addEventListener("click", () => chooseMode(button.dataset.householdMode));
    });
    document.getElementById("householdCancel").addEventListener("click", resetChoices);
    document.getElementById("householdForm").addEventListener("submit", submitHousehold);
    document.getElementById("copyInviteCode").addEventListener("click", copyCode);
  }

  function setPlannerVisible(visible) {
    document.body.classList.toggle("household-locked", !visible);
    [".app-shell", ".floating-add", ".bottom-nav"].forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => element.toggleAttribute("inert", !visible));
    });
    document.getElementById("householdGate").hidden = visible;
  }

  function chooseMode(mode) {
    const form = document.getElementById("householdForm");
    form.dataset.mode = mode;
    form.hidden = false;
    document.querySelector(".household-choice").hidden = true;
    document.getElementById("householdNameWrap").hidden = mode !== "create";
    document.getElementById("inviteCodeWrap").hidden = mode !== "join";
    document.getElementById("householdSubmit").textContent = mode === "create" ? "Create household" : "Join household";
    document.getElementById(mode === "create" ? "householdName" : "householdInviteCode").focus();
  }

  function resetChoices() {
    const form = document.getElementById("householdForm");
    form.reset();
    form.hidden = true;
    document.querySelector(".household-choice").hidden = false;
    setMessage("");
  }

  function setMessage(message, type = "") {
    const element = document.getElementById("householdMessage");
    element.textContent = message;
    element.dataset.type = type;
  }

  async function submitHousehold(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = document.getElementById("householdSubmit");
    submit.disabled = true;
    setMessage("Working…");
    try {
      const mode = form.dataset.mode;
      const args = mode === "create"
        ? { household_name: document.getElementById("householdName").value.trim() }
        : { code: document.getElementById("householdInviteCode").value.trim().toUpperCase() };
      const functionName = mode === "create" ? "create_household" : "join_household";
      const { data, error } = await client.rpc(functionName, args);
      if (error) throw error;
      currentHousehold = Array.isArray(data) ? data[0] : data;
      setMessage(mode === "create" ? "Household created." : "Household joined.", "success");
      await loadHousehold();
    } catch (error) {
      setMessage(error?.message || "Household setup failed.", "error");
    } finally {
      submit.disabled = false;
    }
  }

  async function loadHousehold() {
    const { data: membership, error } = await client
      .from("household_members")
      .select("household_id, role, joined_at, households(id,name,invite_code,created_by)")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Household lookup failed", error);
      setPlannerVisible(false);
      return null;
    }
    if (!membership) {
      currentHousehold = null;
      setPlannerVisible(false);
      return null;
    }

    currentHousehold = { ...membership.households, role: membership.role };
    setPlannerVisible(true);
    installHouseholdButton();
    document.documentElement.dataset.householdId = currentHousehold.id;
    window.dispatchEvent(new CustomEvent("corvus:household-ready", { detail: currentHousehold }));
    return currentHousehold;
  }

  function installHouseholdButton() {
    let button = document.getElementById("householdMenuButton");
    if (!button) {
      const accountPanel = document.querySelector(".account-panel");
      if (!accountPanel) return;
      accountPanel.insertAdjacentHTML("beforebegin", `<button id="householdMenuButton" class="household-menu-button" type="button"><span>Household</span><strong></strong></button>`);
      button = document.getElementById("householdMenuButton");
      button.addEventListener("click", openHouseholdDialog);
    }
    button.querySelector("strong").textContent = currentHousehold.name;
  }

  async function openHouseholdDialog() {
    document.getElementById("householdDialogName").textContent = currentHousehold.name;
    document.getElementById("householdCode").textContent = currentHousehold.invite_code;
    const { data, error } = await client
      .from("household_members")
      .select("user_id, role, joined_at")
      .eq("household_id", currentHousehold.id)
      .order("joined_at");
    const list = document.getElementById("householdMemberList");
    if (error) list.innerHTML = `<p class="auth-message" data-type="error">${escapeHtml(error.message)}</p>`;
    else list.innerHTML = data.map((member, index) => `<article><span>${index + 1}</span><div><strong>${member.user_id === (window.corvusAuth?.user?.id || "") ? "You" : "Household member"}</strong><small>${member.role}</small></div></article>`).join("");
    document.getElementById("householdDialog").showModal();
  }

  async function copyCode() {
    await navigator.clipboard.writeText(currentHousehold.invite_code);
    const button = document.getElementById("copyInviteCode");
    button.textContent = "Copied";
    setTimeout(() => { button.textContent = "Copy code"; }, 1200);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[character]);
  }

  async function initialize(supabaseClient) {
    client = supabaseClient;
    mount();
    return loadHousehold();
  }

  window.corvusHouseholds = { initialize, loadHousehold, get current() { return currentHousehold; } };
})();