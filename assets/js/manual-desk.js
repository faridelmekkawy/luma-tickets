import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, query, where, limit,
  getDocs, updateDoc, addDoc, serverTimestamp, deleteField
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA80bAAGPuyscnTVS-zwrxE9Jp3tPiS1gM",
  authDomain: "events-339ce.firebaseapp.com",
  databaseURL: "https://events-339ce-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "events-339ce",
  storageBucket: "events-339ce.firebasestorage.app",
  messagingSenderId: "175601544315",
  appId: "1:175601544315:web:00c94b4affa972b3a286de"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const state = {
  eventId: null,
  event: null,
  staff: null,
  orders: [],
  filtered: [],
  selected: null,
  syncing: false
};

const $ = (id) => document.getElementById(id);

function getParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function fmtTime(d){
  try{
    return new Intl.DateTimeFormat(undefined, {dateStyle:"medium", timeStyle:"short"}).format(d);
  }catch{
    return d.toLocaleString();
  }
}

function toast(title, body){
  const box = $("toast");
  if(!box) return;
  $("toastTitle").textContent = title;
  $("toastBody").textContent = body || "";
  box.classList.add("show");
  clearTimeout(box.__hideTimer);
  box.__hideTimer = setTimeout(()=> box.classList.remove("show"), 2600);
}

function setOnlineUI(){
  const online = navigator.onLine;
  $("netDot").classList.toggle("ok", online);
  $("netDot").classList.toggle("bad", !online);
  $("netText").textContent = online ? "Online" : "Offline";
}

function normalizeStatus(raw){
  const value = (raw ?? "paid").toString().trim().toLowerCase();
  if(value === "paid") return "Paid";
  if(value === "refunded") return "Refunded";
  if(value === "pending") return "Pending";
  if(value === "cancelled") return "Cancelled";
  return value ? value[0].toUpperCase() + value.slice(1) : "Paid";
}

function normalizeOrder(id, o){
  const ts = o?.createdAt;
  let dt = null;
  try{
    if(ts?.toDate) dt = ts.toDate();
    else if(typeof ts === "string") dt = new Date(ts);
    else if(typeof ts?.seconds === "number") dt = new Date(ts.seconds * 1000);
  }catch(_){ }
  const iso = (dt && !isNaN(dt.getTime())) ? dt.toISOString() : (o?.timestamp || "");

  const amount = Number(o?.total ?? o?.amount ?? o?.price ?? 0) || 0;
  const qty = Number(o?.qty ?? o?.quantity ?? o?.count ?? 1) || 1;
  const customer = (o?.name || o?.Name || o?.customer || o?.customerName || o?.fullName || o?.buyerName || "").toString();
  const contact = {
    phone: (o?.phone || o?.Phone || o?.contact?.phone || o?.buyerPhone || "").toString(),
    email: (o?.email || o?.Email || o?.contact?.email || o?.buyerEmail || "").toString()
  };
  const checkinTs = o?.checkedInAt;
  let checkinDate = null;
  try{
    if(checkinTs?.toDate) checkinDate = checkinTs.toDate();
    else if(typeof checkinTs === "string") checkinDate = new Date(checkinTs);
    else if(typeof checkinTs?.seconds === "number") checkinDate = new Date(checkinTs.seconds * 1000);
  }catch(_){ }
  const checkinIso = (checkinDate && !isNaN(checkinDate.getTime())) ? checkinDate.toISOString() : (o?.checkedInAt || "");
  const checkedIn = typeof o?.checkedIn === "boolean" ? o.checkedIn : !!checkinIso;

  const tierId = o?.tierId || o?.tierid || o?.tier?.id || "";
  const waveId = o?.waveId || o?.waveid || o?.wave?.id || "";
  const tiers = Array.isArray(o?.tiers)
    ? o.tiers.map(t=>(
      { tierId: t.tierId || t.id || "", tierName: t.tierName || t.name || "", qty: Number(t.qty ?? t.quantity ?? 1) || 1 }
    ))
    : (tierId ? [{ tierId, tierName: o?.tierName || o?.tier?.name || "", qty }] : []);

  return {
    id,
    orderId: o?.orderId || id,
    timestamp: iso,
    status: normalizeStatus(o?.status),
    amount,
    currency: o?.currency || "EGP",
    qty,
    waveId,
    tierId,
    ticketId: o?.ticketId || o?.ticketid || o?.ticket?.id || "",
    customer,
    contact,
    tiers,
    checkedIn,
    checkedInAt: checkinIso,
    checkedInGate: o?.checkedInGate || "",
    checkedInBy: o?.checkedInBy || "",
    checkedInByUsername: o?.checkedInByUsername || ""
  };
}

