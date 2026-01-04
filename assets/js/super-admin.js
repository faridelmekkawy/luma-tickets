const firebaseConfig = {
  apiKey: "AIzaSyA80bAAGPuyscnTVS-zwrxE9Jp3tPiS1gM",
  authDomain: "events-339ce.firebaseapp.com",
  databaseURL: "https://events-339ce-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "events-339ce",
  storageBucket: "events-339ce.firebasestorage.app",
  messagingSenderId: "175601544315",
  appId: "1:175601544315:web:00c94b4affa972b3a286de"
};

let initializeApp;
let getApps;
let getFirestore;
let collection;
let query;
let orderBy;
let limit;
let onSnapshot;

let db;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const fmtNumber = (value) => Number(value || 0).toLocaleString("en-US");
const fmtCurrency = (value) => `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const state = {
  events: new Map(),
  ordersByEvent: new Map(),
  logsByEvent: new Map(),
  unsubOrders: new Map(),
  unsubLogs: new Map(),
  activePage: "overview"
};

async function loadFirebase() {
  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  ({ initializeApp, getApps } = appMod);

  const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  ({ getFirestore, collection, query, orderBy, limit, onSnapshot } = fsMod);

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
}

function resolveEventLabel(event) {
  return event?.name || event?.title || "Untitled event";
}

function resolveOwnerLabel(event) {
  return event?.ownerName || event?.organizer || event?.host || event?.ownerLabel || "Owner team";
}

function parseOrder(order) {
  const amount = Number(order?.amount ?? order?.total ?? order?.price ?? 0) || 0;
  const status = order?.status || "";
  const qtyRaw = Number(order?.qty ?? order?.quantity ?? order?.count ?? 0) || 0;
  const tickets = Array.isArray(order?.tickets) ? order.tickets : [];
  const tiers = Array.isArray(order?.tiers) ? order.tiers : [];
  const qtyFromTickets = tickets.reduce((sum, t) => sum + (Number(t?.quantity ?? t?.qty ?? 0) || 0), 0);
  const qtyFromTiers = tiers.reduce((sum, t) => sum + (Number(t?.qty ?? t?.quantity ?? 0) || 0), 0);
  const qty = qtyRaw || qtyFromTickets || qtyFromTiers || 1;
  const orderId = order?.orderId || order?.id || order?.code || "Order";
  const email = order?.email || order?.buyerEmail || order?.customerEmail || "";
  return { amount, status, qty, orderId, email };
}

function scanLogTime(log) {
  const createdAt = log?.createdAt;
  if(!createdAt) return null;
  if(typeof createdAt.toDate === "function") return createdAt.toDate();
  if(typeof createdAt.seconds === "number") return new Date(createdAt.seconds * 1000);
  const asDate = new Date(createdAt);
  return Number.isNaN(asDate.getTime()) ? null : asDate;
}

function formatRelativeTime(date) {
  if(!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if(minutes < 1) return "Just now";
  if(minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if(hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildPill(status) {
  const span = document.createElement("span");
  span.className = "pill";
  if(status === "Healthy") span.classList.add("green");
  if(status === "Escalated") span.classList.add("red");
  span.textContent = status;
  return span;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if(el) el.textContent = value;
}

function setupNav() {
  $$(".nav button").forEach(button => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      if(!page) return;
      showPage(page);
    });
  });
}

function showPage(page) {
  state.activePage = page;
  $$(".nav button").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });
  $$(".page").forEach(section => {
    section.classList.toggle("hidden", section.dataset.page !== page);
  });
}

function ensureEventListeners(eventId) {
  if(state.unsubOrders.has(eventId)) return;

  const ordersCol = collection(db, "events", eventId, "orders");
  const unsubOrders = onSnapshot(ordersCol, snap => {
    const orders = snap.docs.map(doc => doc.data());
    state.ordersByEvent.set(eventId, orders);
    renderAll();
  });
  state.unsubOrders.set(eventId, unsubOrders);

  const logsCol = collection(db, "events", eventId, "scanLogs");
  const logsQuery = query(logsCol, orderBy("createdAt", "desc"), limit(120));
  const unsubLogs = onSnapshot(logsQuery, snap => {
    const logs = snap.docs.map(doc => doc.data());
    state.logsByEvent.set(eventId, logs);
    renderAll();
  });
  state.unsubLogs.set(eventId, unsubLogs);
}

function removeEventListeners(eventId) {
  state.unsubOrders.get(eventId)?.();
  state.unsubOrders.delete(eventId);
  state.unsubLogs.get(eventId)?.();
  state.unsubLogs.delete(eventId);
  state.ordersByEvent.delete(eventId);
  state.logsByEvent.delete(eventId);
}

function renderRevenueChart(owners) {
  const chart = document.getElementById("revenueChart");
  if(!chart) return;
  chart.innerHTML = "";
  if(owners.length === 0) {
    chart.innerHTML = `<div class="muted">No revenue data yet.</div>`;
    return;
  }
  const maxGross = Math.max(...owners.map(o => o.gross || 0), 1);
  owners.forEach(owner => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(12, (owner.gross / maxGross) * 100)}%`;
    bar.dataset.label = owner.label;
    chart.appendChild(bar);
  });
}

