import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, query, where, limit, getDocs, doc, getDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSkWiKD-7IefgM74mf9S-7xC1977_LP4w",
  authDomain: "events-339ce.firebaseapp.com",
  databaseURL: "https://events-339ce-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "events-339ce",
  storageBucket: "events-339ce.firebasestorage.app",
  messagingSenderId: "948715445110",
  appId: "1:948715445110:web:0d7fbf1b32f17b3642f4d6",
  measurementId: "G-K21H9ZZCHB"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const $ = (id)=> document.getElementById(id);

const state = {
  eventId: "",
  staff: null,
  event: null,
  orders: [],
  scanLogs: [],
  ordersUnsub: null,
  scansUnsub: null
};

function parseEventId(){
  const params = new URLSearchParams(location.search);
  return params.get("event") || "";
}

function fmtEGP(n){
  const val = Number(n || 0);
  return `EGP ${val.toLocaleString("en-US")}`;
}

function normalizeOrder(id, raw){
  const status = String(raw?.status || "paid").toLowerCase();
  const amount = Number(raw?.amount ?? raw?.total ?? raw?.price ?? 0) || 0;
  const qtyRaw = Number(raw?.qty ?? raw?.quantity ?? raw?.count ?? 0) || 0;
  const customer = raw?.name || raw?.Name || raw?.customer || raw?.customerName || raw?.fullName || "";
  const contact = {
    phone: raw?.phone || raw?.Phone || raw?.contact?.phone || raw?.buyerPhone || "",
    email: raw?.email || raw?.Email || raw?.contact?.email || raw?.buyerEmail || ""
  };
  const tierId = raw?.tierId || raw?.tierid || raw?.tier?.id || "";
  const waveId = raw?.waveId || raw?.waveid || raw?.wave?.id || "";
  const tiers = Array.isArray(raw?.tiers)
    ? raw.tiers.map(t=>({ tierId: t.tierId || t.id || "", tierName: t.tierName || t.name || "", qty: Number(t.qty ?? t.quantity ?? 1) || 1 }))
    : (tierId ? [{ tierId, tierName: raw?.tierName || raw?.tier?.name || "", qty: qtyRaw || 1 }] : []);
  const qty = qtyRaw || tiers.reduce((s,t)=>s+t.qty,0);
  return { id, status, amount, qty, customer, contact, tiers, waveId, checkedIn: !!(raw?.checkedIn || raw?.checkedInAt) };
}

function calcMetrics(orders){
  const paid = orders.filter(o=>o.status === "paid");
  const refunded = orders.filter(o=>o.status === "refunded");
  const gross = paid.reduce((s,o)=>s+o.amount,0);
  const refunds = refunded.reduce((s,o)=>s+o.amount,0);
  const sold = paid.reduce((s,o)=>s+(o.qty || 0),0);
  const checkins = orders.filter(o=>o.checkedIn).length;
  return { gross, refunds, net: gross-refunds, sold, checkins };
}

function showPanel(role){
  ["panelFinance","panelViewer","panelOps","panelDesign"].forEach(id=>$(id)?.classList.add("hidden"));
  if(role === "Finance") $("panelFinance").classList.remove("hidden");
  if(role === "Viewer"){
    $("panelViewer").classList.remove("hidden");
    $("panelFinance").classList.remove("hidden");
    $("panelOps").classList.remove("hidden");
  }
  if(role === "Ops Manager") $("panelOps").classList.remove("hidden");
  if(role === "Design") $("panelDesign").classList.remove("hidden");
}

function renderEventMeta(){
  const ev = state.event;
  if(!ev) return;
  $("eventName").textContent = ev.name || "Event";
  $("eventMeta").textContent = `${ev.date || ""} ${ev.time || ""}`.trim();
  $("eventStatus").textContent = ev.status || "Draft";
  $("viewDate").textContent = ev.date || "—";
  $("viewVenue").textContent = ev.venue || "—";
  $("viewCity").textContent = ev.city || ev.locationText || "—";
  $("designHeadline").textContent = ev.design?.headline || "—";
  $("designEmail").textContent = ev.design?.emailText || "—";
  $("designPrimary").textContent = ev.design?.primary || "—";
  $("designAccent").textContent = ev.design?.accent || "—";
  $("designFont").textContent = ev.design?.fontFamily || "—";
  const banner = $("designBanner");
  const logo = $("designLogo");
  const bannerUrl = ev.design?.bannerUrl || ev.bannerUrl || "";
  const logoUrl = ev.design?.logoUrl || ev.logoUrl || "";
  if(banner){
    banner.src = bannerUrl;
    banner.style.display = bannerUrl ? "block" : "none";
  }
  if(logo){
    logo.src = logoUrl;
    logo.style.display = logoUrl ? "block" : "none";
  }
}