function tierLabel(order){
  if(order.tiers?.length > 1){
    const primary = order.tiers[0]?.tierName || order.tiers[0]?.tierId || order.tierId || "—";
    return `${primary} +${order.tiers.length - 1}`;
  }
  return order.tiers?.[0]?.tierName || order.tierId || "—";
}

function waveLabel(order){
  return order.waveId || "—";
}

function setCounts(){
  const total = state.orders.length;
  const checked = state.orders.filter(o=>o.checkedIn).length;
  $("countTotal").textContent = total.toLocaleString();
  $("countChecked").textContent = checked.toLocaleString();
  $("countRemaining").textContent = Math.max(total - checked, 0).toLocaleString();
}

function setLastSync(date){
  $("lastSync").textContent = date ? fmtTime(date) : "—";
}

function setStatus(message, isError=false){
  const el = $("deskStatus");
  if(!el) return;
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function setEventLogo(event){
  const logoEl = $("eventLogo");
  if(!logoEl) return;
  const logoUrl = event?.logoUrl || event?.logo || event?.image || event?.eventLogo;
  if(logoUrl){
    logoEl.src = logoUrl;
    logoEl.classList.remove("hidden");
  }else{
    logoEl.classList.add("hidden");
    logoEl.removeAttribute("src");
  }
}

async function staffLogin(eventId, username, pin){
  const staffCol = collection(db, "events", eventId, "staff");
  const qy = query(staffCol, where("username", "==", username), limit(1));
  const snap = await getDocs(qy);
  if(snap.empty) return {ok:false, reason:"Invalid credentials"};

  const docSnap = snap.docs[0];
  const data = docSnap.data() || {};
  if(data.active === false) return {ok:false, reason:"Staff account disabled"};
  if(String(data.pin || "") !== String(pin || "")) return {ok:false, reason:"Invalid credentials"};

  return {
    ok:true,
    staff:{
      id: docSnap.id,
      username: data.username || "",
      role: data.role || "Manual Desk"
    }
  };
}

async function loadEvent(eventId){
  const ref = doc(db, "events", eventId);
  const snap = await getDoc(ref);
  if(!snap.exists()) throw new Error("Event not found");
  return snap.data();
}

async function loadOrders(){
  if(state.syncing) return;
  state.syncing = true;
  setStatus("Loading guest list...");
  try{
    const col = collection(db, "events", state.eventId, "orders");
    const snap = await getDocs(col);
    const list = snap.docs.map(d=> normalizeOrder(d.id, d.data()));
    list.sort((a,b)=> (b.timestamp || "").localeCompare(a.timestamp || ""));
    state.orders = list;
    setCounts();
    populateFilterOptions();
    applyFilters();
    setLastSync(new Date());
    setStatus(`Loaded ${list.length} guests.`);
  }catch(err){
    console.error(err);
    setStatus("Failed to load guest list.", true);
    toast("Load failed", "Check your network or try again.");
  }finally{
    state.syncing = false;
  }
}

function populateFilterOptions(){
  const tierSelect = $("tierFilter");
  const waveSelect = $("waveFilter");
  const tiers = new Map();
  const waves = new Map();

  if(state.event?.tiers){
    for(const t of state.event.tiers){
      if(t?.id) tiers.set(t.id, t.name || t.id);
    }
  }
  if(state.event?.waves){
    for(const w of state.event.waves){
      if(w?.id) waves.set(w.id, w.name || w.id);
    }
  }

  for(const order of state.orders){
    for(const t of order.tiers || []){
      if(t?.tierId) tiers.set(t.tierId, t.tierName || t.tierId);
    }
    if(order.waveId) waves.set(order.waveId, order.waveId);
  }

  tierSelect.innerHTML = `<option value="">All</option>` +
    Array.from(tiers.entries()).map(([id,name])=>`<option value="${id}">${name}</option>`).join("");

  waveSelect.innerHTML = `<option value="">All</option>` +
    Array.from(waves.entries()).map(([id,name])=>`<option value="${id}">${name}</option>`).join("");
}

function applyFilters(){
  const search = $("searchInput").value.trim().toLowerCase();
  const statusFilter = $("statusFilter").value;
  const checkFilter = $("checkinFilter").value;
  const tierFilter = $("tierFilter").value;
  const waveFilter = $("waveFilter").value;

  state.filtered = state.orders.filter(order=>{
    if(statusFilter && order.status !== statusFilter) return false;
    if(checkFilter === "checked" && !order.checkedIn) return false;
    if(checkFilter === "not" && order.checkedIn) return false;
    if(tierFilter){
      const hasTier = (order.tiers || []).some(t=>t.tierId === tierFilter) || order.tierId === tierFilter;
      if(!hasTier) return false;
    }
    if(waveFilter && order.waveId !== waveFilter) return false;
    if(!search) return true;

    const hay = [
      order.customer,
      order.orderId,
      order.ticketId,
      order.contact?.phone,
      order.contact?.email,
      order.tierId,
      ...((order.tiers || []).map(t=>t.tierName || t.tierId)),
      order.waveId
    ].filter(Boolean).join(" ").toLowerCase();

    return hay.includes(search);
  });

  renderTable();
}

function renderTable(){
  const body = $("ordersBody");
  body.innerHTML = "";
  const frag = document.createDocumentFragment();

  for(const order of state.filtered){
    const tr = document.createElement("tr");
    tr.dataset.id = order.id;
    if(state.selected?.id === order.id){
      tr.classList.add("active");
    }
    const statusClass = order.checkedIn ? "ok" : "warn";
    tr.innerHTML = `
      <td>${escapeHtml(order.customer || "—")}</td>
      <td>${escapeHtml(tierLabel(order))}</td>
      <td>${escapeHtml(waveLabel(order))}</td>
      <td class="mono">${escapeHtml(order.orderId || "—")}</td>
      <td>${escapeHtml(order.contact?.phone || order.contact?.email || "—")}</td>
      <td><span class="badge">${escapeHtml(order.status)}</span></td>
      <td><span class="badge ${statusClass}">${order.checkedIn ? "Checked-in" : "Not checked"}</span></td>
      <td>
        <button class="btn secondary" data-action="${order.checkedIn ? "undo" : "checkin"}" data-id="${order.id}">
          ${order.checkedIn ? "Undo" : "Check-in"}
        </button>
      </td>
    `;
    frag.appendChild(tr);
  }

  body.appendChild(frag);

  if(state.filtered.length === 0){
    body.innerHTML = `<tr><td colspan="8" class="muted">No guests match your filters.</td></tr>`;
  }
}

function escapeHtml(str){
  return String(str || "").replace(/[&<>"]/g, (m)=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;"
  }[m]));
}