function renderOrgRows(owners) {
  const body = document.getElementById("orgRows");
  if(!body) return;
  body.innerHTML = "";
  if(owners.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No owners found.</td></tr>`;
    return;
  }

  owners.slice(0, 6).forEach(owner => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${owner.label}</td>
      <td></td>
      <td>${owner.flags.join(", ") || "—"}</td>
      <td>${fmtNumber(owner.events)}</td>
      <td>Open · Override · Review</td>
    `;
    row.children[1].appendChild(buildPill(owner.status));
    body.appendChild(row);
  });
}

function renderOwnersTable(owners) {
  const body = document.getElementById("ownersTable");
  if(!body) return;
  body.innerHTML = "";
  if(owners.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No owners found.</td></tr>`;
    return;
  }
  owners.forEach(owner => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${owner.label}</td>
      <td></td>
      <td>${fmtCurrency(owner.gross)}</td>
      <td>${fmtCurrency(owner.refunds)}</td>
      <td>${fmtNumber(owner.events)}</td>
    `;
    row.children[1].appendChild(buildPill(owner.status));
    body.appendChild(row);
  });
}

function renderEventsTable(events) {
  const body = document.getElementById("eventsTable");
  if(!body) return;
  body.innerHTML = "";
  if(events.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No events found.</td></tr>`;
    return;
  }
  events.forEach(event => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${resolveEventLabel(event)}</td>
      <td>${event.status || "—"}</td>
      <td>${resolveOwnerLabel(event)}</td>
      <td>${fmtCurrency(event.gross)}</td>
      <td>${fmtNumber(event.checkins)}</td>
    `;
    body.appendChild(row);
  });
}

function renderTicketsTable(rows) {
  const body = document.getElementById("ticketsTable");
  if(!body) return;
  body.innerHTML = "";
  if(rows.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No orders found.</td></tr>`;
    return;
  }
  rows.forEach(row => {
    const status = row.status || "—";
    const pill = status === "Paid" ? "green" : status === "Refunded" ? "red" : "";
    const rowEl = document.createElement("tr");
    rowEl.innerHTML = `
      <td>${row.eventName}</td>
      <td>${row.orderLabel}</td>
      <td>${fmtNumber(row.qty)}</td>
      <td>${fmtCurrency(row.amount)}</td>
      <td><span class="pill ${pill}">${status}</span></td>
    `;
    body.appendChild(rowEl);
  });
}

function renderPaymentsTable(rows) {
  const body = document.getElementById("paymentsTable");
  if(!body) return;
  body.innerHTML = "";
  if(rows.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No payment data found.</td></tr>`;
    return;
  }
  rows.forEach(row => {
    const rowEl = document.createElement("tr");
    rowEl.innerHTML = `
      <td>${row.eventName}</td>
      <td>${row.ownerLabel}</td>
      <td>${fmtCurrency(row.gross)}</td>
      <td>${fmtCurrency(row.refunds)}</td>
      <td>${fmtCurrency(row.net)}</td>
    `;
    body.appendChild(rowEl);
  });
}

