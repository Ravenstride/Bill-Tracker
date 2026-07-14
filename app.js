(() => {
  "use strict";

  const STORAGE_KEY = "ravenbill.v7";
  const LEGACY_KEYS = ["ravenbill.v6", "ravenbill.v5", "ravenbill.v4", "ravenbill.v3", "ravenbill.v2", "ravenbill.v1"];
  const ALERT_LOG_KEY = "ravenbill.alertLog.v1";
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const categories = ["Housing","Utilities","Transportation","Debt","Insurance","Healthcare","Subscriptions","Family","Pets","Savings","Taxes","Other"];
  const categoryIcons = { Housing:"⌂", Utilities:"⚡", Transportation:"🚗", Debt:"▣", Insurance:"◆", Healthcare:"✚", Subscriptions:"▶", Family:"●", Pets:"🐾", Savings:"$", Taxes:"%", Other:"•" };
  const presets = [
    ["Mortgage","Housing"],["Rent","Housing"],["HOA","Housing"],["Property Taxes","Taxes"],["Home Insurance","Insurance"],
    ["Electric","Utilities"],["Water","Utilities"],["Sewer","Utilities"],["Natural Gas","Utilities"],["Trash","Utilities"],
    ["Internet","Utilities"],["Cell Phone","Utilities"],["Cable / TV","Subscriptions"],["Car Payment","Transportation"],
    ["Auto Insurance","Insurance"],["Fuel","Transportation"],["Credit Card","Debt"],["Personal Loan","Debt"],
    ["Student Loan","Debt"],["Health Insurance","Insurance"],["Dental Insurance","Insurance"],["Vision Insurance","Insurance"],
    ["Medical Bill","Healthcare"],["Netflix","Subscriptions"],["Hulu","Subscriptions"],["Disney+","Subscriptions"],
    ["Max","Subscriptions"],["Spotify","Subscriptions"],["YouTube Premium","Subscriptions"],["Amazon Prime","Subscriptions"],
    ["Life Insurance","Insurance"],["Pet Insurance","Pets"],["Veterinary","Pets"],["Childcare","Family"],
    ["Tuition","Family"],["Vehicle Registration","Transportation"],["Annual Membership","Subscriptions"],["Tax Preparation","Taxes"]
  ];

  const $ = (id) => document.getElementById(id);
  let currentPage = "dashboard";
  let selectedMonth = new Date();
  selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
  let selectedAgendaDate = null;
  let editingBillId = null;
  let editingBillMode = "month";
  let editingAppointmentId = null;
  let state = loadState();

  normalizeState();
  seedTemplateIfNeeded();
  ensureMonth(selectedMonth);
  syncAllExistingAutopayMonths();
  saveState();

  function uuid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function defaultSettings() {
    return { billReminderDays: 3, appointmentReminderMinutes: 60, reminderTime: "09:00", overdueReminders: true };
  }

  function defaultTemplate() {
    return [
      templateBill("Mortgage / Rent","Housing",1,0,"monthly",null),
      templateBill("Electric","Utilities",10,0,"monthly",null),
      templateBill("Water","Utilities",15,0,"monthly",null),
      templateBill("Internet","Utilities",18,0,"monthly",null),
      templateBill("Cell Phone","Utilities",20,0,"monthly",null),
      templateBill("Car Payment","Transportation",22,0,"monthly",null),
      templateBill("Auto Insurance","Insurance",24,0,"monthly",null),
      templateBill("Credit Card","Debt",28,0,"monthly",null),
      templateBill("Home Insurance","Insurance",15,0,"yearly",7),
      templateBill("Vehicle Registration","Transportation",15,0,"yearly",0)
    ];
  }

  function templateBill(name, category, dueDay, amount, frequency, yearlyMonth) {
    return { id:uuid(), name, category, dueDay, amount, frequency, yearlyMonth, autopay:false, reminderDays:3 };
  }

  function loadState() {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) {
      try { return JSON.parse(current); } catch {}
    }
    for (const key of LEGACY_KEYS) {
      const stored = localStorage.getItem(key);
      if (!stored) continue;
      try { return migrateState(JSON.parse(stored)); } catch {}
    }
    return { template:[], months:{}, appointments:[], settings:defaultSettings() };
  }

  function migrateState(old) {
    const migrated = {
      template: Array.isArray(old.template) ? old.template : [],
      months: old.months && typeof old.months === "object" ? old.months : {},
      appointments: Array.isArray(old.appointments) ? old.appointments : [],
      settings: { ...defaultSettings(), ...(old.settings || {}) }
    };
    return migrated;
  }

  function normalizeState() {
    state.template = Array.isArray(state.template) ? state.template : [];
    state.months = state.months && typeof state.months === "object" ? state.months : {};
    state.appointments = Array.isArray(state.appointments) ? state.appointments : [];
    state.settings = { ...defaultSettings(), ...(state.settings || {}) };

    state.template = state.template.map((item) => normalizeBill(item, true));
    Object.values(state.months).forEach((month) => {
      month.bills = Array.isArray(month.bills) ? month.bills.map((bill) => normalizeBill(bill, false)) : [];
    });
    state.appointments = state.appointments.map((item) => ({
      id:item.id || uuid(), title:item.title || "Appointment", date:item.date || todayKey(), time:item.time || "",
      location:item.location || "", notes:item.notes || "",
      reminderMinutes:Number.isFinite(Number(item.reminderMinutes)) ? Number(item.reminderMinutes) : Number(state.settings.appointmentReminderMinutes)
    }));
  }

  function normalizeBill(item, template) {
    return {
      id:item.id || uuid(), name:item.name || "Bill", category:item.category || "Other",
      dueDay:Number(item.dueDay || 1), amount:Number(item.amount || 0), frequency:item.frequency || "monthly",
      yearlyMonth:item.yearlyMonth ?? null, autopay:Boolean(item.autopay),
      reminderDays:Number.isFinite(Number(item.reminderDays)) ? Number(item.reminderDays) : Number(state.settings?.billReminderDays ?? 3),
      ...(template ? {} : { paid:Boolean(item.paid), paidAt:item.paidAt || null, sourceTemplateId:item.sourceTemplateId || null })
    };
  }

  function seedTemplateIfNeeded() {
    if (!state.template.length) state.template = defaultTemplate();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function monthKey(date = selectedMonth) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
  }

  function parseMonthKey(key) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month-1, 1);
  }

  function addMonths(date, amount) {
    return new Date(date.getFullYear(), date.getMonth()+amount, 1);
  }

  function todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  }

  function ensureMonth(date) {
    const key = monthKey(date);
    if (!state.months[key]) {
      const monthIndex = date.getMonth();
      const bills = state.template
        .filter((item) => item.frequency === "monthly" || (item.frequency === "yearly" && Number(item.yearlyMonth) === monthIndex))
        .map((item) => ({ ...item, id:uuid(), paid:false, paidAt:null, sourceTemplateId:item.id }));
      state.months[key] = { createdAt:new Date().toISOString(), bills };
    }
    syncAutopayIntoMonth(date);
    return state.months[key];
  }

  function currentMonthData() { return ensureMonth(selectedMonth); }

  function previousApplicableDate(bill, targetDate) {
    if (bill.frequency === "yearly") return new Date(targetDate.getFullYear()-1, targetDate.getMonth(), 1);
    return addMonths(targetDate, -1);
  }

  function nextApplicableDate(bill, sourceDate) {
    if (bill.frequency === "yearly") return new Date(sourceDate.getFullYear()+1, sourceDate.getMonth(), 1);
    return addMonths(sourceDate, 1);
  }

  function billMatch(candidate, source) {
    if (source.sourceTemplateId && candidate.sourceTemplateId === source.sourceTemplateId) return true;
    if (source.sourceTemplateId && candidate.id === source.sourceTemplateId) return true;
    return candidate.name.trim().toLowerCase() === source.name.trim().toLowerCase() && candidate.category === source.category && candidate.frequency === source.frequency;
  }

  function syncAutopayIntoMonth(targetDate) {
    const targetKey = monthKey(targetDate);
    const target = state.months[targetKey];
    if (!target) return;

    target.bills.forEach((targetBill) => {
      if (!targetBill.autopay) return;
      const previousDate = previousApplicableDate(targetBill, targetDate);
      const previousMonth = state.months[monthKey(previousDate)];
      if (!previousMonth) return;
      const previousBill = previousMonth.bills.find((bill) => bill.autopay && billMatch(bill, targetBill));
      if (previousBill) targetBill.amount = Number(previousBill.amount || 0);
    });
  }

  function syncAllExistingAutopayMonths() {
    Object.keys(state.months).sort().forEach((key) => syncAutopayIntoMonth(parseMonthKey(key)));
  }

  function propagateAutopay(sourceBill, sourceDate) {
    if (!sourceBill.autopay || sourceBill.frequency === "one-time") return;

    const template = state.template.find((item) => billMatch(item, sourceBill));
    if (template) {
      template.amount = Number(sourceBill.amount || 0);
      template.autopay = true;
      template.reminderDays = sourceBill.reminderDays;
    }

    const nextDate = nextApplicableDate(sourceBill, sourceDate);
    const nextMonth = ensureMonth(nextDate);
    let nextBill = nextMonth.bills.find((item) => billMatch(item, sourceBill));
    if (!nextBill) {
      nextBill = { ...sourceBill, id:uuid(), paid:false, paidAt:null };
      nextMonth.bills.push(nextBill);
    }
    nextBill.amount = Number(sourceBill.amount || 0);
    nextBill.autopay = true;
    nextBill.paid = false;
    nextBill.paidAt = null;
    nextBill.reminderDays = sourceBill.reminderDays;
  }

  function monthAppointments(date = selectedMonth) {
    const prefix = monthKey(date);
    return state.appointments.filter((item) => item.date.startsWith(prefix)).sort(sortAppointments);
  }

  function sortAppointments(a,b) {
    return `${a.date}T${a.time || "23:59"}`.localeCompare(`${b.date}T${b.time || "23:59"}`);
  }

  function dueDateForBill(bill, date = selectedMonth) {
    const last = new Date(date.getFullYear(), date.getMonth()+1, 0).getDate();
    const [hours, minutes] = String(state.settings.reminderTime || "09:00").split(":").map(Number);
    return new Date(date.getFullYear(), date.getMonth(), Math.min(Number(bill.dueDay), last), hours || 9, minutes || 0, 0);
  }

  function statusForBill(bill) {
    if (bill.paid) return { text:bill.paidAt ? `PAID ${new Date(bill.paidAt).toLocaleDateString("en-US",{month:"short",day:"numeric"})}` : "PAID", cls:"paid" };
    if (monthKey(selectedMonth) !== monthKey(new Date())) return { text:"UNPAID", cls:"upcoming" };
    const today = new Date(); today.setHours(0,0,0,0);
    const due = dueDateForBill(bill); due.setHours(0,0,0,0);
    const distance = Math.ceil((due-today)/86400000);
    if (distance < 0) return { text:`OVERDUE ${Math.abs(distance)} DAY${Math.abs(distance)===1?"":"S"}`, cls:"overdue" };
    if (distance === 0) return { text:"DUE TODAY", cls:"due-soon" };
    if (distance <= 7) return { text:`DUE IN ${distance} DAY${distance===1?"":"S"}`, cls:"due-soon" };
    return { text:"UPCOMING", cls:"upcoming" };
  }

  function ordinal(number) {
    const n = Number(number), endings = ["th","st","nd","rd"], value = n % 100;
    return n + (endings[(value-20)%10] || endings[value] || endings[0]);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
  }

  function frequencyText(item) {
    if (item.frequency === "yearly") return `Yearly · ${monthNames[Number(item.yearlyMonth)]}`;
    if (item.frequency === "one-time") return "One-time";
    return "Monthly";
  }

  function billReminderText(days) {
    const value = Number(days);
    if (value < 0) return "No reminder";
    if (value === 0) return "Due-date reminder";
    return `${value} day${value===1?"":"s"} before`;
  }

  function appointmentReminderText(minutes) {
    const value = Number(minutes);
    if (value < 0) return "No reminder";
    if (value < 60) return `${value} minutes before`;
    if (value === 60) return "1 hour before";
    if (value % 1440 === 0) return `${value/1440} day${value===1440?"":"s"} before`;
    return `${Math.round(value/60)} hours before`;
  }

  function formatAppointmentTime(item) {
    if (!item.time) return "Any time";
    const [hours,minutes] = item.time.split(":").map(Number);
    return new Date(2000,0,1,hours,minutes).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  }

  function render() {
    ensureMonth(selectedMonth);
    renderHeader(); renderDashboard(); renderBills(); renderSchedule(); renderReminders(); renderTemplate(); renderHistory(); updateFloatingButton(); updateNotificationStatus();
  }

  function renderHeader() {
    $("monthLabel").textContent = selectedMonth.toLocaleDateString("en-US",{month:"long",year:"numeric"});
    const config = {
      dashboard:["PERSONAL BILL ORGANIZER","Dashboard","Stay ahead of bills and appointments."],
      bills:["MONTHLY BILL SHEET","Bills","Track what is paid, due soon, and overdue."],
      schedule:["PERSONAL SCHEDULE","Schedule","Keep appointments and plans beside your bills."],
      reminders:["PHONE REMINDERS","Reminders","Set alerts for bills and appointments."],
      template:["AUTOMATIC MONTH SETUP","Bill Template","Choose what appears automatically in each month."],
      history:["PAST MONTHS","History","Review previous monthly bill sheets."]
    }[currentPage];
    $("pageEyebrow").textContent = config[0]; $("pageTitle").textContent = config[1]; $("pageSubtitle").textContent = config[2];
  }

  function renderDashboard() {
    const bills = currentMonthData().bills;
    const appointments = monthAppointments();
    const paid = bills.filter((bill) => bill.paid);
    const total = bills.reduce((sum,bill) => sum + Number(bill.amount || 0),0);
    const paidAmount = paid.reduce((sum,bill) => sum + Number(bill.amount || 0),0);
    const dueSoon = bills.filter((bill) => statusForBill(bill).cls === "due-soon").length;
    const overdue = bills.filter((bill) => statusForBill(bill).cls === "overdue").length;
    const percent = bills.length ? Math.round(paid.length / bills.length * 100) : 0;
    $("progressRing").style.setProperty("--progress",percent); $("progressPercent").textContent = `${percent}%`;
    $("summaryBillCount").textContent = bills.length; $("summaryRemaining").textContent = money.format(total-paidAmount); $("summaryAppointments").textContent = appointments.length;
    $("totalAmount").textContent = money.format(total); $("paidAmount").textContent = money.format(paidAmount); $("dueSoonCount").textContent = dueSoon; $("overdueCount").textContent = overdue;
    $("totalBillsCaption").textContent = `${bills.length} bill${bills.length===1?"":"s"}`; $("paidBillsCaption").textContent = `${paid.length} completed`;

    const attention = [...bills].filter((bill) => !bill.paid).sort((a,b) => {
      const order = { overdue:0, "due-soon":1, upcoming:2 };
      return order[statusForBill(a).cls] - order[statusForBill(b).cls] || a.dueDay-b.dueDay;
    }).slice(0,5);
    $("dashboardBillList").innerHTML = attention.length ? attention.map(renderCompactBill).join("") : `<div class="empty-state">${bills.length?"Every bill is paid for this month.":"No bills this month."}</div>`;

    const today = todayKey();
    const upcoming = appointments.filter((item) => item.date >= today || monthKey(selectedMonth) !== monthKey(new Date())).slice(0,5);
    $("dashboardAppointmentList").innerHTML = upcoming.length ? upcoming.map(renderCompactAppointment).join("") : `<div class="empty-state">No upcoming appointments this month.</div>`;
  }

  function renderCompactBill(bill) {
    const status = statusForBill(bill);
    return `<div class="list-card"><div class="list-icon">${categoryIcons[bill.category]||"•"}</div><div><h4>${escapeHtml(bill.name)}</h4><p>${escapeHtml(bill.category)} · Due ${ordinal(bill.dueDay)}${bill.autopay?" · Autopay":""}</p><span class="status ${status.cls}">${status.text}</span></div><div class="list-side"><strong>${money.format(Number(bill.amount||0))}</strong></div></div>`;
  }

  function renderCompactAppointment(item) {
    const date = new Date(`${item.date}T12:00:00`);
    return `<div class="list-card"><div class="list-icon">${date.getDate()}</div><div><h4>${escapeHtml(item.title)}</h4><p>${date.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})} · ${formatAppointmentTime(item)}</p>${item.location?`<span class="status upcoming">${escapeHtml(item.location)}</span>`:""}</div><div class="list-side"><button class="text-button" data-appointment-action="edit" data-id="${item.id}">Edit</button></div></div>`;
  }

  function renderBills() {
    const filter = $("billFilter").value;
    let bills = [...currentMonthData().bills].filter((bill) => {
      const status = statusForBill(bill);
      if (filter === "paid") return bill.paid;
      if (filter === "unpaid") return !bill.paid;
      if (filter === "dueSoon") return status.cls === "due-soon";
      if (filter === "overdue") return status.cls === "overdue";
      if (filter === "monthly") return bill.frequency === "monthly";
      if (filter === "yearly") return bill.frequency === "yearly";
      if (filter === "autopay") return bill.autopay;
      return true;
    }).sort((a,b) => a.dueDay-b.dueDay || a.name.localeCompare(b.name));
    $("billsHeading").textContent = `${selectedMonth.toLocaleDateString("en-US",{month:"long",year:"numeric"})} bills`;
    $("billList").innerHTML = bills.length ? bills.map(renderBillCard).join("") : `<div class="empty-state">No bills match this view.</div>`;
  }

  function renderBillCard(bill) {
    const status = statusForBill(bill);
    const reminder = Number(bill.reminderDays) >= 0 ? `<span class="reminder-pill">◉ ${billReminderText(bill.reminderDays)}</span>` : "";
    return `<article class="bill-card"><button class="bill-check ${bill.paid?"checked":""}" data-bill-action="toggle" data-id="${bill.id}" aria-label="${bill.paid?"Mark unpaid":"Mark paid"}">${bill.paid?"✓":""}</button><div><h4>${escapeHtml(bill.name)} <span class="frequency-pill">${escapeHtml(frequencyText(bill))}</span>${reminder}</h4><div class="meta">${escapeHtml(bill.category)} · Due ${ordinal(bill.dueDay)}${bill.autopay?" · Autopay":""}</div><span class="status ${status.cls}">${status.text}</span><div class="amount">${money.format(Number(bill.amount||0))}</div><div class="card-actions"><button data-bill-action="edit" data-id="${bill.id}">Edit</button><button class="delete" data-bill-action="delete" data-id="${bill.id}">Delete</button></div></div></article>`;
  }

  function renderSchedule() {
    const appointments = monthAppointments(); renderCalendar(appointments);
    const filtered = selectedAgendaDate ? appointments.filter((item) => item.date === selectedAgendaDate) : appointments;
    $("agendaDateLabel").textContent = selectedAgendaDate ? new Date(`${selectedAgendaDate}T12:00:00`).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"}) : `${selectedMonth.toLocaleDateString("en-US",{month:"long"})} agenda`;
    $("appointmentList").innerHTML = filtered.length ? filtered.map(renderAppointmentCard).join("") : `<div class="empty-state">${selectedAgendaDate?"No appointments on this date.":"No appointments this month."}</div>`;
  }

  function renderAppointmentCard(item) {
    const date = new Date(`${item.date}T12:00:00`);
    return `<article class="list-card"><div class="list-icon">${date.getDate()}</div><div><h4>${escapeHtml(item.title)}${Number(item.reminderMinutes)>=0?` <span class="reminder-pill">◉ ${appointmentReminderText(item.reminderMinutes)}</span>`:""}</h4><p>${date.toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})} · ${formatAppointmentTime(item)}</p>${item.location?`<span class="status upcoming">${escapeHtml(item.location)}</span>`:""}${item.notes?`<p>${escapeHtml(item.notes)}</p>`:""}</div><div class="list-side"><button class="text-button" data-appointment-action="edit" data-id="${item.id}">Edit</button><button class="text-button red" data-appointment-action="delete" data-id="${item.id}">Delete</button></div></article>`;
  }

  function renderCalendar(appointments) {
    const year = selectedMonth.getFullYear(), month = selectedMonth.getMonth();
    const firstDay = new Date(year,month,1).getDay(), lastDate = new Date(year,month+1,0).getDate(), previousLast = new Date(year,month,0).getDate();
    const eventDays = new Set(appointments.map((item) => Number(item.date.slice(-2))));
    let html = "";
    for (let i=0;i<42;i++) {
      let day, muted=false, dateObject;
      if (i<firstDay) { day=previousLast-firstDay+i+1; dateObject=new Date(year,month-1,day); muted=true; }
      else if (i>=firstDay+lastDate) { day=i-firstDay-lastDate+1; dateObject=new Date(year,month+1,day); muted=true; }
      else { day=i-firstDay+1; dateObject=new Date(year,month,day); }
      const key = `${dateObject.getFullYear()}-${String(dateObject.getMonth()+1).padStart(2,"0")}-${String(dateObject.getDate()).padStart(2,"0")}`;
      html += `<button class="calendar-day ${muted?"muted":""} ${!muted&&eventDays.has(day)?"has-event":""} ${selectedAgendaDate===key?"selected":""} ${todayKey()===key?"today":""}" data-calendar-date="${key}" data-muted="${muted}">${day}</button>`;
    }
    $("calendarGrid").innerHTML = html;
  }

  function renderReminders() {
    $("defaultBillReminder").value = String(state.settings.billReminderDays);
    $("defaultAppointmentReminder").value = String(state.settings.appointmentReminderMinutes);
    $("defaultReminderTime").value = state.settings.reminderTime;
    $("overdueReminderToggle").checked = Boolean(state.settings.overdueReminders);
    const preview = buildReminderPreview().slice(0,7);
    $("reminderPreviewList").innerHTML = preview.length ? preview.map((item) => `<div class="list-card"><div class="list-icon">◉</div><div><h4>${escapeHtml(item.title)}</h4><p>${escapeHtml(item.when)}</p><span class="status upcoming">${escapeHtml(item.kind)}</span></div></div>`).join("") : `<div class="empty-state">No reminders are currently scheduled.</div>`;
  }

  function buildReminderPreview() {
    const result = [];
    for (let offset=0; offset<12; offset++) {
      const date = addMonths(selectedMonth,offset), month = ensureMonth(date);
      month.bills.forEach((bill) => {
        if (bill.paid || Number(bill.reminderDays)<0) return;
        const due = dueDateForBill(bill,date), alertAt = new Date(due.getTime()-Number(bill.reminderDays)*86400000);
        result.push({ title:bill.name, when:`${alertAt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} at ${alertAt.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`, timestamp:alertAt.getTime(), kind:`Bill due ${due.toLocaleDateString("en-US",{month:"short",day:"numeric"})}` });
      });
    }
    state.appointments.forEach((item) => {
      if (Number(item.reminderMinutes)<0) return;
      const eventAt = appointmentDateTime(item), alertAt = new Date(eventAt.getTime()-Number(item.reminderMinutes)*60000);
      result.push({ title:item.title, when:`${alertAt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} at ${alertAt.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}`, timestamp:alertAt.getTime(), kind:"Appointment" });
    });
    return result.filter((item) => item.timestamp >= Date.now()-86400000).sort((a,b) => a.timestamp-b.timestamp);
  }

  function renderTemplate() {
    const sorted = [...state.template].sort((a,b) => a.frequency.localeCompare(b.frequency) || (a.frequency==="yearly"?Number(a.yearlyMonth)-Number(b.yearlyMonth):a.dueDay-b.dueDay));
    $("templateList").innerHTML = sorted.length ? sorted.map((item) => `<article class="template-card"><h4>${categoryIcons[item.category]||"•"} ${escapeHtml(item.name)}</h4><p>${escapeHtml(item.category)} · Due ${ordinal(item.dueDay)}</p><p><strong>${escapeHtml(frequencyText(item))}</strong>${item.autopay?" · Autopay":""}</p><p>${escapeHtml(billReminderText(item.reminderDays))}</p><div class="card-actions"><button data-template-action="edit" data-id="${item.id}">Edit</button><button class="delete" data-template-action="delete" data-id="${item.id}">Delete</button></div></article>`).join("") : `<div class="empty-state">No template bills yet.</div>`;
  }

  function renderHistory() {
    const keys = Object.keys(state.months).sort().reverse();
    $("historyList").innerHTML = keys.length ? keys.map((key) => {
      const bills = state.months[key].bills || [], paid = bills.filter((bill) => bill.paid), total = bills.reduce((sum,bill) => sum+Number(bill.amount||0),0), paidAmount = paid.reduce((sum,bill) => sum+Number(bill.amount||0),0), date = parseMonthKey(key);
      return `<article class="history-card"><h4>${date.toLocaleDateString("en-US",{month:"long",year:"numeric"})}</h4><p>${paid.length} of ${bills.length} bills paid</p><div class="history-row"><span>Total</span><strong>${money.format(total)}</strong></div><div class="history-row"><span>Paid</span><strong>${money.format(paidAmount)}</strong></div><div class="history-row"><span>Remaining</span><strong>${money.format(total-paidAmount)}</strong></div></article>`;
    }).join("") : `<div class="empty-state">No history yet.</div>`;
  }

  function switchPage(page) {
    currentPage = page;
    document.querySelectorAll(".page").forEach((element) => element.classList.remove("active"));
    $(`${page}Page`).classList.add("active");
    document.querySelectorAll("[data-page]").forEach((button) => button.classList.toggle("active",button.dataset.page===page));
    renderHeader(); updateFloatingButton(); window.scrollTo({top:0,behavior:"smooth"});
  }

  function updateFloatingButton() {
    $("floatingAdd").hidden = !["bills","schedule","template"].includes(currentPage);
    $("floatingAdd").setAttribute("aria-label",currentPage==="schedule"?"Add appointment":currentPage==="template"?"Add template bill":"Add bill");
  }

  function openBillDialog(item=null, mode="month") {
    editingBillId = item?.id || null; editingBillMode = mode;
    $("billDialogTitle").textContent = item ? `Edit ${mode==="template"?"template bill":"bill"}` : `Add ${mode==="template"?"template bill":"bill"}`;
    $("billDialogEyebrow").textContent = mode==="template"?"AUTOMATIC MONTH SETUP":"MONTHLY BILL";
    $("billPreset").value=""; $("billName").value=item?.name||""; $("billAmount").value=item?.amount??""; $("billDueDay").value=item?.dueDay??""; $("billCategory").value=item?.category||"Utilities";
    $("billFrequency").value=item?.frequency||(mode==="month"?"one-time":"monthly"); $("billYearlyMonth").value=item?.yearlyMonth??selectedMonth.getMonth(); $("billAutopay").checked=Boolean(item?.autopay);
    $("billReminderDays").value=String(item?.reminderDays ?? state.settings.billReminderDays); toggleYearlyMonth(); $("billDialog").showModal(); setTimeout(() => $("billName").focus(),50);
  }

  function closeBillDialog() { $("billDialog").close(); editingBillId=null; }

  function openAppointmentDialog(item=null) {
    editingAppointmentId=item?.id||null; $("appointmentDialogTitle").textContent=item?"Edit appointment":"Add appointment";
    $("appointmentTitle").value=item?.title||""; $("appointmentDate").value=item?.date||defaultAppointmentDate(); $("appointmentTime").value=item?.time||""; $("appointmentLocation").value=item?.location||""; $("appointmentNotes").value=item?.notes||"";
    $("appointmentReminderMinutes").value=String(item?.reminderMinutes ?? state.settings.appointmentReminderMinutes); $("appointmentDialog").showModal(); setTimeout(() => $("appointmentTitle").focus(),50);
  }

  function closeAppointmentDialog() { $("appointmentDialog").close(); editingAppointmentId=null; }
  function defaultAppointmentDate() { const now=new Date(); return now.getFullYear()===selectedMonth.getFullYear()&&now.getMonth()===selectedMonth.getMonth()?todayKey():`${monthKey(selectedMonth)}-01`; }
  function toggleYearlyMonth() { $("yearlyMonthWrap").hidden = $("billFrequency").value !== "yearly"; }

  function saveBillFromForm(event) {
    event.preventDefault();
    const existing = editingBillMode==="template" ? state.template.find((item) => item.id===editingBillId) : currentMonthData().bills.find((item) => item.id===editingBillId);
    const item = { id:editingBillId||uuid(), name:$("billName").value.trim(), amount:Number($("billAmount").value), dueDay:Number($("billDueDay").value), category:$("billCategory").value, frequency:$("billFrequency").value, yearlyMonth:$("billFrequency").value==="yearly"?Number($("billYearlyMonth").value):null, autopay:$("billAutopay").checked, reminderDays:Number($("billReminderDays").value) };
    if (editingBillMode === "template") {
      state.template = editingBillId ? state.template.map((bill) => bill.id===editingBillId?item:bill) : [...state.template,item];
      Object.keys(state.months).forEach((key) => syncAutopayIntoMonth(parseMonthKey(key)));
    } else {
      item.paid=existing?.paid||false; item.paidAt=existing?.paidAt||null; item.sourceTemplateId=existing?.sourceTemplateId||null;
      const month=currentMonthData(); month.bills=editingBillId?month.bills.map((bill) => bill.id===editingBillId?item:bill):[...month.bills,item];
      propagateAutopay(item,selectedMonth);
    }
    saveState(); closeBillDialog(); render();
  }

  function saveAppointmentFromForm(event) {
    event.preventDefault();
    const item={ id:editingAppointmentId||uuid(), title:$("appointmentTitle").value.trim(), date:$("appointmentDate").value, time:$("appointmentTime").value, location:$("appointmentLocation").value.trim(), notes:$("appointmentNotes").value.trim(), reminderMinutes:Number($("appointmentReminderMinutes").value) };
    state.appointments=editingAppointmentId?state.appointments.map((appointment) => appointment.id===editingAppointmentId?item:appointment):[...state.appointments,item];
    const date=new Date(`${item.date}T12:00:00`); selectedMonth=new Date(date.getFullYear(),date.getMonth(),1); selectedAgendaDate=item.date; saveState(); closeAppointmentDialog(); render();
  }

  function saveReminderSettings() {
    state.settings.billReminderDays=Number($("defaultBillReminder").value); state.settings.appointmentReminderMinutes=Number($("defaultAppointmentReminder").value); state.settings.reminderTime=$("defaultReminderTime").value||"09:00"; state.settings.overdueReminders=$("overdueReminderToggle").checked;
    saveState(); render(); flashButton($("saveReminderSettingsBtn"),"Saved");
  }

  function flashButton(button,text) { const original=button.textContent; button.textContent=text; setTimeout(() => button.textContent=original,1400); }

  function appointmentDateTime(item) {
    const time=item.time||"09:00"; return new Date(`${item.date}T${time}:00`);
  }

  function icsEscape(value) { return String(value||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;"); }
  function icsDateTime(date) { return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}${String(date.getMinutes()).padStart(2,"0")}00`; }
  function icsStamp(date=new Date()) { return date.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,""); }

  function buildCalendarFile(monthCount) {
    const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//RavenBill//Personal Organizer//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:RavenBill Reminders"];
    const start=new Date(selectedMonth.getFullYear(),selectedMonth.getMonth(),1);
    for (let offset=0;offset<monthCount;offset++) {
      const date=addMonths(start,offset), month=ensureMonth(date);
      month.bills.forEach((bill) => {
        if (Number(bill.reminderDays)<0) return;
        const due=dueDateForBill(bill,date), end=new Date(due.getTime()+30*60000), trigger=Number(bill.reminderDays)===0?"-PT0M":`-P${Number(bill.reminderDays)}D`;
        lines.push("BEGIN:VEVENT",`UID:bill-${bill.id}-${monthKey(date)}@ravenbill`,`DTSTAMP:${icsStamp()}`,`DTSTART:${icsDateTime(due)}`,`DTEND:${icsDateTime(end)}`,`SUMMARY:${icsEscape(`Bill due: ${bill.name}`)}`,`DESCRIPTION:${icsEscape(`${bill.category} bill · ${money.format(Number(bill.amount||0))}${bill.autopay?" · Autopay":""}`)}`,"BEGIN:VALARM",`TRIGGER:${trigger}`,"ACTION:DISPLAY",`DESCRIPTION:${icsEscape(`${bill.name} is due ${due.toLocaleDateString("en-US")}`)}`,"END:VALARM","END:VEVENT");
      });
    }
    const endDate=addMonths(start,monthCount);
    state.appointments.filter((item) => { const date=new Date(`${item.date}T12:00:00`); return date>=start&&date<endDate; }).forEach((item) => {
      if (Number(item.reminderMinutes)<0) return;
      const eventAt=appointmentDateTime(item), end=new Date(eventAt.getTime()+60*60000);
      lines.push("BEGIN:VEVENT",`UID:appointment-${item.id}@ravenbill`,`DTSTAMP:${icsStamp()}`,`DTSTART:${icsDateTime(eventAt)}`,`DTEND:${icsDateTime(end)}`,`SUMMARY:${icsEscape(item.title)}`,`LOCATION:${icsEscape(item.location)}`,`DESCRIPTION:${icsEscape(item.notes)}`,"BEGIN:VALARM",`TRIGGER:-PT${Number(item.reminderMinutes)}M`,"ACTION:DISPLAY",`DESCRIPTION:${icsEscape(`Reminder: ${item.title}`)}`,"END:VALARM","END:VEVENT");
    });
    lines.push("END:VCALENDAR"); return lines.join("\r\n");
  }

  function downloadCalendar(monthCount) {
    const blob=new Blob([buildCalendarFile(monthCount)],{type:"text/calendar;charset=utf-8"}), link=document.createElement("a");
    link.href=URL.createObjectURL(blob); link.download=monthCount===1?`ravenbill-${monthKey(selectedMonth)}-reminders.ics`:`ravenbill-next-12-months.ics`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href),1000);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) { alert("This browser does not support on-device notifications. Use the phone calendar reminder button instead."); return; }
    const permission=await Notification.requestPermission(); updateNotificationStatus();
    if (permission==="granted") showNotification("RavenBill alerts enabled","RavenBill can alert you when you open or return to the app.");
  }

  function updateNotificationStatus() {
    const status=$("notificationStatus"); if (!status) return;
    const permission=("Notification" in window)?Notification.permission:"unsupported";
    status.textContent=permission==="granted"?"Enabled":permission==="denied"?"Blocked":permission==="unsupported"?"Unsupported":"Not enabled";
    status.classList.toggle("enabled",permission==="granted");
  }

  async function showNotification(title,body) {
    if (!("Notification" in window) || Notification.permission!=="granted") return;
    try {
      const registration=await navigator.serviceWorker?.ready;
      if (registration) await registration.showNotification(title,{body,icon:"raven-logo.svg",badge:"raven-logo.svg",tag:`ravenbill-${title}-${body}`,renotify:false});
      else new Notification(title,{body,icon:"raven-logo.svg"});
    } catch { try { new Notification(title,{body,icon:"raven-logo.svg"}); } catch {} }
  }

  function loadAlertLog() { try { return JSON.parse(localStorage.getItem(ALERT_LOG_KEY))||{}; } catch { return {}; } }
  function saveAlertLog(log) { const cutoff=Date.now()-45*86400000; Object.keys(log).forEach((key) => { if (log[key]<cutoff) delete log[key]; }); localStorage.setItem(ALERT_LOG_KEY,JSON.stringify(log)); }

  function checkDueNotifications() {
    if (!("Notification" in window) || Notification.permission!=="granted") return;
    const now=new Date(), log=loadAlertLog(), currentDate=new Date(now.getFullYear(),now.getMonth(),1), month=ensureMonth(currentDate);
    month.bills.forEach((bill) => {
      if (bill.paid || Number(bill.reminderDays)<0) return;
      const due=dueDateForBill(bill,currentDate), alertAt=new Date(due.getTime()-Number(bill.reminderDays)*86400000);
      const overdue=now>due;
      const key=overdue?`overdue-${bill.id}-${todayKey()}`:`bill-${bill.id}-${monthKey(currentDate)}-${bill.reminderDays}`;
      if (log[key]) return;
      if (overdue && state.settings.overdueReminders) { showNotification(`Overdue: ${bill.name}`,`${money.format(Number(bill.amount||0))} was due ${due.toLocaleDateString("en-US",{month:"short",day:"numeric"})}.`); log[key]=Date.now(); }
      else if (now>=alertAt && now<=due) { showNotification(`Bill reminder: ${bill.name}`,`${money.format(Number(bill.amount||0))} is due ${due.toLocaleDateString("en-US",{month:"short",day:"numeric"})}${bill.autopay?" on autopay":""}.`); log[key]=Date.now(); }
    });
    state.appointments.forEach((item) => {
      if (Number(item.reminderMinutes)<0) return;
      const eventAt=appointmentDateTime(item), alertAt=new Date(eventAt.getTime()-Number(item.reminderMinutes)*60000), key=`appointment-${item.id}-${item.date}-${item.time}`;
      if (!log[key] && now>=alertAt && now<=eventAt) { showNotification(`Appointment: ${item.title}`,`${formatAppointmentTime(item)}${item.location?` · ${item.location}`:""}`); log[key]=Date.now(); }
    });
    saveAlertLog(log);
  }

  function exportBackup() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}), link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=`ravenbill-backup-${todayKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href),1000);
  }

  categories.forEach((category) => $("billCategory").insertAdjacentHTML("beforeend",`<option>${category}</option>`));
  $("billPreset").innerHTML=`<option value="">Custom bill</option>`;
  presets.forEach(([name,category]) => $("billPreset").insertAdjacentHTML("beforeend",`<option value="${escapeHtml(name)}" data-category="${escapeHtml(category)}">${escapeHtml(name)}</option>`));
  monthNames.forEach((name,index) => $("billYearlyMonth").insertAdjacentHTML("beforeend",`<option value="${index}">${name}</option>`));

  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click",() => switchPage(button.dataset.page)));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click",() => button.dataset.close==="billDialog"?closeBillDialog():closeAppointmentDialog()));
  $("prevMonth").addEventListener("click",() => { selectedMonth=addMonths(selectedMonth,-1); selectedAgendaDate=null; ensureMonth(selectedMonth); render(); });
  $("nextMonth").addEventListener("click",() => { selectedMonth=addMonths(selectedMonth,1); selectedAgendaDate=null; ensureMonth(selectedMonth); render(); });
  $("billFilter").addEventListener("change",renderBills);
  $("billPreset").addEventListener("change",(event) => { const option=event.target.selectedOptions[0]; if (!event.target.value) return; $("billName").value=event.target.value; $("billCategory").value=option.dataset.category||"Other"; });
  $("billFrequency").addEventListener("change",toggleYearlyMonth);
  $("billForm").addEventListener("submit",saveBillFromForm); $("appointmentForm").addEventListener("submit",saveAppointmentFromForm);
  $("addBillButton").addEventListener("click",() => openBillDialog(null,"month")); $("addTemplateButton").addEventListener("click",() => openBillDialog(null,"template")); $("addAppointmentButton").addEventListener("click",() => openAppointmentDialog());
  $("backupBtn").addEventListener("click",exportBackup); $("saveReminderSettingsBtn").addEventListener("click",saveReminderSettings);
  $("calendarExportBtn").addEventListener("click",() => downloadCalendar(12)); $("selectedMonthCalendarBtn").addEventListener("click",() => downloadCalendar(1));
  $("enableNotificationsBtn").addEventListener("click",enableNotifications); $("testNotificationBtn").addEventListener("click",() => showNotification("RavenBill test reminder","Your phone alerts are working while RavenBill is active."));
  $("floatingAdd").addEventListener("click",() => currentPage==="schedule"?openAppointmentDialog():currentPage==="template"?openBillDialog(null,"template"):openBillDialog(null,"month"));

  document.body.addEventListener("click",(event) => {
    const billButton=event.target.closest("[data-bill-action]");
    if (billButton) {
      const month=currentMonthData(), bill=month.bills.find((item) => item.id===billButton.dataset.id); if (!bill) return;
      if (billButton.dataset.billAction==="toggle") { bill.paid=!bill.paid; bill.paidAt=bill.paid?new Date().toISOString():null; if (bill.paid&&bill.autopay) propagateAutopay(bill,selectedMonth); }
      else if (billButton.dataset.billAction==="edit") { openBillDialog(bill,"month"); return; }
      else if (billButton.dataset.billAction==="delete") { if (!confirm(`Delete "${bill.name}" from this month?`)) return; month.bills=month.bills.filter((item) => item.id!==bill.id); }
      saveState(); render(); return;
    }
    const templateButton=event.target.closest("[data-template-action]");
    if (templateButton) {
      const item=state.template.find((bill) => bill.id===templateButton.dataset.id); if (!item) return;
      if (templateButton.dataset.templateAction==="edit") { openBillDialog(item,"template"); return; }
      if (templateButton.dataset.templateAction==="delete") { if (!confirm(`Delete "${item.name}" from the automatic template?`)) return; state.template=state.template.filter((bill) => bill.id!==item.id); saveState(); render(); } return;
    }
    const appointmentButton=event.target.closest("[data-appointment-action]");
    if (appointmentButton) {
      const item=state.appointments.find((appointment) => appointment.id===appointmentButton.dataset.id); if (!item) return;
      if (appointmentButton.dataset.appointmentAction==="edit") { openAppointmentDialog(item); return; }
      if (appointmentButton.dataset.appointmentAction==="delete") { if (!confirm(`Delete "${item.title}"?`)) return; state.appointments=state.appointments.filter((appointment) => appointment.id!==item.id); saveState(); render(); } return;
    }
    const calendarButton=event.target.closest("[data-calendar-date]");
    if (calendarButton&&calendarButton.dataset.muted!=="true") { selectedAgendaDate=selectedAgendaDate===calendarButton.dataset.calendarDate?null:calendarButton.dataset.calendarDate; renderSchedule(); }
  });

  window.addEventListener("keydown",(event) => { if (event.key==="Escape") { if ($("billDialog").open) closeBillDialog(); if ($("appointmentDialog").open) closeAppointmentDialog(); } });
  document.addEventListener("visibilitychange",() => { if (document.visibilityState==="visible") { checkDueNotifications(); render(); } });
  window.addEventListener("focus",checkDueNotifications);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").then(() => checkDueNotifications()).catch(() => {});
  render(); setTimeout(checkDueNotifications,1200);
})();