function setDetail(order){
  state.selected = order;
  if(!order){
    $("detailName").textContent = "Select a guest";
    $("detailSub").textContent = "Click a row to see details and take action.";
    $("detailStatus").textContent = "—";
    $("detailStatus").className = "badge";
    $("detailOrder").textContent = "—";
    $("detailTicket").textContent = "—";
    $("detailTier").textContent = "—";
    $("detailWave").textContent = "—";
    $("detailQty").textContent = "—";
    $("detailPhone").textContent = "—";
    $("detailEmail").textContent = "—";
    $("detailCheckin").textContent = "—";
    $("btnCheckin").disabled = true;
    $("btnUndo").disabled = true;
    return;
  }

  $("detailName").textContent = order.customer || "—";
  $("detailSub").textContent = order.orderId ? `Order ${order.orderId}` : "Order details";
  const badge = $("detailStatus");
  badge.textContent = order.checkedIn ? "Checked-in" : "Not checked";
  badge.className = `badge ${order.checkedIn ? "ok" : "warn"}`;
  $("detailOrder").textContent = order.orderId || "—";
  $("detailTicket").textContent = order.ticketId || "—";
  $("detailTier").textContent = tierLabel(order);
  $("detailWave").textContent = waveLabel(order);
  $("detailQty").textContent = order.qty || "1";
  $("detailPhone").textContent = order.contact?.phone || "—";
  $("detailEmail").textContent = order.contact?.email || "—";
  $("detailCheckin").textContent = order.checkedInAt ? fmtTime(new Date(order.checkedInAt)) : "—";

  $("btnCheckin").disabled = order.checkedIn;
  $("btnUndo").disabled = !order.checkedIn;
}