function renderModerationTable(rows) {
  const body = document.getElementById("moderationTable");
  if(!body) return;
  body.innerHTML = "";
  if(rows.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No moderation activity found.</td></tr>`;
    return;
  }
  rows.forEach(row => {
    const rowEl = document.createElement("tr");
    rowEl.innerHTML = `
      <td>${row.eventName}</td>
      <td>${row.outcome}</td>
      <td>${row.reason}</td>
      <td>${row.when}</td>
      <td>${row.ticket}</td>
    `;
    body.appendChild(rowEl);
  });
}

function renderAuditStream(items) {
  const container = document.getElementById("auditStream");
  if(!container) return;
  container.innerHTML = "";
  if(items.length === 0) {
    container.innerHTML = `<div class="muted">No recent audit activity.</div>`;
    return;
  }
  items.forEach(item => {
    const wrapper = document.createElement("div");
    wrapper.className = "audit-item";
    wrapper.innerHTML = `
      <time>${item.when}</time>
      <div>
        <strong>${item.title}</strong>
        <p class="muted">${item.detail}</p>
      </div>
    `;
    container.appendChild(wrapper);
  });
}

function renderSearch(results, queryText) {
  const container = document.getElementById("searchResults");
  const summary = document.getElementById("searchSummary");
  if(!container || !summary) return;
  container.innerHTML = "";
  if(!queryText) {
    summary.textContent = "Enter a query to see results.";
    return;
  }
  summary.textContent = `${results.length} result${results.length === 1 ? "" : "s"} for "${queryText}"`;
  if(results.length === 0) {
    container.innerHTML = `<div class="muted">No matches found.</div>`;
    return;
  }
  results.forEach(result => {
    const item = document.createElement("div");
    item.className = "search-item";
    item.innerHTML = `
      <strong>${result.title}</strong>
      <span>${result.detail}</span>
    `;
    container.appendChild(item);
  });
}

function handleSearch() {
  const input = document.getElementById("globalSearchInput");
  const queryText = input?.value?.trim();
  showPage("search");
  if(!queryText) {
    renderSearch([], "");
    return;
  }
  const needle = queryText.toLowerCase();
  const results = [];

  for(const event of state.events.values()) {
    const eventName = resolveEventLabel(event);
    const ownerName = resolveOwnerLabel(event);
    const haystack = `${eventName} ${event.city || ""} ${event.venue || ""} ${ownerName}`.toLowerCase();
    if(haystack.includes(needle)) {
      results.push({
        title: eventName,
        detail: `Event · Owner: ${ownerName} · Status: ${event.status || "—"}`
      });
    }
  }

  for(const [eventId, orders] of state.ordersByEvent.entries()) {
    const event = state.events.get(eventId);
    const eventName = resolveEventLabel(event);
    orders.forEach(order => {
      const parsed = parseOrder(order);
      const haystack = `${parsed.orderId} ${parsed.email}`.toLowerCase();
      if(haystack.includes(needle)) {
        results.push({
          title: `Order ${parsed.orderId}`,
          detail: `${eventName} · ${parsed.email || "No email"} · ${parsed.status || "—"}`
        });
      }
    });
  }

  for(const [eventId, logs] of state.logsByEvent.entries()) {
    const event = state.events.get(eventId);
    const eventName = resolveEventLabel(event);
    logs.forEach(log => {
      const ticket = log.ticketId || log.orderId || "";
      if(!ticket) return;
      if(ticket.toLowerCase().includes(needle)) {
        results.push({
          title: `Scan ${ticket}`,
          detail: `${eventName} · ${log.outcome || "Scan"}`
        });
      }
    });
  }

  renderSearch(results.slice(0, 30), queryText);
}

function renderAll() {
  const events = Array.from(state.events.values());
  const totals = {
    gross: 0,
    refunds: 0,
    sold: 0,
    checkins: 0
  };
  const ownersMap = new Map();
  const auditItems = [];
  const moderationRows = [];
  const ordersRows = [];

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let checkinsLastHour = 0;
  let totalOrders = 0;

  events.forEach(event => {
    const eventId = event.id;
    const orders = state.ordersByEvent.get(eventId) || [];
    const logs = state.logsByEvent.get(eventId) || [];

    let eventGross = 0;
    let eventRefunds = 0;
    let eventSold = 0;
    let approvedCount = 0;
    let deniedCount = 0;

    orders.forEach(order => {
      const parsed = parseOrder(order);
      if(parsed.status === "Paid" || parsed.status === "Refunded") {
        eventGross += parsed.amount;
      }
      if(parsed.status === "Refunded") {
        eventRefunds += parsed.amount;
      }
      if(parsed.status === "Paid") {
        eventSold += parsed.qty;
      }
      totalOrders += 1;

      if(parsed.status === "Paid") {
        ordersRows.push({
          eventName: resolveEventLabel(event),
          orderLabel: parsed.orderId,
          qty: parsed.qty,
          amount: parsed.amount,
          status: parsed.status
        });
      }
    });

    logs.forEach(log => {
      if(log.outcome === "approved") approvedCount += 1;
      if(log.outcome === "denied") deniedCount += 1;
      const logTime = scanLogTime(log);
      if(log.outcome === "approved" && logTime && logTime.getTime() >= oneHourAgo) {
        checkinsLastHour += 1;
      }
      if(log.outcome === "denied") {
        moderationRows.push({
          eventName: resolveEventLabel(event),
          outcome: "Denied",
          reason: log.reason || "—",
          when: formatRelativeTime(logTime),
          ticket: log.ticketId || log.orderId || "—"
        });
      }
    });

    totals.gross += eventGross;
    totals.refunds += eventRefunds;
    totals.sold += eventSold;
    totals.checkins += approvedCount;

    const ownerId = event.ownerId || event.ownerUid || "Unknown";
    const ownerEntry = ownersMap.get(ownerId) || {
      id: ownerId,
      label: resolveOwnerLabel(event),
      events: 0,
      gross: 0,
      refunds: 0,
      denied: 0,
      flags: new Set()
    };
    ownerEntry.events += 1;
    ownerEntry.gross += eventGross;
    ownerEntry.refunds += eventRefunds;
    ownerEntry.denied += deniedCount;
    if(eventRefunds > 0) ownerEntry.flags.add("Refunds");
    if(deniedCount > 0) ownerEntry.flags.add("Denied scans");
    if(event.status === "Live") ownerEntry.flags.add("Live event");
    ownersMap.set(ownerId, ownerEntry);

    const logItem = logs.find(log => log.outcome === "approved" || log.outcome === "denied");
    if(logItem) {
      const logTime = scanLogTime(logItem);
      auditItems.push({
        when: formatRelativeTime(logTime),
        title: logItem.outcome === "approved" ? "Check-in approved" : "Entry denied",
        detail: `${resolveEventLabel(event)} · ${logItem.ticketId || logItem.orderId || "Scan"}`
      });
    }

    event.gross = eventGross;
    event.refunds = eventRefunds;
    event.checkins = approvedCount;
  });

  const owners = Array.from(ownersMap.values()).map(owner => {
    const refundRatio = owner.gross > 0 ? owner.refunds / owner.gross : 0;
    const status = refundRatio > 0.1 || owner.denied > 15 ? "Escalated" : refundRatio > 0.04 ? "Watch" : "Healthy";
    return {
      ...owner,
      status,
      flags: Array.from(owner.flags)
    };
  }).sort((a, b) => b.gross - a.gross);

  setText("metricGross", fmtCurrency(totals.gross));
  setText("metricEvents", fmtNumber(events.filter(ev => ["Live", "On Sale"].includes(ev.status)).length));
  setText("metricCheckins", fmtNumber(Math.round(checkinsLastHour / 60)));
  setText("metricRefunds", fmtCurrency(totals.refunds));

  setText("badgeOrgs", `Owners: ${fmtNumber(owners.length)}`);
  const avgOrder = totalOrders > 0 ? totals.gross / totalOrders : 0;
  setText("badgeAvgOrder", `Avg order: ${fmtCurrency(avgOrder)}`);
  setText("badgeTicketVolume", `Tickets: ${fmtNumber(totals.sold)}`);

  renderRevenueChart(owners.slice(0, 5));
  renderOrgRows(owners);
  renderOwnersTable(owners);

  const eventsRows = events
    .map(event => ({
      ...event,
      gross: event.gross || 0,
      checkins: event.checkins || 0
    }))
    .sort((a, b) => (b.gross || 0) - (a.gross || 0));
  renderEventsTable(eventsRows);

  const paymentsRows = eventsRows.map(event => ({
    eventName: resolveEventLabel(event),
    ownerLabel: resolveOwnerLabel(event),
    gross: event.gross || 0,
    refunds: event.refunds || 0,
    net: (event.gross || 0) - (event.refunds || 0)
  }));
  renderPaymentsTable(paymentsRows);

  renderTicketsTable(ordersRows.slice(0, 12));
  renderModerationTable(moderationRows.slice(0, 12));

  const sortedAudit = auditItems.filter(item => item.when !== "—").slice(0, 4);
  renderAuditStream(sortedAudit);
}

function initSearch() {
  const button = document.getElementById("globalSearchBtn");
  const input = document.getElementById("globalSearchInput");
  button?.addEventListener("click", handleSearch);
  input?.addEventListener("keydown", (event) => {
    if(event.key === "Enter") {
      event.preventDefault();
      handleSearch();
    }
  });
}

async function initDashboard() {
  await loadFirebase();
  setupNav();
  initSearch();

  const eventsCol = collection(db, "events");
  onSnapshot(eventsCol, snap => {
    const currentIds = new Set();
    snap.forEach(doc => {
      const data = doc.data();
      const event = { id: doc.id, ...data };
      state.events.set(doc.id, event);
      currentIds.add(doc.id);
      ensureEventListeners(doc.id);
    });
    Array.from(state.events.keys()).forEach(id => {
      if(!currentIds.has(id)) {
        state.events.delete(id);
        removeEventListeners(id);
      }
    });
    renderAll();
  });
}

initDashboard().catch(err => {
  console.error("Super admin load failed", err);
  setText("metricGross", "Unavailable");
  setText("metricEvents", "Unavailable");
  setText("metricCheckins", "Unavailable");
  setText("metricRefunds", "Unavailable");
  const orgRows = document.getElementById("orgRows");
  if(orgRows) orgRows.innerHTML = `<tr><td colspan="5" class="muted">Unable to load owners.</td></tr>`;
  const ownersTable = document.getElementById("ownersTable");
  if(ownersTable) ownersTable.innerHTML = `<tr><td colspan="5" class="muted">Unable to load owners.</td></tr>`;
  const eventsTable = document.getElementById("eventsTable");
  if(eventsTable) eventsTable.innerHTML = `<tr><td colspan="5" class="muted">Unable to load events.</td></tr>`;
  const ticketsTable = document.getElementById("ticketsTable");
  if(ticketsTable) ticketsTable.innerHTML = `<tr><td colspan="5" class="muted">Unable to load orders.</td></tr>`;
  const paymentsTable = document.getElementById("paymentsTable");
  if(paymentsTable) paymentsTable.innerHTML = `<tr><td colspan="5" class="muted">Unable to load payments.</td></tr>`;
  const moderationTable = document.getElementById("moderationTable");
  if(moderationTable) moderationTable.innerHTML = `<tr><td colspan="5" class="muted">Unable to load moderation feed.</td></tr>`;
  const audit = document.getElementById("auditStream");
  if(audit) audit.innerHTML = `<div class="muted">Unable to load audit activity.</div>`;
});
