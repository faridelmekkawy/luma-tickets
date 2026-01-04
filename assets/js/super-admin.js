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
let getDocs;
let query;
let orderBy;
let limit;

let db;

const $ = (sel, root = document) => root.querySelector(sel);
const fmtNumber = (value) => Number(value || 0).toLocaleString("en-US");
const fmtCurrency = (value) => `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

async function loadFirebase() {
  const appMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  ({ initializeApp, getApps } = appMod);

  const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  ({ getFirestore, collection, getDocs, query, orderBy, limit } = fsMod);

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
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
  return { amount, status, qty };
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

async function fetchOrders(eventId) {
  const ordersCol = collection(db, "events", eventId, "orders");
  const snap = await getDocs(ordersCol);
  return snap.docs.map(doc => doc.data());
}

async function fetchScanLogs(eventId, limitCount = 80) {
  const logsCol = collection(db, "events", eventId, "scanLogs");
  const snap = await getDocs(query(logsCol, orderBy("createdAt", "desc"), limit(limitCount)));
  return snap.docs.map(doc => doc.data());
}

function renderRevenueChart(orgs) {
  const chart = document.getElementById("revenueChart");
  if(!chart) return;
  chart.innerHTML = "";
  if(orgs.length === 0) {
    chart.innerHTML = `<div class="muted">No revenue data yet.</div>`;
    return;
  }
  const maxGross = Math.max(...orgs.map(o => o.gross || 0), 1);
  orgs.forEach(org => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(12, (org.gross / maxGross) * 100)}%`;
    bar.dataset.label = org.label;
    chart.appendChild(bar);
  });
}

function renderFrictionList(items) {
  const list = document.getElementById("frictionList");
  if(!list) return;
  list.innerHTML = "";
  if(items.length === 0) {
    list.innerHTML = `<div class="muted">No hotspots detected.</div>`;
    return;
  }
  items.forEach(item => {
    const wrapper = document.createElement("div");
    wrapper.className = "override";
    wrapper.innerHTML = `
      <div>
        <strong>${item.title}</strong>
        <p class="muted">${item.detail}</p>
      </div>
    `;
    const pill = document.createElement("div");
    pill.className = `pill ${item.level === "High" ? "red" : item.level === "Managed" ? "green" : ""}`;
    pill.textContent = item.level;
    wrapper.appendChild(pill);
    list.appendChild(wrapper);
  });
}