async function writeScanLog({eventId, staff, outcome, reason, ticketId, orderId}){
  try{
    const logsCol = collection(db, "events", eventId, "scanLogs");
    await addDoc(logsCol, {
      createdAt: serverTimestamp(),
      outcome,
      reason: reason || "",
      gateName: "Manual Desk",
      staffId: staff?.id || "",
      staffUsername: staff?.username || "",
      ticketId: ticketId || "",
      orderId: orderId || ""
    });
  }catch(_e){
    // ignore logging failure
  }
}

async function updateTicketCode(ticketId, checkedIn){
  if(!ticketId) return;
  const ref = doc(db, "ticket-codes", ticketId);
  if(checkedIn){
    await updateDoc(ref, {
      redeemedAt: serverTimestamp(),
      redeemedGate: "Manual Desk",
      redeemedBy: state.staff?.id || "",
      redeemedByUsername: state.staff?.username || ""
    });
  }else{
    await updateDoc(ref, {
      redeemedAt: deleteField(),
      redeemedGate: deleteField(),
      redeemedBy: deleteField(),
      redeemedByUsername: deleteField()
    });
  }
}

async function updateOrderCheckin(order, checkedIn){
  const orderRef = doc(db, "events", state.eventId, "orders", order.id);
  if(checkedIn){
    await updateDoc(orderRef, {
      checkedIn: true,
      checkedInAt: serverTimestamp(),
      checkedInGate: "Manual Desk",
      checkedInBy: state.staff?.id || "",
      checkedInByUsername: state.staff?.username || ""
    });
  }else{
    await updateDoc(orderRef, {
      checkedIn: false,
      checkedInAt: deleteField(),
      checkedInGate: deleteField(),
      checkedInBy: deleteField(),
      checkedInByUsername: deleteField()
    });
  }
}

async function performCheckin(order, checkedIn){
  if(!order) return;
  const note = $("deskNote").value.trim();
  setStatus(checkedIn ? "Checking in guest..." : "Undoing check-in...");

  try{
    await updateOrderCheckin(order, checkedIn);
    await updateTicketCode(order.ticketId, checkedIn);
    await writeScanLog({
      eventId: state.eventId,
      staff: state.staff,
      outcome: checkedIn ? "manual-checkin" : "manual-undo",
      reason: note,
      ticketId: order.ticketId,
      orderId: order.orderId || order.id
    });

    const idx = state.orders.findIndex(o=>o.id === order.id);
    if(idx >= 0){
      state.orders[idx] = {
        ...state.orders[idx],
        checkedIn,
        checkedInAt: checkedIn ? new Date().toISOString() : "",
        checkedInGate: checkedIn ? "Manual Desk" : "",
        checkedInBy: checkedIn ? state.staff?.id || "" : "",
        checkedInByUsername: checkedIn ? state.staff?.username || "" : ""
      };
    }

    setCounts();
    applyFilters();
    setDetail(state.orders[idx] || order);
    $("deskNote").value = "";
    toast("Success", checkedIn ? "Guest checked in." : "Check-in undone.");
    setStatus(checkedIn ? "Guest checked in." : "Check-in undone.");
  }catch(err){
    console.error(err);
    setStatus("Update failed.", true);
    toast("Update failed", "Please retry.");
  }
}

function saveSession(){
  localStorage.setItem("luma_manual_session", JSON.stringify({
    eventId: state.eventId,
    staffId: state.staff?.id || "",
    username: state.staff?.username || "",
    role: state.staff?.role || "Manual Desk"
  }));
}

function clearSession(){
  localStorage.removeItem("luma_manual_session");
}

