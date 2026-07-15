(() => {
  "use strict";

  const APP_VERSION = 1;
  const STORAGE_KEY = "ravenbill.clean.v1";
  const LEGACY_KEY = "ravenbill.v30";

  const TYPE_META = {
    standard: { label: "Standard Bill", short: "Standard", icon: "⌂" },
    creditCard: { label: "Credit Card", short: "Credit Card", icon: "▭" },
    subscription: { label: "Subscription", short: "Subscription", icon: "⟳" },
    loan: { label: "Loan", short: "Loan", icon: "▦" },
    oneTime: { label: "One-Time Bill", short: "One-Time", icon: "▣" }
  };

  const CATEGORY_ICONS = {
    Housing: "⌂",
    Utilities: "ϟ",
    Insurance: "◇",
    Transportation: "▰",
    Debt: "♙",
    Entertainment: "▦",
    Subscriptions: "⟳",
    Loans: "▥",
    Health: "✚",
    Food: "◉",
    Education: "□",
    Other: "•"
  };

  const CATEGORIES = Object.keys(CATEGORY_ICONS);

  const PAGE_META = {
    dashboard: ["Dashboard", "Your month at a glance"],
    bills: ["Bills", "Manage all your bills and payments"],
    calendar: ["Calendar", "See every due date in one place"],
    history: ["History", "Review recorded payments"],
    reports: ["Reports", "Understand where your money is going"],
    settings: ["Settings", "Backups, reminders, and app preferences"]
  };

  let state;
  let ui = {
    page: "dashboard",
    billTab: "all",
    search: "",
    filters: { status: "all", autopay: "all", category: "all" },
    selectedBillId: null,
    detailTab: "details",
    billStep: 1,
    billDraft: null,
    editingBillId: null,
    paymentBillId: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function uuid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `rb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function num(value, fallback = 0) {
    const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function localDate(value) {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
    if (!value) return new Date();
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  function todayISO() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function currentMonthKey() {
    return todayISO().slice(0, 7);
  }

  function normalizeMonthKey(value) {
    return /^\d{4}-\d{2}$/.test(String(value || "")) ? String(value) : currentMonthKey();
  }

  function monthDate(key) {
    const [year, month] = normalizeMonthKey(key).split("-").map(Number);
    return new Date(year, month - 1, 1, 12);
  }

  function addMonths(key, amount) {
    const date = monthDate(key);
    date.setMonth(date.getMonth() + amount);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthDifference(fromKey, toKey) {
    const a = monthDate(fromKey);
    const b = monthDate(toKey);
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  }

  function monthLabel(key, style = "long") {
    return new Intl.DateTimeFormat(undefined, {
      month: style === "short" ? "short" : "long",
      year: "numeric"
    }).format(monthDate(key));
  }

  function dateLabel(value, includeYear = true) {
    if (!value) return "—";
    const options = includeYear
      ? { month: "short", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric" };
    return new Intl.DateTimeFormat(undefined, options).format(localDate(value));
  }

  function dateForMonth(key, dueDay) {
    const date = monthDate(key);
    const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const day = clamp(Math.round(num(dueDay, 1)), 1, days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: state?.settings?.currency || "USD",
      minimumFractionDigits: 2
    }).format(num(value));
  }

  function daysFromToday(value) {
    const oneDay = 86400000;
    return Math.round((localDate(value) - localDate(todayISO())) / oneDay);
  }

  function normalizeAutopay(value, fallback = "off") {
    if (value === true) return "full";
    if (value === false || value == null || value === "") return fallback;
    const normalized = String(value);
    return normalized === "true" ? "full" : normalized === "false" ? "off" : normalized;
  }

  function isAutopayOn(bill) {
    return !["off", "none", "", null, undefined, false].includes(normalizeAutopay(bill.autopay));
  }

  function typeLabel(type) {
    return TYPE_META[type]?.label || TYPE_META.standard.label;
  }

  function typeIcon(type) {
    return TYPE_META[type]?.icon || TYPE_META.standard.icon;
  }

  function typeClass(type) {
    return TYPE_META[type] ? type : "standard";
  }

  function defaultState() {
    return {
      version: APP_VERSION,
      selectedMonth: currentMonthKey(),
      templates: [],
      months: {},
      payments: [],
      settings: {
        currency: "USD",
        backupReminderDays: 30,
        lastBackupAt: null,
        notificationsEnabled: false,
        lastNotificationDate: null
      },
      metadata: {
        createdAt: new Date().toISOString(),
        migratedFromLegacy: false
      }
    };
  }

  function normalizeTemplate(template) {
    const type = TYPE_META[template?.type] ? template.type : "standard";
    const startMonth = normalizeMonthKey(template?.startMonth || currentMonthKey());
    return {
      id: template?.id || uuid(),
      name: String(template?.name || "Untitled Bill").trim(),
      type,
      category: CATEGORIES.includes(template?.category) ? template.category : defaultCategoryForType(type),
      frequency: ["monthly", "yearly", "oneTime"].includes(template?.frequency)
        ? template.frequency
        : type === "oneTime" ? "oneTime" : "monthly",
      startMonth,
      endMonth: /^\d{4}-\d{2}$/.test(template?.endMonth || "") ? template.endMonth : null,
      annualMonth: clamp(num(template?.annualMonth, Number(startMonth.slice(5, 7))), 1, 12),
      dueDay: clamp(num(template?.dueDay, 1), 1, 31),
      amount: Math.max(0, num(template?.amount)),
      amountBehavior: ["fixed", "previous", "manual"].includes(template?.amountBehavior)
        ? template.amountBehavior
        : type === "subscription" || type === "loan" ? "fixed" : "previous",
      autopay: normalizeAutopay(template?.autopay),
      reminderDays: clamp(num(template?.reminderDays, 3), 0, 30),
      active: template?.active !== false,
      notes: String(template?.notes || ""),
      paymentMethod: String(template?.paymentMethod || ""),
      renewalDate: template?.renewalDate || "",
      subscriptionStatus: ["active", "paused", "canceled"].includes(template?.subscriptionStatus)
        ? template.subscriptionStatus
        : "active",
      last4: String(template?.last4 || "").replace(/\D/g, "").slice(-4),
      creditLimit: Math.max(0, num(template?.creditLimit)),
      paymentBehavior: ["manual", "previous"].includes(template?.paymentBehavior)
        ? template.paymentBehavior
        : "manual",
      defaultPlannedPayment: Math.max(0, num(template?.defaultPlannedPayment ?? template?.amount)),
      lender: String(template?.lender || ""),
      remainingBalance: Math.max(0, num(template?.remainingBalance)),
      createdAt: template?.createdAt || new Date().toISOString(),
      updatedAt: template?.updatedAt || new Date().toISOString()
    };
  }

  function normalizeBill(bill, monthKeyValue) {
    const type = TYPE_META[bill?.type] ? bill.type : "standard";
    const amount = Math.max(0, num(bill?.amount ?? bill?.plannedPayment));
    return {
      id: bill?.id || uuid(),
      templateId: bill?.templateId || bill?.sourceTemplateId || null,
      monthKey: normalizeMonthKey(bill?.monthKey || monthKeyValue),
      name: String(bill?.name || "Untitled Bill").trim(),
      type,
      category: CATEGORIES.includes(bill?.category) ? bill.category : defaultCategoryForType(type),
      dueDate: bill?.dueDate || dateForMonth(monthKeyValue, bill?.dueDay || 1),
      amount,
      amountBehavior: ["fixed", "previous", "manual"].includes(bill?.amountBehavior)
        ? bill.amountBehavior
        : "previous",
      autopay: normalizeAutopay(bill?.autopay),
      reminderDays: clamp(num(bill?.reminderDays, 3), 0, 30),
      paid: Boolean(bill?.paid),
      paidAt: bill?.paidAt || null,
      actualPaid: bill?.actualPaid == null ? null : Math.max(0, num(bill.actualPaid)),
      confirmation: String(bill?.confirmation || ""),
      paymentNote: String(bill?.paymentNote || ""),
      notes: String(bill?.notes || ""),
      statementBalance: Math.max(0, num(bill?.statementBalance)),
      minimumPayment: Math.max(0, num(bill?.minimumPayment)),
      plannedPayment: Math.max(0, num(bill?.plannedPayment ?? amount)),
      last4: String(bill?.last4 || "").replace(/\D/g, "").slice(-4),
      creditLimit: Math.max(0, num(bill?.creditLimit)),
      paymentBehavior: ["manual", "previous"].includes(bill?.paymentBehavior) ? bill.paymentBehavior : "manual",
      paymentMethod: String(bill?.paymentMethod || ""),
      renewalDate: bill?.renewalDate || "",
      subscriptionStatus: ["active", "paused", "canceled"].includes(bill?.subscriptionStatus)
        ? bill.subscriptionStatus
        : "active",
      lender: String(bill?.lender || ""),
      remainingBalance: Math.max(0, num(bill?.remainingBalance)),
      custom: Boolean(bill?.custom),
      createdAt: bill?.createdAt || new Date().toISOString(),
      updatedAt: bill?.updatedAt || new Date().toISOString()
    };
  }

  function normalizeState(raw) {
    const clean = defaultState();
    clean.version = APP_VERSION;
    clean.selectedMonth = normalizeMonthKey(raw?.selectedMonth);
    clean.templates = Array.isArray(raw?.templates) ? raw.templates.map(normalizeTemplate) : [];
    clean.months = {};
    if (raw?.months && typeof raw.months === "object") {
      Object.entries(raw.months).forEach(([key, month]) => {
        if (!/^\d{4}-\d{2}$/.test(key)) return;
        clean.months[key] = {
          key,
          createdAt: month?.createdAt || new Date().toISOString(),
          bills: Array.isArray(month?.bills) ? month.bills.map(bill => normalizeBill(bill, key)) : []
        };
      });
    }
    clean.payments = Array.isArray(raw?.payments) ? raw.payments.map(payment => ({
      id: payment?.id || uuid(),
      billId: payment?.billId || null,
      templateId: payment?.templateId || null,
      billName: String(payment?.billName || "Bill"),
      billType: TYPE_META[payment?.billType] ? payment.billType : "standard",
      monthKey: normalizeMonthKey(payment?.monthKey),
      amount: Math.max(0, num(payment?.amount)),
      paidAt: payment?.paidAt || todayISO(),
      confirmation: String(payment?.confirmation || ""),
      note: String(payment?.note || ""),
      createdAt: payment?.createdAt || new Date().toISOString()
    })) : [];
    clean.settings = { ...clean.settings, ...(raw?.settings || {}) };
    clean.metadata = { ...clean.metadata, ...(raw?.metadata || {}) };
    return clean;
  }

  function migrateLegacyState() {
    const legacyText = localStorage.getItem(LEGACY_KEY);
    if (!legacyText) return null;
    try {
      const legacy = JSON.parse(legacyText);
      const migrated = defaultState();
      migrated.metadata.migratedFromLegacy = true;

      const legacyTemplates = Array.isArray(legacy?.template) ? legacy.template : [];
      migrated.templates = legacyTemplates.map(old => normalizeTemplate({
        id: old.id || uuid(),
        name: old.name || old.title || "Imported Bill",
        type: "standard",
        category: old.category || "Other",
        frequency: old.frequency || "monthly",
        startMonth: old.startMonth || currentMonthKey(),
        annualMonth: old.annualMonth,
        dueDay: old.dueDay || old.day || 1,
        amount: old.amount || 0,
        amountBehavior: old.amountBehavior || "previous",
        autopay: old.autopay ? "full" : "off",
        reminderDays: old.reminderDays || 3,
        notes: old.notes || ""
      }));

      if (legacy?.months && typeof legacy.months === "object") {
        Object.entries(legacy.months).forEach(([key, oldMonth]) => {
          if (!/^\d{4}-\d{2}$/.test(key)) return;
          migrated.months[key] = {
            key,
            createdAt: oldMonth?.createdAt || new Date().toISOString(),
            bills: Array.isArray(oldMonth?.bills)
              ? oldMonth.bills.map(oldBill => normalizeBill({
                  ...oldBill,
                  templateId: oldBill.sourceTemplateId || oldBill.templateId || null,
                  monthKey: key,
                  dueDate: oldBill.dueDate || dateForMonth(key, oldBill.dueDay || 1),
                  autopay: oldBill.autopay ? "full" : "off",
                  amountBehavior: oldBill.amountBehavior || "previous",
                  actualPaid: oldBill.paid ? oldBill.amount : null
                }, key))
              : []
          };
        });
      }
      migrated.selectedMonth = normalizeMonthKey(legacy?.selectedMonth || currentMonthKey());
      toast("Existing RavenBill data was imported into the clean format.", "success");
      return migrated;
    } catch (error) {
      console.warn("Legacy migration failed:", error);
      return null;
    }
  }

  function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        state = normalizeState(JSON.parse(saved));
      } catch (error) {
        console.error("Could not read RavenBill data:", error);
        state = defaultState();
      }
    } else {
      state = migrateLegacyState() || defaultState();
    }
    state.selectedMonth = normalizeMonthKey(state.selectedMonth);
    ensureMonth(state.selectedMonth);
    saveState();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function defaultCategoryForType(type) {
    if (type === "creditCard") return "Debt";
    if (type === "subscription") return "Subscriptions";
    if (type === "loan") return "Loans";
    return "Other";
  }

  function templateOccursInMonth(template, key) {
    if (!template.active) return false;
    if (template.subscriptionStatus === "canceled") return false;
    if (template.subscriptionStatus === "paused") return false;
    if (monthDifference(template.startMonth, key) < 0) return false;
    if (template.endMonth && monthDifference(key, template.endMonth) < 0) return false;
    if (template.frequency === "oneTime" || template.type === "oneTime") return template.startMonth === key;
    if (template.frequency === "yearly") return Number(key.slice(5, 7)) === Number(template.annualMonth);
    return true;
  }

  function previousBillForTemplate(templateId, beforeMonth) {
    const keys = Object.keys(state.months)
      .filter(key => key < beforeMonth)
      .sort()
      .reverse();
    for (const key of keys) {
      const found = state.months[key]?.bills?.find(bill => bill.templateId === templateId);
      if (found) return found;
    }
    return null;
  }

  function initialAmountForTemplate(template, key) {
    const previous = previousBillForTemplate(template.id, key);
    if (template.type === "creditCard") {
      if (template.paymentBehavior === "previous" && previous) {
        return Math.max(0, num(previous.plannedPayment ?? previous.amount));
      }
      return Math.max(0, num(template.defaultPlannedPayment));
    }
    if (template.type === "subscription") return Math.max(0, num(template.amount));
    if (template.type === "oneTime") return Math.max(0, num(template.amount));
    if (template.amountBehavior === "fixed") return Math.max(0, num(template.amount));
    if (template.amountBehavior === "manual") return 0;
    if (previous && num(previous.amount) > 0) return Math.max(0, num(previous.amount));
    return Math.max(0, num(template.amount));
  }

  function createBillInstance(template, key) {
    const amount = initialAmountForTemplate(template, key);
    return normalizeBill({
      id: uuid(),
      templateId: template.id,
      monthKey: key,
      name: template.name,
      type: template.type,
      category: template.category,
      dueDate: dateForMonth(key, template.dueDay),
      amount,
      amountBehavior: template.amountBehavior,
      autopay: template.autopay,
      reminderDays: template.reminderDays,
      paid: false,
      actualPaid: null,
      notes: template.notes,
      statementBalance: 0,
      minimumPayment: 0,
      plannedPayment: template.type === "creditCard" ? amount : 0,
      last4: template.last4,
      creditLimit: template.creditLimit,
      paymentBehavior: template.paymentBehavior,
      paymentMethod: template.paymentMethod,
      renewalDate: template.renewalDate,
      subscriptionStatus: template.subscriptionStatus,
      lender: template.lender,
      remainingBalance: template.remainingBalance
    }, key);
  }

  function ensureMonth(key, announceRepair = false) {
    const normalizedKey = normalizeMonthKey(key);
    if (!state.months[normalizedKey]) {
      state.months[normalizedKey] = {
        key: normalizedKey,
        createdAt: new Date().toISOString(),
        bills: []
      };
    }
    const month = state.months[normalizedKey];
    let added = 0;
    state.templates.forEach(template => {
      if (!templateOccursInMonth(template, normalizedKey)) return;
      if (month.bills.some(bill => bill.templateId === template.id)) return;
      month.bills.push(createBillInstance(template, normalizedKey));
      added += 1;
    });
    month.bills = month.bills.map(bill => normalizeBill(bill, normalizedKey));
    if (added) saveState();
    if (announceRepair) toast(added ? `${added} missing bill${added === 1 ? "" : "s"} restored.` : "This month is already complete.", "success");
    return month;
  }

  function currentBills() {
    return ensureMonth(state.selectedMonth).bills;
  }

  function findBill(id) {
    return currentBills().find(bill => bill.id === id) || null;
  }

  function billAmount(bill) {
    return bill.type === "creditCard" ? Math.max(0, num(bill.plannedPayment ?? bill.amount)) : Math.max(0, num(bill.amount));
  }

  function billPaidAmount(bill) {
    if (!bill.paid) return 0;
    return Math.max(0, num(bill.actualPaid ?? billAmount(bill)));
  }

  function billStatus(bill) {
    if (bill.paid) return "paid";
    const days = daysFromToday(bill.dueDate);
    if (days < 0) return "overdue";
    if (days === 0) return "dueToday";
    if (days <= 7) return "dueSoon";
    return "unpaid";
  }

  function statusLabel(status) {
    return {
      paid: "Paid",
      overdue: "Overdue",
      dueToday: "Due Today",
      dueSoon: "Due Soon",
      unpaid: "Unpaid"
    }[status] || "Unpaid";
  }

  function summaryForBills(bills) {
    const total = bills.reduce((sum, bill) => sum + billAmount(bill), 0);
    const paid = bills.reduce((sum, bill) => sum + billPaidAmount(bill), 0);
    const remaining = Math.max(0, total - paid);
    const dueToday = bills.filter(bill => billStatus(bill) === "dueToday");
    const dueSoon = bills.filter(bill => billStatus(bill) === "dueSoon");
    const overdue = bills.filter(bill => billStatus(bill) === "overdue");
    const subscriptions = bills.filter(bill => bill.type === "subscription").reduce((sum, bill) => sum + billAmount(bill), 0);
    const creditCards = bills.filter(bill => bill.type === "creditCard").reduce((sum, bill) => sum + billAmount(bill), 0);
    return {
      total,
      paid,
      remaining,
      percent: total > 0 ? clamp(Math.round((paid / total) * 100), 0, 100) : 0,
      dueToday,
      dueSoon,
      overdue,
      subscriptions,
      creditCards
    };
  }

  function sortedBills(bills = currentBills()) {
    return [...bills].sort((a, b) => {
      if (a.paid !== b.paid) return a.paid ? 1 : -1;
      return String(a.dueDate).localeCompare(String(b.dueDate)) || a.name.localeCompare(b.name);
    });
  }

  function matchesFilters(bill) {
    if (ui.search) {
      const haystack = `${bill.name} ${bill.category} ${typeLabel(bill.type)} ${bill.last4}`.toLowerCase();
      if (!haystack.includes(ui.search.toLowerCase())) return false;
    }
    if (ui.filters.category !== "all" && bill.category !== ui.filters.category) return false;
    if (ui.filters.autopay === "on" && !isAutopayOn(bill)) return false;
    if (ui.filters.autopay === "off" && isAutopayOn(bill)) return false;
    if (ui.filters.status !== "all") {
      const status = billStatus(bill);
      if (ui.filters.status === "dueSoon" && !["dueSoon", "dueToday"].includes(status)) return false;
      if (ui.filters.status !== "dueSoon" && status !== ui.filters.status) return false;
    }
    return true;
  }

  function filteredBills() {
    const type = ui.billTab;
    return sortedBills(currentBills().filter(bill => {
      if (type !== "all" && bill.type !== type) return false;
      return matchesFilters(bill);
    }));
  }

  function setPage(page) {
    if (!PAGE_META[page]) return;
    ui.page = page;
    ui.selectedBillId = null;
    closeDrawer();
    history.replaceState(null, "", `#${page}`);
    render();
    requestAnimationFrame(() => $("#app")?.focus({ preventScroll: true }));
  }

  function changeMonth(delta) {
    state.selectedMonth = addMonths(state.selectedMonth, delta);
    ensureMonth(state.selectedMonth);
    saveState();
    closeDrawer();
    render();
  }

  function setMonth(key) {
    state.selectedMonth = normalizeMonthKey(key);
    ensureMonth(state.selectedMonth);
    saveState();
    closeDrawer();
    render();
  }

  function render() {
    ensureMonth(state.selectedMonth);
    renderChrome();
    const app = $("#app");
    if (!app) return;
    const renderers = {
      dashboard: renderDashboard,
      bills: renderBills,
      calendar: renderCalendar,
      history: renderHistory,
      reports: renderReports,
      settings: renderSettings
    };
    app.innerHTML = renderers[ui.page]();
    renderRightRail();
    updateBackupCard();
  }

  function renderChrome() {
    const [title, subtitle] = PAGE_META[ui.page];
    $("#pageTitle").textContent = title;
    $("#pageSubtitle").textContent = subtitle;
    $("#selectedMonthLabel").textContent = monthLabel(state.selectedMonth);
    $("#monthPicker").value = state.selectedMonth;
    $("#globalSearch").value = ui.search;
    $$(".nav-item, .mobile-nav button").forEach(button => {
      button.classList.toggle("active", button.dataset.page === ui.page);
    });
  }

  function overviewHTML(summary) {
    const daysLeft = (() => {
      const selected = monthDate(state.selectedMonth);
      const today = localDate(todayISO());
      if (selected.getFullYear() !== today.getFullYear() || selected.getMonth() !== today.getMonth()) return monthLabel(state.selectedMonth);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      return `${last - today.getDate()} days left`;
    })();
    return `
      <section class="overview-card">
        <div>
          <span class="kicker">${esc(monthLabel(state.selectedMonth))} Overview</span>
          <div class="overview-total">${formatMoney(summary.total)}</div>
          <span class="muted">${summary.total ? `${currentBills().length} bill${currentBills().length === 1 ? "" : "s"} planned` : "No bills planned yet"}</span>
        </div>
        <div class="progress-ring" style="--progress:${summary.percent * 3.6}deg">
          <div class="progress-ring-content"><strong>${summary.percent}%</strong><span>Paid</span></div>
        </div>
        <div class="overview-breakdown">
          <div class="paid"><small>Paid</small><strong>${formatMoney(summary.paid)}</strong></div>
          <div><small>Remaining</small><strong>${formatMoney(summary.remaining)}</strong></div>
        </div>
        <div class="overview-progress">
          <div class="progress-track"><span style="width:${summary.percent}%"></span></div>
          <div class="progress-meta"><span>${summary.percent}% of planned bills paid</span><span>${esc(daysLeft)}</span></div>
        </div>
      </section>`;
  }

  function statusCardHTML(className, icon, label, bills) {
    const amount = bills.reduce((sum, bill) => sum + billAmount(bill), 0);
    return `
      <button class="status-card ${className}" data-action="status-filter" data-status="${label === "Overdue" ? "overdue" : label === "Due Soon" ? "dueSoon" : "dueToday"}">
        <span class="status-icon">${icon}</span>
        <span><small>${esc(label)}</small><strong>${bills.length}</strong><span class="amount">${bills.length} bill${bills.length === 1 ? "" : "s"}</span></span>
        <span class="amount">${formatMoney(amount)} ›</span>
      </button>`;
  }

  function renderDashboard() {
    const bills = currentBills();
    const summary = summaryForBills(bills);
    const recent = sortedBills(bills).slice(0, 8);
    return `
      <div class="page-stack">
        ${overviewHTML(summary)}
        <section class="status-grid">
          ${statusCardHTML("green", "✓", "Due Today", summary.dueToday)}
          ${statusCardHTML("amber", "◷", "Due Soon", summary.dueSoon)}
          ${statusCardHTML("red", "!", "Overdue", summary.overdue)}
        </section>
        <section class="section-panel">
          <div class="panel-header">
            <div><h2>Recent Bills</h2><p>Your current month, sorted by what needs attention</p></div>
            <button class="secondary-button" data-page="bills">View all bills</button>
          </div>
          ${billTableHTML(recent, true)}
        </section>
      </div>`;
  }

  function activeFilterChipsHTML() {
    const chips = [];
    if (ui.filters.status !== "all") chips.push(`Status: ${ui.filters.status === "dueSoon" ? "Due soon" : statusLabel(ui.filters.status)}`);
    if (ui.filters.autopay !== "all") chips.push(`Autopay: ${ui.filters.autopay}`);
    if (ui.filters.category !== "all") chips.push(ui.filters.category);
    if (ui.search) chips.push(`Search: “${ui.search}”`);
    if (!chips.length) return "";
    return `<div class="filter-summary">${chips.map(chip => `<span class="filter-chip">${esc(chip)}</span>`).join("")}<button class="filter-chip" data-action="clear-filters">Clear all ×</button></div>`;
  }

  function renderBills() {
    const bills = filteredBills();
    const summary = summaryForBills(currentBills());
    const tabs = [
      ["all", "All Bills"],
      ["standard", "Standard Bills"],
      ["creditCard", "Credit Cards"],
      ["subscription", "Subscriptions"],
      ["loan", "Loans"],
      ["oneTime", "One-Time"]
    ];
    return `
      <div class="page-stack">
        <div class="tabbar">
          ${tabs.map(([key, label]) => `<button class="tab-button ${ui.billTab === key ? "active" : ""}" data-action="bill-tab" data-tab="${key}">${label}</button>`).join("")}
        </div>
        <section class="summary-grid">
          <div class="summary-card active"><span class="summary-label">▤ Total Planned</span><strong>${formatMoney(summary.total)}</strong><small>This month</small></div>
          <div class="summary-card"><span class="summary-label">✓ Paid</span><strong>${formatMoney(summary.paid)}</strong><small>${summary.percent}% of total</small></div>
          <div class="summary-card"><span class="summary-label">◒ Remaining</span><strong>${formatMoney(summary.remaining)}</strong><small>${100 - summary.percent}% of total</small></div>
          <div class="summary-card"><span class="summary-label">◷ Subscriptions</span><strong>${formatMoney(summary.subscriptions)}</strong><small>Monthly plan</small></div>
          <div class="summary-card"><span class="summary-label">▭ Card Payments</span><strong>${formatMoney(summary.creditCards)}</strong><small>Planned payments</small></div>
        </section>
        ${activeFilterChipsHTML()}
        <section class="section-panel">
          ${billTableHTML(bills)}
        </section>
      </div>`;
  }

  function billTableHTML(bills, compact = false) {
    if (!bills.length) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">▤</div>
          <h3>No bills found</h3>
          <p>${currentBills().length ? "Try clearing the search or filters." : "Add your first bill to build this month’s plan."}</p>
          <button class="primary-button" data-action="${currentBills().length ? "clear-filters" : "add-bill"}">${currentBills().length ? "Clear filters" : "＋ Add Bill"}</button>
        </div>`;
    }
    return `
      <div class="table-wrap">
        <table class="bill-table">
          <thead><tr>
            <th>Status</th><th>Bill / Payee</th><th>Type</th><th>Due Date</th><th>Amount (Planned)</th><th>Autopay</th>${compact ? "" : "<th>Category</th>"}<th>Actions</th>
          </tr></thead>
          <tbody>
            ${bills.map(bill => {
              const autopayLabel = bill.autopay === "minimum" ? "Minimum" : bill.autopay === "statement" ? "Statement" : isAutopayOn(bill) ? "On" : "Off";
              return `
                <tr data-action="open-bill" data-bill-id="${bill.id}">
                  <td data-label="Status"><button class="status-toggle ${bill.paid ? "paid" : ""}" data-action="toggle-paid" data-bill-id="${bill.id}" aria-label="${bill.paid ? "Mark unpaid" : "Mark paid"}">${bill.paid ? "✓" : ""}</button></td>
                  <td data-label="Bill">
                    <div class="bill-cell">
                      <span class="bill-avatar ${typeClass(bill.type)}">${esc(billIconText(bill))}</span>
                      <span><strong>${esc(bill.name)}${bill.type === "creditCard" && bill.last4 ? ` • ${esc(bill.last4)}` : ""}</strong><small>${esc(billSecondaryText(bill))}</small></span>
                    </div>
                  </td>
                  <td data-label="Type"><span class="type-pill ${typeClass(bill.type)}">${esc(TYPE_META[bill.type]?.short || "Standard")}</span></td>
                  <td data-label="Due">${dateLabel(bill.dueDate, false)}</td>
                  <td data-label="Amount"><span class="money">${formatMoney(billAmount(bill))}</span></td>
                  <td data-label="Autopay"><span class="badge ${autopayLabel.toLowerCase()}">${esc(autopayLabel)}</span></td>
                  ${compact ? "" : `<td data-label="Category">${esc(CATEGORY_ICONS[bill.category] || "•")} ${esc(bill.category)}</td>`}
                  <td data-label="Actions">
                    <div class="row-actions">
                      <button class="row-icon-button" data-action="edit-bill" data-bill-id="${bill.id}" aria-label="Edit ${esc(bill.name)}">✎</button>
                      <button class="row-icon-button" data-action="open-bill" data-bill-id="${bill.id}" aria-label="Open ${esc(bill.name)}">⋮</button>
                    </div>
                  </td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function billIconText(bill) {
    if (bill.type === "creditCard") return "▭";
    if (bill.type === "subscription") return (bill.name || "S").slice(0, 1).toUpperCase();
    return CATEGORY_ICONS[bill.category] || typeIcon(bill.type);
  }

  function billSecondaryText(bill) {
    if (bill.type === "creditCard") return "Credit Card";
    if (bill.type === "subscription") return bill.paymentMethod || "Subscription";
    if (bill.type === "loan") return bill.lender || "Loan payment";
    if (bill.type === "oneTime") return "One-time payment";
    return bill.notes || bill.category;
  }

  function renderRightRail() {
    const rail = $("#rightRail");
    if (!rail) return;
    if (ui.page !== "dashboard") {
      rail.innerHTML = `
        <section class="rail-panel">
          <h3>Month Tools</h3>
          <div class="quick-filters">
            <button class="quick-filter" data-action="repair-month"><span>Repair missing recurring bills</span><span>↻</span></button>
            <button class="quick-filter" data-action="export-calendar"><span>Export calendar</span><span>⇩</span></button>
            <button class="quick-filter" data-action="backup"><span>Download backup</span><span>⇩</span></button>
          </div>
        </section>`;
      return;
    }
    const bills = sortedBills(currentBills());
    const upcoming = bills.filter(bill => !bill.paid).slice(0, 7);
    const counts = {
      all: bills.length,
      paid: bills.filter(bill => bill.paid).length,
      unpaid: bills.filter(bill => !bill.paid).length,
      recurring: bills.filter(bill => bill.templateId && bill.type !== "oneTime").length,
      autopay: bills.filter(isAutopayOn).length
    };
    rail.innerHTML = `
      <section class="rail-panel">
        <h3>Quick Filters</h3>
        <div class="quick-filters">
          <button class="quick-filter" data-action="quick-filter" data-filter="all"><span>☷ All Bills</span><span class="count-bubble">${counts.all}</span></button>
          <button class="quick-filter" data-action="quick-filter" data-filter="paid"><span>✓ Paid</span><span class="count-bubble">${counts.paid}</span></button>
          <button class="quick-filter" data-action="quick-filter" data-filter="unpaid"><span>○ Unpaid</span><span class="count-bubble">${counts.unpaid}</span></button>
          <button class="quick-filter" data-action="quick-filter" data-filter="recurring"><span>⟳ Recurring</span><span class="count-bubble">${counts.recurring}</span></button>
          <button class="quick-filter" data-action="quick-filter" data-filter="autopay"><span>▣ Autopay On</span><span class="count-bubble">${counts.autopay}</span></button>
        </div>
      </section>
      <section class="rail-panel">
        <h3>Upcoming Bills</h3>
        <div class="upcoming-list">
          ${upcoming.length ? upcoming.map(bill => {
            const date = localDate(bill.dueDate);
            return `<button class="upcoming-item" data-action="open-bill" data-bill-id="${bill.id}">
              <span class="upcoming-date">${date.toLocaleString(undefined, { month: "short" }).toUpperCase()}<strong>${date.getDate()}</strong></span>
              <span class="upcoming-copy"><strong>${esc(bill.name)}</strong><small>${esc(upcomingDescription(bill))}</small></span>
              <span class="upcoming-amount">${formatMoney(billAmount(bill))}</span>
            </button>`;
          }).join("") : `<div class="tip-card">Nothing is waiting for payment this month.</div>`}
        </div>
      </section>
      <section class="rail-panel"><div class="tip-card">◇ RavenBill stores your bill information locally in this browser. Download a backup regularly so your records stay portable.</div></section>`;
  }

  function upcomingDescription(bill) {
    const days = daysFromToday(bill.dueDate);
    if (bill.paid) return "Paid";
    if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
    if (days === 0) return "Due today";
    return `Due in ${days} day${days === 1 ? "" : "s"}`;
  }

  function renderCalendar() {
    const base = monthDate(state.selectedMonth);
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysThisMonth = new Date(year, month + 1, 0).getDate();
    const daysPreviousMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      let day;
      let cellMonth = state.selectedMonth;
      let outside = false;
      if (i < firstWeekday) {
        day = daysPreviousMonth - firstWeekday + i + 1;
        cellMonth = addMonths(state.selectedMonth, -1);
        outside = true;
      } else if (i >= firstWeekday + daysThisMonth) {
        day = i - firstWeekday - daysThisMonth + 1;
        cellMonth = addMonths(state.selectedMonth, 1);
        outside = true;
      } else {
        day = i - firstWeekday + 1;
      }
      const date = dateForMonth(cellMonth, day);
      const bills = currentBills().filter(bill => bill.dueDate === date);
      cells.push(`
        <div class="calendar-day ${outside ? "outside" : ""} ${date === todayISO() ? "today" : ""}">
          <span class="day-number">${day}</span>
          <div class="day-bills">
            ${bills.slice(0, 4).map(bill => `<button class="calendar-bill ${bill.paid ? "paid" : ""}" data-action="open-bill" data-bill-id="${bill.id}" title="${esc(bill.name)} — ${formatMoney(billAmount(bill))}">${esc(bill.name)}</button>`).join("")}
          </div>
        </div>`);
    }
    return `
      <div class="page-stack">
        <section class="section-panel calendar-shell">
          <div class="panel-header">
            <div><h2>${esc(monthLabel(state.selectedMonth))}</h2><p>${currentBills().length} bill${currentBills().length === 1 ? "" : "s"} scheduled</p></div>
            <button class="secondary-button" data-action="export-calendar">⇩ Export Calendar</button>
          </div>
          <div class="calendar-weekdays">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => `<div>${day}</div>`).join("")}</div>
          <div class="calendar-grid">${cells.join("")}</div>
        </section>
      </div>`;
  }

  function renderHistory() {
    const payments = [...state.payments].sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
    const monthPayments = payments.filter(payment => payment.monthKey === state.selectedMonth);
    const total = monthPayments.reduce((sum, payment) => sum + payment.amount, 0);
    return `
      <div class="page-stack">
        <section class="summary-grid">
          <div class="summary-card active"><span class="summary-label">✓ Payments Recorded</span><strong>${monthPayments.length}</strong><small>${monthLabel(state.selectedMonth)}</small></div>
          <div class="summary-card"><span class="summary-label">$ Amount Paid</span><strong>${formatMoney(total)}</strong><small>Recorded actual payments</small></div>
          <div class="summary-card"><span class="summary-label">▤ All-Time Records</span><strong>${payments.length}</strong><small>Across every month</small></div>
        </section>
        <section class="section-panel">
          <div class="panel-header"><div><h2>Payment History</h2><p>Confirmation numbers and notes remain in your local backup</p></div></div>
          ${payments.length ? `<div class="history-list">${payments.map(payment => `
            <article class="history-item">
              <span class="history-icon">✓</span>
              <span class="history-copy"><strong>${esc(payment.billName)}</strong><small>${esc(typeLabel(payment.billType))}${payment.confirmation ? ` · Confirmation ${esc(payment.confirmation)}` : ""}${payment.note ? ` · ${esc(payment.note)}` : ""}</small></span>
              <span class="history-amount"><strong>${formatMoney(payment.amount)}</strong><small>${dateLabel(payment.paidAt)}</small></span>
            </article>`).join("")}</div>` : `
            <div class="empty-state"><div class="empty-state-icon">↶</div><h3>No payments recorded yet</h3><p>Mark a bill as paid and its actual payment will appear here.</p></div>`}
        </section>
      </div>`;
  }

  function renderReports() {
    const months = Array.from({ length: 6 }, (_, index) => addMonths(state.selectedMonth, index - 5));
    const monthlyData = months.map(key => {
      const bills = ensureMonth(key).bills;
      const summary = summaryForBills(bills);
      return { key, ...summary };
    });
    const maxMonthly = Math.max(1, ...monthlyData.map(item => item.total));
    const categoryTotals = {};
    currentBills().forEach(bill => {
      categoryTotals[bill.category] = (categoryTotals[bill.category] || 0) + billAmount(bill);
    });
    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const maxCategory = Math.max(1, ...sortedCategories.map(([, value]) => value));
    const subscriptions = currentBills().filter(bill => bill.type === "subscription");
    const monthlySubscription = subscriptions.reduce((sum, bill) => sum + billAmount(bill), 0);
    const creditCards = currentBills().filter(bill => bill.type === "creditCard");
    const statementBalances = creditCards.reduce((sum, bill) => sum + bill.statementBalance, 0);
    return `
      <div class="report-grid">
        <section class="section-panel report-card">
          <h3>Six-Month Planned Spending</h3>
          <p class="muted">The total amount scheduled in each month.</p>
          <div class="report-bars">
            ${monthlyData.map(item => `<div class="report-row"><span>${monthLabel(item.key, "short")}</span><div class="bar-track"><div class="bar-fill" style="width:${(item.total / maxMonthly) * 100}%"></div></div><strong>${formatMoney(item.total)}</strong></div>`).join("")}
          </div>
        </section>
        <section class="section-panel report-card">
          <h3>Spending by Category</h3>
          <p class="muted">Based on planned payments for ${monthLabel(state.selectedMonth)}.</p>
          <div class="report-bars">
            ${sortedCategories.length ? sortedCategories.map(([category, total]) => `<div class="report-row"><span>${esc(category)}</span><div class="bar-track"><div class="bar-fill" style="width:${(total / maxCategory) * 100}%"></div></div><strong>${formatMoney(total)}</strong></div>`).join("") : `<p class="muted">Add bills to see category totals.</p>`}
          </div>
        </section>
        <section class="section-panel report-card">
          <h3>Subscriptions</h3>
          <p class="muted">A clear view of recurring services.</p>
          <div class="metric-pair">
            <div class="metric-box"><small>Monthly</small><strong>${formatMoney(monthlySubscription)}</strong></div>
            <div class="metric-box"><small>Annualized</small><strong>${formatMoney(monthlySubscription * 12)}</strong></div>
          </div>
        </section>
        <section class="section-panel report-card">
          <h3>Credit Cards</h3>
          <p class="muted">Statement balances compared with planned payments.</p>
          <div class="metric-pair">
            <div class="metric-box"><small>Statements</small><strong>${formatMoney(statementBalances)}</strong></div>
            <div class="metric-box"><small>Planned</small><strong>${formatMoney(creditCards.reduce((sum, bill) => sum + billAmount(bill), 0))}</strong></div>
          </div>
        </section>
      </div>`;
  }

  function renderSettings() {
    const notificationAvailable = "Notification" in window;
    return `
      <div class="settings-grid">
        <section class="section-panel settings-card">
          <h3>Backup and Restore</h3>
          <p>Download a complete RavenBill backup before changing devices or clearing browser data.</p>
          <div class="settings-actions">
            <button class="primary-button" data-action="backup">⇩ Download Backup</button>
            <button class="secondary-button" data-action="restore">↥ Restore Backup</button>
            <button class="secondary-button" data-action="export-csv">Export CSV</button>
          </div>
        </section>
        <section class="section-panel settings-card">
          <h3>Month Maintenance</h3>
          <p>Repair the selected month if a recurring bill is missing. Existing custom entries are never deleted.</p>
          <div class="settings-actions">
            <button class="secondary-button" data-action="repair-month">↻ Repair ${esc(monthLabel(state.selectedMonth))}</button>
            <button class="secondary-button" data-action="export-calendar">Export Calendar</button>
          </div>
        </section>
        <section class="section-panel settings-card">
          <h3>Reminders</h3>
          <div class="setting-row">
            <div class="setting-copy"><strong>Browser notifications</strong><small>${notificationAvailable ? "Show a reminder while RavenBill is allowed to notify you." : "Notifications are not supported by this browser."}</small></div>
            <button class="toggle ${state.settings.notificationsEnabled ? "on" : ""}" data-action="toggle-notifications" ${notificationAvailable ? "" : "disabled"} aria-label="Toggle notifications"></button>
          </div>
          <div class="setting-row">
            <div class="setting-copy"><strong>Last backup</strong><small>${state.settings.lastBackupAt ? dateLabel(state.settings.lastBackupAt) : "No backup recorded"}</small></div>
          </div>
        </section>
        <section class="section-panel settings-card">
          <h3>Testing and Reset</h3>
          <p>Demo data is useful while reviewing the clean rebuild. Reset permanently removes RavenBill data from this browser.</p>
          <div class="settings-actions">
            <button class="secondary-button" data-action="load-demo">Load Demo Data</button>
            <button class="danger-button" data-action="reset-data">Reset All Data</button>
          </div>
        </section>
        <section class="section-panel settings-card">
          <h3>Privacy</h3>
          <p>RavenBill is local-first. It does not connect to a bank and should not store passwords, full card numbers, security codes, Social Security numbers, or banking credentials.</p>
        </section>
        <section class="section-panel settings-card">
          <h3>App Information</h3>
          <div class="detail-list">
            <div class="detail-row"><span>Version</span><strong>2.0 Clean · Data v${APP_VERSION}</strong></div>
            <div class="detail-row"><span>Storage</span><strong>Browser local storage</strong></div>
            <div class="detail-row"><span>Templates</span><strong>${state.templates.length}</strong></div>
            <div class="detail-row"><span>Tracked months</span><strong>${Object.keys(state.months).length}</strong></div>
          </div>
        </section>
      </div>`;
  }

  function openDrawer(billId) {
    const bill = findBill(billId);
    if (!bill) return;
    ui.selectedBillId = bill.id;
    ui.detailTab = "details";
    renderDrawer();
    $("#detailDrawer").classList.add("open");
    $("#detailDrawer").setAttribute("aria-hidden", "false");
    $("#drawerScrim").classList.add("open");
  }

  function closeDrawer() {
    ui.selectedBillId = null;
    $("#detailDrawer")?.classList.remove("open");
    $("#detailDrawer")?.setAttribute("aria-hidden", "true");
    $("#drawerScrim")?.classList.remove("open");
  }

  function renderDrawer() {
    const bill = findBill(ui.selectedBillId);
    if (!bill) return closeDrawer();
    $("#drawerTitle").innerHTML = `
      <div class="drawer-title-row">
        <span class="bill-avatar ${typeClass(bill.type)}">${esc(billIconText(bill))}</span>
        <div><h2>${esc(bill.name)}${bill.type === "creditCard" && bill.last4 ? ` • ${esc(bill.last4)}` : ""}</h2><p>${esc(typeLabel(bill.type))}</p></div>
      </div>`;
    const paymentRecords = state.payments.filter(payment => payment.billId === bill.id || (payment.templateId && payment.templateId === bill.templateId));
    $("#drawerContent").innerHTML = `
      <div class="detail-tabs">
        <button class="${ui.detailTab === "details" ? "active" : ""}" data-action="detail-tab" data-tab="details">Details</button>
        <button class="${ui.detailTab === "history" ? "active" : ""}" data-action="detail-tab" data-tab="history">History</button>
      </div>
      ${ui.detailTab === "details" ? drawerDetailsHTML(bill) : drawerHistoryHTML(paymentRecords)}
    `;
  }

  function drawerDetailsHTML(bill) {
    const rows = [
      ["Due Date", dateLabel(bill.dueDate)],
      [bill.type === "creditCard" ? "Planned Payment" : "Planned Amount", formatMoney(billAmount(bill))],
      ["Status", statusLabel(billStatus(bill))],
      ["Autopay", bill.autopay === "off" ? "Off" : bill.autopay === "minimum" ? "Minimum" : bill.autopay === "statement" ? "Statement" : "On"],
      ["Category", bill.category]
    ];
    if (bill.type === "creditCard") {
      rows.splice(1, 0,
        ["Statement Balance", formatMoney(bill.statementBalance)],
        ["Minimum Payment", formatMoney(bill.minimumPayment)]
      );
      rows.push(["Actual Paid", bill.actualPaid == null ? "—" : formatMoney(bill.actualPaid)]);
      rows.push(["Last 4 Digits", bill.last4 || "—"]);
      rows.push(["Credit Limit", bill.creditLimit ? formatMoney(bill.creditLimit) : "—"]);
    }
    if (bill.type === "subscription") {
      rows.push(["Payment Method", bill.paymentMethod || "—"]);
      rows.push(["Renewal Date", bill.renewalDate ? dateLabel(bill.renewalDate) : "—"]);
      rows.push(["Subscription Status", bill.subscriptionStatus || "Active"]);
    }
    if (bill.type === "loan") {
      rows.push(["Lender", bill.lender || "—"]);
      rows.push(["Remaining Balance", bill.remainingBalance ? formatMoney(bill.remainingBalance) : "—"]);
    }
    rows.push(["Notes", bill.notes || "—"]);

    return `
      <div class="detail-list">
        ${rows.map(([label, value]) => `<div class="detail-row"><span>${esc(label)}</span><strong class="${label === "Planned Payment" ? "purple" : ""}">${esc(value)}</strong></div>`).join("")}
      </div>
      ${bill.type === "creditCard" ? `
        <section class="drawer-section">
          <h3>Quick Payment Options</h3>
          <div class="quick-pay-grid">
            <button class="quick-pay-button" data-action="quick-pay" data-mode="minimum" data-bill-id="${bill.id}">Pay Minimum<span>${formatMoney(bill.minimumPayment)}</span></button>
            <button class="quick-pay-button" data-action="quick-pay" data-mode="statement" data-bill-id="${bill.id}">Pay Statement<span>${formatMoney(bill.statementBalance)}</span></button>
            <button class="quick-pay-button" data-action="quick-pay" data-mode="last" data-bill-id="${bill.id}">Last Month<span>${formatMoney(lastCardPayment(bill))}</span></button>
          </div>
          <button class="quick-pay-custom" data-action="quick-pay" data-mode="custom" data-bill-id="${bill.id}">Custom Planned Amount</button>
        </section>` : ""}
      <div class="drawer-actions">
        <button class="secondary-button" data-action="toggle-paid" data-bill-id="${bill.id}">${bill.paid ? "Mark Unpaid" : "✓ Mark as Paid"}</button>
        <button class="primary-button" data-action="edit-bill" data-bill-id="${bill.id}">✎ Edit Bill</button>
      </div>
      <button class="danger-button full-width" data-action="delete-bill" data-bill-id="${bill.id}">Delete Bill</button>`;
  }

  function drawerHistoryHTML(records) {
    if (!records.length) return `<div class="empty-state"><div class="empty-state-icon">↶</div><h3>No payment history</h3><p>Recorded payments for this recurring bill will appear here.</p></div>`;
    return `<div class="history-list">${records.sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))).map(payment => `
      <article class="history-item">
        <span class="history-icon">✓</span>
        <span class="history-copy"><strong>${dateLabel(payment.paidAt)}</strong><small>${payment.confirmation ? `Confirmation ${esc(payment.confirmation)}` : "Payment recorded"}</small></span>
        <span class="history-amount"><strong>${formatMoney(payment.amount)}</strong></span>
      </article>`).join("")}</div>`;
  }

  function lastCardPayment(bill) {
    const previous = previousBillForTemplate(bill.templateId, state.selectedMonth);
    return previous ? num(previous.actualPaid ?? previous.plannedPayment ?? previous.amount) : num(bill.plannedPayment);
  }

  function defaultDraft(type = "standard") {
    const dueDate = dateForMonth(state.selectedMonth, new Date().getDate());
    return {
      type,
      name: "",
      category: defaultCategoryForType(type),
      dueDate,
      dueDay: Number(dueDate.slice(8, 10)),
      frequency: type === "oneTime" ? "oneTime" : "monthly",
      amount: 0,
      amountBehavior: type === "subscription" || type === "loan" ? "fixed" : type === "oneTime" ? "fixed" : "previous",
      autopay: type === "subscription" ? "full" : "off",
      reminderDays: 3,
      notes: "",
      statementBalance: 0,
      minimumPayment: 0,
      plannedPayment: 0,
      last4: "",
      creditLimit: 0,
      paymentBehavior: "manual",
      paymentMethod: "",
      renewalDate: "",
      subscriptionStatus: "active",
      lender: "",
      remainingBalance: 0,
      applyFuture: true
    };
  }

  function draftFromBill(bill) {
    return {
      ...defaultDraft(bill.type),
      ...bill,
      dueDay: Number(String(bill.dueDate).slice(8, 10)),
      amount: billAmount(bill),
      plannedPayment: num(bill.plannedPayment ?? bill.amount),
      applyFuture: Boolean(bill.templateId)
    };
  }

  function openAddBill(type = "standard") {
    ui.editingBillId = null;
    ui.billStep = 1;
    ui.billDraft = defaultDraft(type);
    renderBillDialog();
    $("#billDialog").showModal();
  }

  function openBillEditor(id) {
    const bill = findBill(id);
    if (!bill) return;
    closeDrawer();
    ui.editingBillId = id;
    ui.billStep = 2;
    ui.billDraft = draftFromBill(bill);
    renderBillDialog();
    $("#billDialog").showModal();
  }

  function renderBillDialog() {
    const editing = Boolean(ui.editingBillId);
    $("#billDialogTitle").textContent = editing ? "Edit Bill" : "Add Bill";
    $("#billDialogSubtitle").textContent = editing ? "Update this month or the recurring bill" : `Step ${ui.billStep} of 3`;
    $$(".form-step", $("#billDialog")).forEach(step => step.classList.toggle("active", Number(step.dataset.step) === ui.billStep));
    $$(".step-dot", $("#billDialog")).forEach(dot => {
      const stepNumber = Number(dot.dataset.stepDot);
      dot.classList.toggle("active", stepNumber === ui.billStep);
      dot.classList.toggle("done", stepNumber < ui.billStep);
    });
    $$(".type-card", $("#billDialog")).forEach(card => card.classList.toggle("selected", card.dataset.billType === ui.billDraft.type));
    if (ui.billStep === 2) renderDynamicBillFields();
    if (ui.billStep === 3) renderBillReview();
    const back = $("#billBackButton");
    const next = $("#billNextButton");
    back.textContent = ui.billStep === 1 || editing && ui.billStep === 2 ? "Cancel" : "Back";
    next.textContent = ui.billStep === 3 ? (editing ? "Save Changes" : "Save Bill") : "Next";
  }

  function categoryOptions(selected) {
    return CATEGORIES.map(category => `<option value="${esc(category)}" ${selected === category ? "selected" : ""}>${esc(category)}</option>`).join("");
  }

  function commonFieldsHTML(draft, includeAmount = true) {
    return `
      <label class="field"><span>Bill Name *</span><input id="draftName" value="${esc(draft.name)}" maxlength="80" autocomplete="off"></label>
      <label class="field"><span>Category *</span><select id="draftCategory">${categoryOptions(draft.category)}</select></label>
      <label class="field"><span>Due Date *</span><input id="draftDueDate" type="date" value="${esc(draft.dueDate)}"></label>
      ${includeAmount ? `<label class="field"><span>Amount *</span><input id="draftAmount" inputmode="decimal" value="${draft.amount ? esc(draft.amount.toFixed(2)) : ""}" placeholder="0.00"></label>` : ""}
    `;
  }

  function renderDynamicBillFields() {
    const draft = ui.billDraft;
    let html = `<div class="form-grid">`;
    if (draft.type === "creditCard") {
      html += `
        <label class="field"><span>Card Nickname *</span><input id="draftName" value="${esc(draft.name)}" placeholder="Capital One" maxlength="80"></label>
        <label class="field"><span>Last 4 Digits</span><input id="draftLast4" inputmode="numeric" maxlength="4" value="${esc(draft.last4)}" placeholder="4821"></label>
        <label class="field"><span>Due Date *</span><input id="draftDueDate" type="date" value="${esc(draft.dueDate)}"></label>
        <label class="field"><span>Category</span><select id="draftCategory">${categoryOptions(draft.category)}</select></label>
        <label class="field"><span>Statement Balance</span><input id="draftStatementBalance" inputmode="decimal" value="${draft.statementBalance ? esc(draft.statementBalance.toFixed(2)) : ""}" placeholder="0.00"></label>
        <label class="field"><span>Minimum Payment</span><input id="draftMinimumPayment" inputmode="decimal" value="${draft.minimumPayment ? esc(draft.minimumPayment.toFixed(2)) : ""}" placeholder="0.00"></label>
        <label class="field full"><span>Planned Payment This Month *</span><input id="draftPlannedPayment" inputmode="decimal" value="${draft.plannedPayment ? esc(draft.plannedPayment.toFixed(2)) : ""}" placeholder="0.00"><small class="form-help">This is the amount included in your monthly total.</small></label>
        <label class="field"><span>Future Month Payment Rule</span><select id="draftPaymentBehavior"><option value="manual" ${draft.paymentBehavior === "manual" ? "selected" : ""}>Enter manually each month</option><option value="previous" ${draft.paymentBehavior === "previous" ? "selected" : ""}>Use previous planned payment</option></select></label>
        <label class="field"><span>Autopay Setting</span><select id="draftAutopay"><option value="off" ${draft.autopay === "off" ? "selected" : ""}>Off</option><option value="minimum" ${draft.autopay === "minimum" ? "selected" : ""}>Minimum Payment</option><option value="statement" ${draft.autopay === "statement" ? "selected" : ""}>Statement Balance</option><option value="custom" ${draft.autopay === "custom" ? "selected" : ""}>Custom Amount</option></select></label>
        <label class="field"><span>Credit Limit <em>optional</em></span><input id="draftCreditLimit" inputmode="decimal" value="${draft.creditLimit ? esc(draft.creditLimit.toFixed(2)) : ""}" placeholder="0.00"></label>
        <label class="field"><span>Reminder</span><select id="draftReminderDays">${reminderOptions(draft.reminderDays)}</select></label>
        <label class="field full"><span>Notes <em>optional</em></span><textarea id="draftNotes" rows="3">${esc(draft.notes)}</textarea></label>`;
    } else if (draft.type === "subscription") {
      html += `
        <label class="field full"><span>Service Name *</span><input id="draftName" value="${esc(draft.name)}" placeholder="Netflix" maxlength="80"></label>
        <label class="field"><span>Charge Amount *</span><input id="draftAmount" inputmode="decimal" value="${draft.amount ? esc(draft.amount.toFixed(2)) : ""}" placeholder="0.00"></label>
        <label class="field"><span>Billing Frequency</span><select id="draftFrequency"><option value="monthly" ${draft.frequency === "monthly" ? "selected" : ""}>Monthly</option><option value="yearly" ${draft.frequency === "yearly" ? "selected" : ""}>Yearly</option></select></label>
        <label class="field"><span>Next Charge Date *</span><input id="draftDueDate" type="date" value="${esc(draft.dueDate)}"></label>
        <label class="field"><span>Category</span><select id="draftCategory">${categoryOptions(draft.category)}</select></label>
        <label class="field"><span>Payment Method Nickname</span><input id="draftPaymentMethod" value="${esc(draft.paymentMethod)}" placeholder="Visa • 4821"></label>
        <label class="field"><span>Renewal Date <em>optional</em></span><input id="draftRenewalDate" type="date" value="${esc(draft.renewalDate)}"></label>
        <label class="field"><span>Status</span><select id="draftSubscriptionStatus"><option value="active" ${draft.subscriptionStatus === "active" ? "selected" : ""}>Active</option><option value="paused" ${draft.subscriptionStatus === "paused" ? "selected" : ""}>Paused</option><option value="canceled" ${draft.subscriptionStatus === "canceled" ? "selected" : ""}>Canceled</option></select></label>
        <label class="field"><span>Autopay</span><select id="draftAutopay"><option value="full" ${draft.autopay !== "off" ? "selected" : ""}>On</option><option value="off" ${draft.autopay === "off" ? "selected" : ""}>Off</option></select></label>
        <label class="field"><span>Reminder</span><select id="draftReminderDays">${reminderOptions(draft.reminderDays)}</select></label>
        <label class="field full"><span>Notes <em>optional</em></span><textarea id="draftNotes" rows="3">${esc(draft.notes)}</textarea></label>`;
    } else if (draft.type === "loan") {
      html += `
        ${commonFieldsHTML(draft, true)}
        <label class="field"><span>Lender <em>optional</em></span><input id="draftLender" value="${esc(draft.lender)}"></label>
        <label class="field"><span>Remaining Balance <em>optional</em></span><input id="draftRemainingBalance" inputmode="decimal" value="${draft.remainingBalance ? esc(draft.remainingBalance.toFixed(2)) : ""}" placeholder="0.00"></label>
        <label class="field"><span>Autopay</span><select id="draftAutopay"><option value="off" ${draft.autopay === "off" ? "selected" : ""}>Off</option><option value="full" ${draft.autopay !== "off" ? "selected" : ""}>On</option></select></label>
        <label class="field"><span>Reminder</span><select id="draftReminderDays">${reminderOptions(draft.reminderDays)}</select></label>
        <label class="field full"><span>Notes <em>optional</em></span><textarea id="draftNotes" rows="3">${esc(draft.notes)}</textarea></label>`;
    } else if (draft.type === "oneTime") {
      html += `
        ${commonFieldsHTML(draft, true)}
        <label class="field"><span>Autopay</span><select id="draftAutopay"><option value="off" ${draft.autopay === "off" ? "selected" : ""}>Off</option><option value="full" ${draft.autopay !== "off" ? "selected" : ""}>On</option></select></label>
        <label class="field"><span>Reminder</span><select id="draftReminderDays">${reminderOptions(draft.reminderDays)}</select></label>
        <label class="field full"><span>Notes <em>optional</em></span><textarea id="draftNotes" rows="3">${esc(draft.notes)}</textarea></label>`;
    } else {
      html += `
        ${commonFieldsHTML(draft, true)}
        <label class="field"><span>Frequency</span><select id="draftFrequency"><option value="monthly" ${draft.frequency === "monthly" ? "selected" : ""}>Monthly</option><option value="yearly" ${draft.frequency === "yearly" ? "selected" : ""}>Yearly</option></select></label>
        <label class="field"><span>Autopay</span><select id="draftAutopay"><option value="off" ${draft.autopay === "off" ? "selected" : ""}>Off</option><option value="full" ${draft.autopay !== "off" ? "selected" : ""}>On</option></select></label>
        <div class="field full"><span>Amount Behavior *</span>
          <div class="radio-group">
            <label class="radio-line"><input type="radio" name="draftAmountBehavior" value="fixed" ${draft.amountBehavior === "fixed" ? "checked" : ""}> Fixed amount each month</label>
            <label class="radio-line"><input type="radio" name="draftAmountBehavior" value="previous" ${draft.amountBehavior === "previous" ? "checked" : ""}> Use previous month’s amount</label>
            <label class="radio-line"><input type="radio" name="draftAmountBehavior" value="manual" ${draft.amountBehavior === "manual" ? "checked" : ""}> Enter manually each month</label>
          </div>
        </div>
        <label class="field"><span>Reminder</span><select id="draftReminderDays">${reminderOptions(draft.reminderDays)}</select></label>
        <label class="field full"><span>Notes <em>optional</em></span><textarea id="draftNotes" rows="3">${esc(draft.notes)}</textarea></label>`;
    }
    if (ui.editingBillId && ui.billDraft.applyFuture !== undefined) {
      html += `<label class="checkbox-line field full"><input id="draftApplyFuture" type="checkbox" ${ui.billDraft.applyFuture ? "checked" : ""}> Update the recurring bill for future months</label>`;
    }
    html += `</div>`;
    $("#dynamicBillFields").innerHTML = html;
  }

  function reminderOptions(selected) {
    return [
      [0, "On due date"],
      [1, "1 day before"],
      [3, "3 days before"],
      [7, "7 days before"]
    ].map(([value, label]) => `<option value="${value}" ${Number(selected) === value ? "selected" : ""}>${label}</option>`).join("");
  }

  function readDraftField(id, fallback = "") {
    return $(`#${id}`)?.value ?? fallback;
  }

  function collectBillDraft() {
    const draft = { ...ui.billDraft };
    draft.name = readDraftField("draftName", draft.name).trim();
    draft.category = readDraftField("draftCategory", draft.category);
    draft.dueDate = readDraftField("draftDueDate", draft.dueDate);
    draft.dueDay = Number(draft.dueDate?.slice(8, 10) || draft.dueDay || 1);
    draft.amount = Math.max(0, num(readDraftField("draftAmount", draft.amount)));
    draft.frequency = readDraftField("draftFrequency", draft.frequency);
    draft.autopay = readDraftField("draftAutopay", draft.autopay);
    draft.reminderDays = num(readDraftField("draftReminderDays", draft.reminderDays), 3);
    draft.notes = readDraftField("draftNotes", draft.notes);
    draft.amountBehavior = $('input[name="draftAmountBehavior"]:checked')?.value || draft.amountBehavior;
    draft.statementBalance = Math.max(0, num(readDraftField("draftStatementBalance", draft.statementBalance)));
    draft.minimumPayment = Math.max(0, num(readDraftField("draftMinimumPayment", draft.minimumPayment)));
    draft.plannedPayment = Math.max(0, num(readDraftField("draftPlannedPayment", draft.plannedPayment)));
    draft.last4 = readDraftField("draftLast4", draft.last4).replace(/\D/g, "").slice(-4);
    draft.creditLimit = Math.max(0, num(readDraftField("draftCreditLimit", draft.creditLimit)));
    draft.paymentBehavior = readDraftField("draftPaymentBehavior", draft.paymentBehavior);
    draft.paymentMethod = readDraftField("draftPaymentMethod", draft.paymentMethod).trim();
    draft.renewalDate = readDraftField("draftRenewalDate", draft.renewalDate);
    draft.subscriptionStatus = readDraftField("draftSubscriptionStatus", draft.subscriptionStatus);
    draft.lender = readDraftField("draftLender", draft.lender).trim();
    draft.remainingBalance = Math.max(0, num(readDraftField("draftRemainingBalance", draft.remainingBalance)));
    draft.applyFuture = $("#draftApplyFuture") ? $("#draftApplyFuture").checked : draft.applyFuture;
    if (draft.type === "creditCard") draft.amount = draft.plannedPayment;
    if (draft.type === "subscription") draft.amountBehavior = "fixed";
    if (draft.type === "loan") draft.amountBehavior = "fixed";
    if (draft.type === "oneTime") draft.frequency = "oneTime";
    ui.billDraft = draft;
    return draft;
  }

  function validateDraft(draft) {
    if (!draft.name) return "Enter a bill name.";
    if (!draft.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) return "Choose a valid due date.";
    if (draft.type === "creditCard" && draft.plannedPayment < 0) return "Enter a valid planned payment.";
    if (draft.type !== "creditCard" && draft.amount < 0) return "Enter a valid amount.";
    if (draft.last4 && draft.last4.length !== 4) return "Use exactly four digits for the card number.";
    return null;
  }

  function renderBillReview() {
    const draft = ui.billDraft;
    const rows = [
      ["Due Date", dateLabel(draft.dueDate)],
      [draft.type === "creditCard" ? "Planned Payment" : "Amount", formatMoney(draft.type === "creditCard" ? draft.plannedPayment : draft.amount)],
      ["Autopay", draft.autopay === "off" ? "Off" : draft.autopay === "minimum" ? "Minimum" : draft.autopay === "statement" ? "Statement" : "On"],
      ["Category", draft.category]
    ];
    if (draft.type === "standard") rows.splice(2, 0, ["Amount Behavior", draft.amountBehavior === "fixed" ? "Fixed amount" : draft.amountBehavior === "previous" ? "Use previous month" : "Enter manually"]);
    if (draft.type === "creditCard") {
      rows.splice(1, 0, ["Statement Balance", formatMoney(draft.statementBalance)], ["Minimum Payment", formatMoney(draft.minimumPayment)]);
    }
    if (draft.type === "subscription") rows.push(["Billing Frequency", draft.frequency === "yearly" ? "Yearly" : "Monthly"]);
    $("#billReview").innerHTML = `
      <div class="review-hero">
        <span class="bill-avatar ${typeClass(draft.type)}">${esc(typeIcon(draft.type))}</span>
        <span><strong>${esc(draft.name)}${draft.type === "creditCard" && draft.last4 ? ` • ${esc(draft.last4)}` : ""}</strong><small>${esc(typeLabel(draft.type))}</small></span>
      </div>
      <div class="review-list">${rows.map(([label, value]) => `<div class="detail-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div>`;
  }

  function templateFromDraft(draft, existingId = null) {
    const startMonth = draft.dueDate.slice(0, 7);
    return normalizeTemplate({
      id: existingId || uuid(),
      name: draft.name,
      type: draft.type,
      category: draft.category,
      frequency: draft.frequency,
      startMonth,
      annualMonth: Number(startMonth.slice(5, 7)),
      dueDay: draft.dueDay,
      amount: draft.type === "creditCard" ? draft.plannedPayment : draft.amount,
      amountBehavior: draft.amountBehavior,
      autopay: draft.autopay,
      reminderDays: draft.reminderDays,
      notes: draft.notes,
      paymentMethod: draft.paymentMethod,
      renewalDate: draft.renewalDate,
      subscriptionStatus: draft.subscriptionStatus,
      last4: draft.last4,
      creditLimit: draft.creditLimit,
      paymentBehavior: draft.paymentBehavior,
      defaultPlannedPayment: draft.plannedPayment,
      lender: draft.lender,
      remainingBalance: draft.remainingBalance,
      active: draft.subscriptionStatus !== "canceled"
    });
  }

  function applyDraftToBill(bill, draft) {
    bill.name = draft.name;
    bill.type = draft.type;
    bill.category = draft.category;
    bill.dueDate = draft.dueDate;
    bill.amount = draft.type === "creditCard" ? draft.plannedPayment : draft.amount;
    bill.amountBehavior = draft.amountBehavior;
    bill.autopay = draft.autopay;
    bill.reminderDays = draft.reminderDays;
    bill.notes = draft.notes;
    bill.statementBalance = draft.statementBalance;
    bill.minimumPayment = draft.minimumPayment;
    bill.plannedPayment = draft.plannedPayment;
    bill.last4 = draft.last4;
    bill.creditLimit = draft.creditLimit;
    bill.paymentBehavior = draft.paymentBehavior;
    bill.paymentMethod = draft.paymentMethod;
    bill.renewalDate = draft.renewalDate;
    bill.subscriptionStatus = draft.subscriptionStatus;
    bill.lender = draft.lender;
    bill.remainingBalance = draft.remainingBalance;
    bill.updatedAt = new Date().toISOString();
    return normalizeBill(bill, state.selectedMonth);
  }

  function saveBillDraft() {
    const draft = ui.billDraft;
    if (ui.editingBillId) {
      const month = ensureMonth(state.selectedMonth);
      const index = month.bills.findIndex(bill => bill.id === ui.editingBillId);
      if (index < 0) return;
      const existing = month.bills[index];
      month.bills[index] = applyDraftToBill(existing, draft);
      if (draft.applyFuture && existing.templateId) {
        const templateIndex = state.templates.findIndex(template => template.id === existing.templateId);
        if (templateIndex >= 0) {
          const updated = templateFromDraft(draft, existing.templateId);
          updated.startMonth = state.templates[templateIndex].startMonth;
          updated.createdAt = state.templates[templateIndex].createdAt;
          state.templates[templateIndex] = updated;
        }
      }
      toast(`${draft.name} updated.`, "success");
    } else {
      const template = templateFromDraft(draft);
      state.templates.push(template);
      const monthKeyValue = draft.dueDate.slice(0, 7);
      ensureMonth(monthKeyValue);
      const created = state.months[monthKeyValue].bills.find(bill => bill.templateId === template.id);
      if (created) {
        const updated = applyDraftToBill(created, draft);
        const index = state.months[monthKeyValue].bills.findIndex(bill => bill.id === created.id);
        state.months[monthKeyValue].bills[index] = updated;
      }
      if (monthKeyValue !== state.selectedMonth) {
        toast(`${draft.name} was added to ${monthLabel(monthKeyValue)}.`, "success");
      } else {
        toast(`${draft.name} added.`, "success");
      }
    }
    saveState();
    $("#billDialog").close();
    ui.billDraft = null;
    ui.editingBillId = null;
    render();
  }

  function openPaymentDialog(billId) {
    const bill = findBill(billId);
    if (!bill) return;
    ui.paymentBillId = bill.id;
    $("#paymentBillName").textContent = `${bill.name} · ${dateLabel(bill.dueDate)}`;
    $("#paymentAmount").value = bill.actualPaid != null ? num(bill.actualPaid).toFixed(2) : billAmount(bill).toFixed(2);
    $("#paymentDate").value = bill.paidAt || todayISO();
    $("#paymentConfirmation").value = bill.confirmation || "";
    $("#paymentNote").value = bill.paymentNote || "";
    $("#paymentDialog").showModal();
  }

  function markUnpaid(bill) {
    bill.paid = false;
    bill.paidAt = null;
    bill.actualPaid = null;
    bill.confirmation = "";
    bill.paymentNote = "";
    const paymentIndex = state.payments.findLastIndex
      ? state.payments.findLastIndex(payment => payment.billId === bill.id)
      : [...state.payments].map(payment => payment.billId).lastIndexOf(bill.id);
    if (paymentIndex >= 0) state.payments.splice(paymentIndex, 1);
    saveState();
    toast(`${bill.name} marked unpaid.`);
    render();
    if (ui.selectedBillId === bill.id) openDrawer(bill.id);
  }

  function recordPayment(event) {
    event.preventDefault();
    const bill = findBill(ui.paymentBillId);
    if (!bill) return $("#paymentDialog").close();
    const amount = Math.max(0, num($("#paymentAmount").value));
    const paidAt = $("#paymentDate").value || todayISO();
    bill.paid = true;
    bill.paidAt = paidAt;
    bill.actualPaid = amount;
    bill.confirmation = $("#paymentConfirmation").value.trim();
    bill.paymentNote = $("#paymentNote").value.trim();
    bill.updatedAt = new Date().toISOString();

    const existingIndex = state.payments.findIndex(payment => payment.billId === bill.id);
    const payment = {
      id: existingIndex >= 0 ? state.payments[existingIndex].id : uuid(),
      billId: bill.id,
      templateId: bill.templateId,
      billName: bill.name,
      billType: bill.type,
      monthKey: state.selectedMonth,
      amount,
      paidAt,
      confirmation: bill.confirmation,
      note: bill.paymentNote,
      createdAt: new Date().toISOString()
    };
    if (existingIndex >= 0) state.payments[existingIndex] = payment;
    else state.payments.push(payment);
    saveState();
    $("#paymentDialog").close();
    toast(`${bill.name} marked paid.`, "success");
    render();
    if (ui.selectedBillId === bill.id) openDrawer(bill.id);
  }

  function quickPay(billId, mode) {
    const bill = findBill(billId);
    if (!bill || bill.type !== "creditCard") return;
    let amount;
    if (mode === "minimum") amount = bill.minimumPayment;
    else if (mode === "statement") amount = bill.statementBalance;
    else if (mode === "last") amount = lastCardPayment(bill);
    else {
      const answer = prompt("Enter the planned payment amount:", bill.plannedPayment.toFixed(2));
      if (answer == null) return;
      amount = num(answer, bill.plannedPayment);
    }
    bill.plannedPayment = Math.max(0, amount);
    bill.amount = bill.plannedPayment;
    bill.updatedAt = new Date().toISOString();
    saveState();
    toast(`Planned payment updated to ${formatMoney(amount)}.`, "success");
    render();
    openDrawer(bill.id);
  }

  function deleteBill(id) {
    const bill = findBill(id);
    if (!bill) return;
    const recurringMessage = bill.templateId ? " This will also stop future copies of this recurring bill." : "";
    if (!confirm(`Delete ${bill.name}?${recurringMessage}`)) return;
    const month = ensureMonth(state.selectedMonth);
    month.bills = month.bills.filter(item => item.id !== id);
    if (bill.templateId) state.templates = state.templates.filter(template => template.id !== bill.templateId);
    saveState();
    closeDrawer();
    toast(`${bill.name} deleted.`);
    render();
  }

  function backupData() {
    state.settings.lastBackupAt = new Date().toISOString();
    saveState();
    downloadFile(
      `ravenbill-backup-${todayISO()}.json`,
      JSON.stringify({ app: "RavenBill 2.0", exportedAt: new Date().toISOString(), data: state }, null, 2),
      "application/json"
    );
    updateBackupCard();
    toast("Backup downloaded.", "success");
  }

  function exportCSV() {
    const rows = [["Month", "Bill", "Type", "Category", "Due Date", "Planned Amount", "Paid", "Actual Paid", "Paid Date", "Autopay"]];
    Object.keys(state.months).sort().forEach(key => {
      state.months[key].bills.forEach(bill => rows.push([
        key,
        bill.name,
        typeLabel(bill.type),
        bill.category,
        bill.dueDate,
        billAmount(bill).toFixed(2),
        bill.paid ? "Yes" : "No",
        bill.actualPaid == null ? "" : num(bill.actualPaid).toFixed(2),
        bill.paidAt || "",
        bill.autopay
      ]));
    });
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadFile(`ravenbill-bills-${todayISO()}.csv`, csv, "text/csv;charset=utf-8");
    toast("CSV exported.", "success");
  }

  function exportCalendar() {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RavenBill//Bill Tracker//EN", "CALSCALE:GREGORIAN"];
    currentBills().forEach(bill => {
      const date = bill.dueDate.replaceAll("-", "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${bill.id}@ravenbill`,
        `DTSTART;VALUE=DATE:${date}`,
        `DTEND;VALUE=DATE:${nextDateCompact(bill.dueDate)}`,
        `SUMMARY:${icsEscape(`${bill.name} — ${formatMoney(billAmount(bill))}`)}`,
        `DESCRIPTION:${icsEscape(`${typeLabel(bill.type)} | ${bill.category} | ${bill.paid ? "Paid" : "Unpaid"}`)}`,
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");
    downloadFile(`ravenbill-${state.selectedMonth}.ics`, lines.join("\r\n"), "text/calendar;charset=utf-8");
    toast("Calendar exported.", "success");
  }

  function nextDateCompact(dateString) {
    const date = localDate(dateString);
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  }

  function icsEscape(value) {
    return String(value).replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n");
  }

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function restoreBackup(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const incoming = parsed?.data || parsed;
      if (!incoming || typeof incoming !== "object") throw new Error("Invalid backup");
      if (!confirm("Restore this RavenBill backup? Current browser data will be replaced.")) return;
      state = normalizeState(incoming);
      ensureMonth(state.selectedMonth);
      saveState();
      ui = { ...ui, page: "dashboard", billTab: "all", search: "", filters: { status: "all", autopay: "all", category: "all" } };
      render();
      toast("Backup restored.", "success");
    } catch (error) {
      console.error(error);
      toast("That file is not a valid RavenBill backup.", "error");
    } finally {
      $("#restoreFile").value = "";
    }
  }

  function loadDemoData() {
    if (state.templates.length && !confirm("Replace current RavenBill data with demo data?")) return;
    const selected = state.selectedMonth;
    const demo = defaultState();
    demo.selectedMonth = selected;
    const templates = [
      { name: "Housing (Rent)", type: "standard", category: "Housing", dueDay: 1, amount: 1250, amountBehavior: "fixed", autopay: "full" },
      { name: "Capital One", type: "creditCard", category: "Debt", dueDay: 12, last4: "4821", creditLimit: 5000, defaultPlannedPayment: 300, paymentBehavior: "manual", autopay: "minimum" },
      { name: "Netflix", type: "subscription", category: "Subscriptions", dueDay: 15, amount: 22.99, paymentMethod: "Visa • 4821", autopay: "full" },
      { name: "Electric Company", type: "standard", category: "Utilities", dueDay: 18, amount: 146.20, amountBehavior: "previous", autopay: "off" },
      { name: "Xfinity Internet", type: "standard", category: "Utilities", dueDay: 20, amount: 79.99, amountBehavior: "fixed", autopay: "full" },
      { name: "Spotify Premium", type: "subscription", category: "Subscriptions", dueDay: 21, amount: 10.99, paymentMethod: "Mastercard • 1044", autopay: "full" },
      { name: "Car Insurance", type: "standard", category: "Insurance", dueDay: 25, amount: 120, amountBehavior: "fixed", autopay: "off" }
    ].map(item => normalizeTemplate({ id: uuid(), startMonth: selected, frequency: "monthly", reminderDays: 3, ...item }));
    demo.templates = templates;
    state = demo;
    const month = ensureMonth(selected);
    const card = month.bills.find(bill => bill.type === "creditCard");
    if (card) {
      card.statementBalance = 1250;
      card.minimumPayment = 45;
      card.plannedPayment = 300;
      card.amount = 300;
    }
    const rent = month.bills.find(bill => bill.name.startsWith("Housing"));
    if (rent) {
      rent.paid = true;
      rent.actualPaid = 1250;
      rent.paidAt = todayISO();
      state.payments.push({
        id: uuid(), billId: rent.id, templateId: rent.templateId, billName: rent.name, billType: rent.type,
        monthKey: selected, amount: 1250, paidAt: todayISO(), confirmation: "", note: "Demo payment", createdAt: new Date().toISOString()
      });
    }
    saveState();
    render();
    toast("Demo data loaded.", "success");
  }

  function resetData() {
    if (!confirm("Permanently remove all RavenBill data from this browser? This cannot be undone without a backup.")) return;
    localStorage.removeItem(STORAGE_KEY);
    state = defaultState();
    ensureMonth(state.selectedMonth);
    saveState();
    ui.page = "dashboard";
    ui.billTab = "all";
    ui.search = "";
    ui.filters = { status: "all", autopay: "all", category: "all" };
    render();
    toast("RavenBill data reset.");
  }

  function updateBackupCard() {
    if (!state) return;
    const status = $("#backupStatusText");
    const detail = $("#lastBackupText");
    if (!status || !detail) return;
    if (state.settings.lastBackupAt) {
      status.textContent = "Backup recorded";
      detail.textContent = `Last backup: ${dateLabel(state.settings.lastBackupAt)}`;
    } else {
      status.textContent = "Not backed up";
      detail.textContent = "Create your first backup";
    }
  }

  async function toggleNotifications() {
    if (!("Notification" in window)) return toast("Notifications are not available in this browser.", "error");
    if (!state.settings.notificationsEnabled) {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast("Notification permission was not granted.", "error");
        return;
      }
      state.settings.notificationsEnabled = true;
      toast("Bill reminders enabled.", "success");
    } else {
      state.settings.notificationsEnabled = false;
      toast("Bill reminders disabled.");
    }
    saveState();
    render();
  }

  function runDueNotifications() {
    if (!state.settings.notificationsEnabled || !("Notification" in window) || Notification.permission !== "granted") return;
    if (state.settings.lastNotificationDate === todayISO()) return;
    const due = currentBills().filter(bill => !bill.paid && daysFromToday(bill.dueDate) >= 0 && daysFromToday(bill.dueDate) <= bill.reminderDays);
    if (due.length) {
      const total = due.reduce((sum, bill) => sum + billAmount(bill), 0);
      new Notification("RavenBill reminder", {
        body: `${due.length} bill${due.length === 1 ? "" : "s"} due soon · ${formatMoney(total)}`,
        icon: "/rb-icon.svg"
      });
    }
    state.settings.lastNotificationDate = todayISO();
    saveState();
  }

  function toast(message, type = "") {
    const region = $("#toastRegion");
    if (!region) return;
    const node = document.createElement("div");
    node.className = `toast ${type}`.trim();
    node.textContent = message;
    region.append(node);
    setTimeout(() => node.remove(), 3400);
  }

  function clearFilters() {
    ui.search = "";
    ui.filters = { status: "all", autopay: "all", category: "all" };
    $("#globalSearch").value = "";
    render();
  }

  function openFilterDialog() {
    $("#filterStatus").value = ui.filters.status;
    $("#filterAutopay").value = ui.filters.autopay;
    $("#filterCategory").innerHTML = `<option value="all">All categories</option>${categoryOptions(ui.filters.category)}`;
    $("#filterCategory").value = ui.filters.category;
    $("#filterDialog").showModal();
  }

  function applyFilters(event) {
    event.preventDefault();
    ui.filters.status = $("#filterStatus").value;
    ui.filters.autopay = $("#filterAutopay").value;
    ui.filters.category = $("#filterCategory").value;
    $("#filterDialog").close();
    if (ui.page !== "bills") ui.page = "bills";
    render();
  }

  function handleQuickFilter(filter) {
    ui.page = "bills";
    ui.billTab = "all";
    ui.filters = { status: "all", autopay: "all", category: "all" };
    if (filter === "paid" || filter === "unpaid") ui.filters.status = filter;
    if (filter === "autopay") ui.filters.autopay = "on";
    if (filter === "recurring") {
      ui.search = "";
      ui.billTab = "all";
    }
    render();
  }

  function handleClick(event) {
    const target = event.target.closest("[data-action], [data-page], [data-bill-type]");
    if (!target) return;

    if (target.dataset.page) {
      event.preventDefault();
      setPage(target.dataset.page);
      return;
    }

    if (target.dataset.billType) {
      ui.billDraft = defaultDraft(target.dataset.billType);
      $$(".type-card", $("#billDialog")).forEach(card => card.classList.toggle("selected", card === target));
      return;
    }

    const action = target.dataset.action;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();

    switch (action) {
      case "previous-month": changeMonth(-1); break;
      case "next-month": changeMonth(1); break;
      case "choose-month":
        if ($("#monthPicker").showPicker) $("#monthPicker").showPicker();
        else $("#monthPicker").click();
        break;
      case "add-bill": openAddBill(); break;
      case "toggle-filters": openFilterDialog(); break;
      case "clear-filters": clearFilters(); $("#filterDialog")?.close(); break;
      case "close-filter-dialog": $("#filterDialog").close(); break;
      case "bill-tab": ui.billTab = target.dataset.tab; render(); break;
      case "open-bill": openDrawer(target.dataset.billId); break;
      case "close-drawer": closeDrawer(); break;
      case "detail-tab": ui.detailTab = target.dataset.tab; renderDrawer(); break;
      case "edit-bill": openBillEditor(target.dataset.billId); break;
      case "toggle-paid": {
        const bill = findBill(target.dataset.billId);
        if (!bill) break;
        if (bill.paid) markUnpaid(bill);
        else openPaymentDialog(bill.id);
        break;
      }
      case "delete-bill": deleteBill(target.dataset.billId); break;
      case "quick-pay": quickPay(target.dataset.billId, target.dataset.mode); break;
      case "close-bill-dialog": $("#billDialog").close(); break;
      case "close-payment-dialog": $("#paymentDialog").close(); break;
      case "bill-back":
        if (ui.billStep === 1 || (ui.editingBillId && ui.billStep === 2)) {
          $("#billDialog").close();
        } else {
          if (ui.billStep === 2) ui.billStep = 1;
          else ui.billStep -= 1;
          renderBillDialog();
        }
        break;
      case "bill-next":
        if (ui.billStep === 1) {
          ui.billStep = 2;
          renderBillDialog();
        } else if (ui.billStep === 2) {
          const draft = collectBillDraft();
          const error = validateDraft(draft);
          if (error) return toast(error, "error");
          ui.billStep = 3;
          renderBillDialog();
        } else {
          saveBillDraft();
        }
        break;
      case "status-filter":
        ui.page = "bills";
        ui.filters.status = target.dataset.status;
        render();
        break;
      case "quick-filter": handleQuickFilter(target.dataset.filter); break;
      case "repair-month": ensureMonth(state.selectedMonth, true); render(); break;
      case "backup": backupData(); break;
      case "restore": $("#restoreFile").click(); break;
      case "export-csv": exportCSV(); break;
      case "export-calendar": exportCalendar(); break;
      case "load-demo": loadDemoData(); break;
      case "reset-data": resetData(); break;
      case "toggle-notifications": toggleNotifications(); break;
      default: break;
    }
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    $("#monthPicker").addEventListener("change", event => setMonth(event.target.value));
    $("#globalSearch").addEventListener("input", event => {
      ui.search = event.target.value.trim();
      if (ui.search && ui.page !== "bills") ui.page = "bills";
      render();
      requestAnimationFrame(() => {
        const input = $("#globalSearch");
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    });
    $("#paymentForm").addEventListener("submit", recordPayment);
    $("#filterForm").addEventListener("submit", applyFilters);
    $("#restoreFile").addEventListener("change", event => {
      const [file] = event.target.files;
      if (file) restoreBackup(file);
    });
    window.addEventListener("keydown", event => {
      if (event.key === "Escape") closeDrawer();
    });
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("/sw.js").catch(error => console.warn("Service worker registration failed:", error));
    }
  }

  function init() {
    const requestedPage = location.hash.replace("#", "");
    if (PAGE_META[requestedPage]) ui.page = requestedPage;
    loadState();
    bindEvents();
    render();
    registerServiceWorker();
    setTimeout(runDueNotifications, 900);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