function renderFinance(){
  const metrics = calcMetrics(state.orders);
  $("finGross").textContent = fmtEGP(metrics.gross);
  $("finRefunds").textContent = fmtEGP(metrics.refunds);
  $("finNet").textContent = fmtEGP(metrics.net);
  $("finSold").textContent = metrics.sold.toLocaleString("en-US");
  $("finCheckins").textContent = metrics.checkins.toLocaleString("en-US");

  const tierAgg = new Map();
  const waveAgg = new Map();
  for(const o of state.orders){
    if(o.status !== "paid") continue;
    const waveKey = o.waveId || "—";
    const wave = waveAgg.get(waveKey) || { sold: 0, revenue: 0 };
    wave.sold += o.qty || 0;
    wave.revenue += o.amount || 0;
    waveAgg.set(waveKey, wave);

    for(const t of o.tiers || []){
      const key = t.tierId || "—";
      const row = tierAgg.get(key) || { name: t.tierName || key, sold: 0, revenue: 0 };
      row.sold += t.qty || 0;
      row.revenue += (o.amount / Math.max(o.qty || 1, 1)) * (t.qty || 0);
      tierAgg.set(key, row);
    }
  }

  const tierBody = $("finTierBody");
  tierBody.innerHTML = "";
  const tiers = state.event?.tiers || [];
  const tierRows = tiers.map(t=>{
    const agg = tierAgg.get(t.id) || { sold: 0, revenue: 0 };
    const cap = Number(t.capacity || t.baseCap || 0) || 0;
    const remaining = cap ? Math.max(cap - agg.sold, 0) : 0;
    return `<tr><td>${t.name || t.id}</td><td>${agg.sold}</td><td>${remaining || "—"}</td><td>${fmtEGP(agg.revenue)}</td></tr>`;
  });
  tierBody.innerHTML = tierRows.join("") || `<tr><td colspan="4">No tier sales yet.</td></tr>`;

  const waveBody = $("finWaveBody");
  waveBody.innerHTML = "";
  const waves = state.event?.waves || [];
  const waveRows = waves.map(w=>{
    const agg = waveAgg.get(w.id) || { sold: 0, revenue: 0 };
    return `<tr><td>${w.name || w.id}</td><td>${agg.sold}</td><td>${fmtEGP(agg.revenue)}</td></tr>`;
  });
  waveBody.innerHTML = waveRows.join("") || `<tr><td colspan="3">No wave sales yet.</td></tr>`;

  const ordersBody = $("finOrdersBody");
  ordersBody.innerHTML = "";
  const orderRows = state.orders.slice(0,200).map(o=>`
    <tr>
      <td class="mono">${o.id || "—"}</td>
      <td>${o.customer || "—"}</td>
      <td>${o.qty || 0}</td>
      <td>${fmtEGP(o.amount)}</td>
      <td>${o.status}</td>
    </tr>
  `);
  ordersBody.innerHTML = orderRows.join("") || `<tr><td colspan="5">No orders yet.</td></tr>`;
}

function renderViewer(){
  const metrics = calcMetrics(state.orders);
  $("viewSold").textContent = metrics.sold.toLocaleString("en-US");
  $("viewCheckins").textContent = metrics.checkins.toLocaleString("en-US");
}