function renderOrgRows(orgs) {
  const body = document.getElementById("orgRows");
  if(!body) return;
  body.innerHTML = "";
  if(orgs.length === 0) {
    body.innerHTML = `<tr><td colspan="5" class="muted">No organizations found.</td></tr>`;
    return;
  }

  orgs.forEach(org => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${org.label}</td>
      <td></td>
      <td>${org.flags.join(", ") || "—"}</td>
      <td>${org.owner}</td>
      <td>Edit · Override · Review</td>
    `;
    row.children[1].appendChild(buildPill(org.status));
    body.appendChild(row);
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

async function initDashboard() {
  await loadFirebase();

  const eventsSnap = await getDocs(collection(db, "events"));
  const events = eventsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const totals = {
    gross: 0,
    refunds: 0,
    sold: 0,
    checkins: 0
  };

  const orgsMap = new Map();
  const auditItems = [];
  const frictionItems = [];

  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let checkinsLastHour = 0;
  let totalOrders = 0;

  for(const event of events) {
    const orders = await fetchOrders(event.id);
    const logs = await fetchScanLogs(event.id);

    let eventGross = 0;
    let eventRefunds = 0;
    let eventSold = 0;
    let deniedCount = 0;
    let approvedCount = 0;

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
    });

    logs.forEach(log => {
      if(log.outcome === "denied") deniedCount += 1;
      if(log.outcome === "approved") {
        approvedCount += 1;
        const time = scanLogTime(log);
        if(time && time.getTime() >= oneHourAgo) {
          checkinsLastHour += 1;
        }
      }
    });

    totals.gross += eventGross;
    totals.refunds += eventRefunds;
    totals.sold += eventSold;
    totals.checkins += approvedCount;

    const ownerId = event.ownerId || event.ownerUid || "Unknown";
    const orgEntry = orgsMap.get(ownerId) || {
      id: ownerId,
      label: event.ownerName || `Org ${ownerId.slice(0, 6)}`,
      owner: ownerId === "Unknown" ? "Unassigned" : ownerId.slice(0, 8).toUpperCase(),
      events: 0,
      gross: 0,
      refunds: 0,
      denied: 0,
      flags: new Set()
    };
    orgEntry.events += 1;
    orgEntry.gross += eventGross;
    orgEntry.refunds += eventRefunds;
    orgEntry.denied += deniedCount;
    if(eventRefunds > 0) orgEntry.flags.add("Refund queue");
    if(deniedCount > 0) orgEntry.flags.add("Scan denies");
    if(event.status === "Live") orgEntry.flags.add("Live event");
    orgsMap.set(ownerId, orgEntry);

    const logItem = logs.find(log => log.outcome === "approved" || log.outcome === "denied");
    if(logItem) {
      const logTime = scanLogTime(logItem);
      auditItems.push({
        when: formatRelativeTime(logTime),
        title: logItem.outcome === "approved" ? "Check-in approved" : "Entry denied",
        detail: `${event.name || "Event"} · ${logItem.ticketId || logItem.orderId || "Scan"}`
      });
    }

    if(eventRefunds > 0 && eventGross > 0 && eventRefunds / eventGross > 0.08) {
      frictionItems.push({
        title: "Refund spike",
        detail: `${event.name || "Event"} refunds at ${Math.round((eventRefunds / eventGross) * 100)}%`,
        level: "High"
      });
    }
    if(deniedCount > 8) {
      frictionItems.push({
        title: "Denied scan volume",
        detail: `${event.name || "Event"} has ${deniedCount} denied scans`,
        level: "Monitor"
      });
    }
    if(event.status === "Live" && eventSold > 0 && approvedCount / eventSold < 0.4) {
      frictionItems.push({
        title: "Low check-in ratio",
        detail: `${event.name || "Event"} check-in rate below 40%`,
        level: "Managed"
      });
    }
  }

  const orgs = Array.from(orgsMap.values())
    .map(org => {
      const refundRatio = org.gross > 0 ? org.refunds / org.gross : 0;
      const status = refundRatio > 0.1 || org.denied > 15 ? "Escalated" : refundRatio > 0.04 ? "Watch" : "Healthy";
      return {
        ...org,
        status,
        flags: Array.from(org.flags)
      };
    })
    .sort((a, b) => b.gross - a.gross);

  const topOrgs = orgs.slice(0, 5);
  const tableOrgs = orgs.slice(0, 6);

  setText("metricGross", fmtCurrency(totals.gross));
  setText("metricEvents", fmtNumber(events.filter(ev => ["Live", "On Sale"].includes(ev.status)).length));
  setText("metricCheckins", fmtNumber(Math.round(checkinsLastHour / 60)));
  setText("metricRefunds", fmtCurrency(totals.refunds));

  setText("badgeOrgs", `Orgs: ${fmtNumber(orgs.length)}`);
  const avgOrder = totalOrders > 0 ? totals.gross / totalOrders : 0;
  setText("badgeAvgOrder", `Avg order: ${fmtCurrency(avgOrder)}`);
  setText("badgeTicketVolume", `Tickets: ${fmtNumber(totals.sold)}`);

  renderRevenueChart(topOrgs.map(org => ({
    label: org.label,
    gross: org.gross
  })));

  renderFrictionList(frictionItems.slice(0, 3));
  renderOrgRows(tableOrgs);

  const sortedAudit = auditItems
    .filter(item => item.when !== "—")
    .slice(0, 4);
  renderAuditStream(sortedAudit);
}

initDashboard().catch(err => {
  console.error("Super admin load failed", err);
  setText("metricGross", "Unavailable");
  setText("metricEvents", "Unavailable");
  setText("metricCheckins", "Unavailable");
  setText("metricRefunds", "Unavailable");
  const friction = document.getElementById("frictionList");
  if(friction) friction.innerHTML = `<div class="muted">Unable to load data.</div>`;
  const orgRows = document.getElementById("orgRows");
  if(orgRows) orgRows.innerHTML = `<tr><td colspan="5" class="muted">Unable to load organizations.</td></tr>`;
  const audit = document.getElementById("auditStream");
  if(audit) audit.innerHTML = `<div class="muted">Unable to load audit activity.</div>`;
});
