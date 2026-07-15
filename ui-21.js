(() => {
  "use strict";

  const body = document.body;
  body.classList.add("rb21");

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }

  function longDate() {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    }).format(new Date());
  }

  function text(node, fallback = "") {
    return node?.textContent?.trim() || fallback;
  }

  function rowData(row) {
    const billCell = row.querySelector('[data-label="Bill"]');
    return {
      id: row.dataset.billId || "",
      name: text(billCell?.querySelector("strong"), "Bill"),
      secondary: text(billCell?.querySelector("small"), "Scheduled bill"),
      icon: text(billCell?.querySelector(".bill-avatar"), "•"),
      due: text(row.querySelector('[data-label="Due"]'), "Upcoming"),
      amount: text(row.querySelector('[data-label="Amount"]'), "")
    };
  }

  function agendaItem(item) {
    return `
      <button class="rb21-agenda-item" data-action="open-bill" data-bill-id="${escapeHTML(item.id)}">
        <span class="rb21-agenda-icon">${escapeHTML(item.icon)}</span>
        <span class="rb21-agenda-copy">
          <strong>${escapeHTML(item.name)}</strong>
          <small>${escapeHTML(item.secondary)} · ${escapeHTML(item.due)}</small>
        </span>
        <span class="rb21-agenda-amount">${escapeHTML(item.amount)}</span>
      </button>`;
  }

  function enhanceDashboard() {
    const app = document.querySelector("#app");
    const stack = app?.querySelector(":scope > .page-stack");
    if (!stack || stack.querySelector(".rb21-dashboard-block")) return;

    const tableRows = [...stack.querySelectorAll(".bill-table tbody tr")].map(rowData);
    const today = tableRows.slice(0, 3);
    const upcoming = tableRows.slice(3, 7);

    const block = document.createElement("div");
    block.className = "rb21-dashboard-block";
    block.innerHTML = `
      <section class="rb21-intro">
        <div>
          <h2>${greeting()} <span aria-hidden="true">👋</span></h2>
          <p>${escapeHTML(longDate())} · Here is what needs your attention.</p>
        </div>
        <span class="rb21-version">RavenBill 2.1 Preview</span>
      </section>
      <section class="rb21-today-grid">
        <article class="section-panel rb21-today-card">
          <div class="panel-header">
            <div><h2>Today</h2><p>Your highest-priority bills</p></div>
            <button class="secondary-button" data-page="bills">View all</button>
          </div>
          <div class="rb21-agenda">
            ${today.length ? today.map(agendaItem).join("") : '<div class="rb21-empty">Nothing needs attention right now.</div>'}
          </div>
        </article>
        <article class="section-panel rb21-today-card">
          <div class="panel-header">
            <div><h2>Upcoming</h2><p>What is coming next</p></div>
            <button class="secondary-button" data-page="calendar">Calendar</button>
          </div>
          <div class="rb21-agenda">
            ${upcoming.length ? upcoming.map(agendaItem).join("") : '<div class="rb21-empty">No additional bills are scheduled.</div>'}
          </div>
        </article>
      </section>`;

    stack.prepend(block);
  }

  function refreshChrome() {
    document.title = "RavenBill 2.1";
    document.querySelectorAll(".brand-copy strong").forEach(node => { node.textContent = "RAVENBILL 2.1"; });
    document.querySelectorAll(".mobile-brand strong").forEach(node => { node.textContent = "RavenBill 2.1"; });
    const subtitle = document.querySelector("#pageSubtitle");
    if (subtitle && document.querySelector('.nav-item.active[data-page="dashboard"]')) {
      subtitle.textContent = "Today, upcoming bills, and monthly progress";
    }
  }

  let queued = false;
  function scheduleEnhancement() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      refreshChrome();
      enhanceDashboard();
    });
  }

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("hashchange", scheduleEnhancement);
  window.addEventListener("DOMContentLoaded", scheduleEnhancement);
  scheduleEnhancement();
})();