function renderOps(){
  const body = $("opsBody");
  body.innerHTML = "";
  let approved = 0;
  let denied = 0;
  const staffAgg = new Map();
  const orderMap = new Map(state.orders.map(o=>[o.id, o]));
  for(const log of state.scanLogs){
    const outcome = String(log?.outcome || "").toLowerCase();
    if(outcome.includes("approved")) approved += 1;
    if(outcome.includes("denied")) denied += 1;
    const staff = log?.staffUsername || "—";
    const staffRow = staffAgg.get(staff) || { approved: 0, denied: 0 };
    if(outcome.includes("approved")) staffRow.approved += 1;
    if(outcome.includes("denied")) staffRow.denied += 1;
    staffAgg.set(staff, staffRow);
  }
  $("opsApproved").textContent = approved.toLocaleString("en-US");
  $("opsDenied").textContent = denied.toLocaleString("en-US");

  const staffBody = $("opsStaffBody");
  staffBody.innerHTML = "";
  const staffRows = Array.from(staffAgg.entries()).map(([staff, row])=>`
    <tr><td>${staff}</td><td>${row.approved}</td><td>${row.denied}</td></tr>
  `);
  staffBody.innerHTML = staffRows.join("") || `<tr><td colspan="3">No staff scans yet.</td></tr>`;

  for(const log of state.scanLogs.slice(0,200)){
    const dt = log?.createdAt?.toDate?.() || (log?.createdAt ? new Date(log.createdAt) : null);
    const time = dt ? dt.toLocaleString() : "—";
    const order = log?.orderId ? orderMap.get(log.orderId) : null;
    const guest = order?.customer || "—";
    const phone = order?.contact?.phone || "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${time}</td>
      <td>${log?.gateName || "—"}</td>
      <td>${log?.staffUsername || "—"}</td>
      <td>${guest}</td>
      <td>${phone}</td>
      <td>${log?.outcome || "—"}</td>
      <td>${log?.reason || ""}</td>
    `;
    body.appendChild(tr);
  }
  if(state.scanLogs.length === 0){
    body.innerHTML = `<tr><td colspan="7">No scan activity yet.</td></tr>`;
  }
}

async function staffLogin(eventId, username, pin){
  const staffCol = collection(db, "events", eventId, "staff");
  const qy = query(staffCol, where("username", "==", username), limit(1));
  const snap = await getDocs(qy);
  if(snap.empty) throw new Error("User not found");
  const docSnap = snap.docs[0];
  const staff = { id: docSnap.id, ...docSnap.data() };

  if(staff.disabled) throw new Error("This account is disabled.");
  if(staff.pin !== pin) throw new Error("Incorrect PIN.");
  if(staff.role === "Usher" || staff.role === "Manual Desk"){
    throw new Error("Use the usher or manual desk link for this role.");
  }
  if(staff.role === "Design"){
    throw new Error("Design access is restricted to owners.");
  }
  return staff;
}

async function loadEvent(eventId){
  const ref = doc(db, "events", eventId);
  const snap = await getDoc(ref);
  if(!snap.exists()) throw new Error("Event not found.");
  return snap.data();
}

function attachOrdersListener(){
  if(state.ordersUnsub) state.ordersUnsub();
  const colRef = collection(db, "events", state.eventId, "orders");
  state.ordersUnsub = onSnapshot(colRef, (snap)=>{
    state.orders = snap.docs.map(d=> normalizeOrder(d.id, d.data()));
    renderFinance();
    renderViewer();
  });
}

function attachScanLogsListener(){
  if(state.scansUnsub) state.scansUnsub();
  const colRef = collection(db, "events", state.eventId, "scanLogs");
  state.scansUnsub = onSnapshot(colRef, (snap)=>{
    state.scanLogs = snap.docs.map(d=> d.data());
    renderOps();
  });
}

function showView(id){
  ["viewLogin","viewTeam"].forEach(v=>$(v)?.classList.add("hidden"));
  $(id)?.classList.remove("hidden");
}

function persistSession(){
  localStorage.setItem("luma_team_session", JSON.stringify({
    eventId: state.eventId,
    staffId: state.staff?.id || "",
    username: state.staff?.username || "",
    role: state.staff?.role || ""
  }));
}

function clearSession(){
  localStorage.removeItem("luma_team_session");
}

async function initTeam(){
  $("eventIdInput").value = state.eventId || "";
  $("btnLogin").addEventListener("click", async ()=>{
    const username = $("username").value.trim();
    const pin = $("pin").value.trim();
    if(!state.eventId) return alert("Missing event parameter.");
    if(!username || !pin) return alert("Enter username and PIN.");
    try{
      const staff = await staffLogin(state.eventId, username, pin);
      state.staff = staff;
      state.event = await loadEvent(state.eventId);
      persistSession();

      $("staffName").textContent = staff.username || staff.full || "—";
      $("staffRole").textContent = staff.role || "—";
      renderEventMeta();
      showPanel(staff.role);
      showView("viewTeam");

      attachOrdersListener();
      if(staff.role === "Ops Manager"){
        attachScanLogsListener();
      }
    }catch(err){
      alert(err.message || "Login failed.");
    }
  });

  $("btnClearLogin").addEventListener("click", ()=>{
    $("username").value = "";
    $("pin").value = "";
  });

  $("btnLogout").addEventListener("click", ()=>{
    clearSession();
    showView("viewLogin");
  });

  const session = JSON.parse(localStorage.getItem("luma_team_session") || "null");
  if(session && session.eventId === state.eventId && session.username){
    $("username").value = session.username || "";
  }
}

state.eventId = parseEventId();
initTeam();