function loadSession(){
  try{
    const raw = localStorage.getItem("luma_manual_session");
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}

function showLogin(){
  $("viewLogin").classList.remove("hidden");
  $("viewDesk").classList.add("hidden");
}

function showDesk(){
  $("viewLogin").classList.add("hidden");
  $("viewDesk").classList.remove("hidden");
}

$("btnClearLogin").addEventListener("click", ()=>{
  $("username").value = "";
  $("pin").value = "";
  $("username").focus();
});

$("btnLogin").addEventListener("click", async ()=>{
  const eventId = state.eventId;
  const u = $("username").value.trim();
  const p = $("pin").value.trim();

  if(!eventId){ alert("Missing event in link."); return; }
  if(!u || !p){ alert("Enter username and PIN."); return; }

  $("btnLogin").disabled = true;
  $("btnLogin").textContent = "Logging in…";

  try{
    state.event = await loadEvent(eventId);
    const res = await staffLogin(eventId, u, p);
    if(!res.ok){
      alert(res.reason || "Login failed");
      return;
    }

    state.staff = res.staff;
    $("eventName").textContent = state.event.name || "Event";
    $("eventMeta").textContent = `${state.event.date || ""} ${state.event.time || ""}`.trim() || "Manual desk • Full guest list access";
    $("topTitle").textContent = state.event.name ? `Manual Desk • ${state.event.name}` : "Manual Desk";
    $("topSub").textContent = state.staff.username ? `Signed in as ${state.staff.username}` : "On-site Ops";
    $("staffName").textContent = state.staff.username || "—";
    $("staffRole").textContent = state.staff.role || "Manual Desk";
    setEventLogo(state.event);

    saveSession();
    showDesk();
    await loadOrders();
    setDetail(null);
  }catch(err){
    console.error(err);
    alert("Could not load event or login.");
  }finally{
    $("btnLogin").disabled = false;
    $("btnLogin").textContent = "Login";
  }
});

$("btnLogout").addEventListener("click", ()=>{
  clearSession();
  state.staff = null;
  state.orders = [];
  state.filtered = [];
  setDetail(null);
  showLogin();
});

$("searchInput").addEventListener("input", applyFilters);
$("statusFilter").addEventListener("change", applyFilters);
$("checkinFilter").addEventListener("change", applyFilters);
$("tierFilter").addEventListener("change", applyFilters);
$("waveFilter").addEventListener("change", applyFilters);

$("btnRefresh").addEventListener("click", loadOrders);

$("ordersBody").addEventListener("click", (e)=>{
  const action = e.target?.dataset?.action;
  const id = e.target?.dataset?.id || e.target?.closest("tr")?.dataset?.id;
  if(!id) return;
  const order = state.orders.find(o=>o.id === id);
  if(!order) return;

  if(action === "checkin"){
    if(confirm(`Check in ${order.customer || "this guest"}?`)) performCheckin(order, true);
    return;
  }
  if(action === "undo"){
    if(confirm(`Undo check-in for ${order.customer || "this guest"}?`)) performCheckin(order, false);
    return;
  }

  setDetail(order);
  renderTable();
});

$("btnCheckin").addEventListener("click", ()=>{
  if(!state.selected) return;
  if(confirm(`Check in ${state.selected.customer || "this guest"}?`)) performCheckin(state.selected, true);
});

$("btnUndo").addEventListener("click", ()=>{
  if(!state.selected) return;
  if(confirm(`Undo check-in for ${state.selected.customer || "this guest"}?`)) performCheckin(state.selected, false);
});

function initNet(){
  setOnlineUI();
  window.addEventListener("online", setOnlineUI);
  window.addEventListener("offline", setOnlineUI);
}

async function init(){
  initNet();
  state.eventId = getParam("event");
  $("eventIdInput").value = state.eventId || "(missing)";

  if(!state.eventId){
    alert("Missing event parameter. Use: /manual-desk?event=EVENT_ID");
    return;
  }

  const sess = loadSession();
  if(sess && sess.eventId === state.eventId && sess.staffId){
    try{
      state.event = await loadEvent(state.eventId);
      state.staff = {
        id: sess.staffId,
        username: sess.username || "",
        role: sess.role || "Manual Desk"
      };

      $("eventName").textContent = state.event.name || "Event";
      $("eventMeta").textContent = `${state.event.date || ""} ${state.event.time || ""}`.trim() || "Manual desk • Full guest list access";
      $("topTitle").textContent = state.event.name ? `Manual Desk • ${state.event.name}` : "Manual Desk";
      $("topSub").textContent = state.staff.username ? `Signed in as ${state.staff.username}` : "On-site Ops";
      $("staffName").textContent = state.staff.username || "—";
      $("staffRole").textContent = state.staff.role || "Manual Desk";
      setEventLogo(state.event);

      showDesk();
      await loadOrders();
      setDetail(null);
    }catch(_e){
      showLogin();
    }
  }else{
    showLogin();
  }

  setTimeout(()=> $("username")?.focus(), 150);
}

init();
