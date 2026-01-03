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

function normalizeOrder(raw){
  const status = String(raw?.status || "paid").toLowerCase();
  const amount = Number(raw?.amount ?? raw?.total ?? raw?.price ?? 0) || 0;
  const qty = Number(raw?.qty ?? raw?.quantity ?? raw?.count ?? 0) || 0;
  return { status, amount, qty, checkedIn: !!(raw?.checkedIn || raw?.checkedInAt) };
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
  if(role === "Viewer") $("panelViewer").classList.remove("hidden");
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
}

function renderFinance(){
  const metrics = calcMetrics(state.orders);
  $("finGross").textContent = fmtEGP(metrics.gross);
  $("finRefunds").textContent = fmtEGP(metrics.refunds);
  $("finNet").textContent = fmtEGP(metrics.net);
  $("finSold").textContent = metrics.sold.toLocaleString("en-US");
  $("finCheckins").textContent = metrics.checkins.toLocaleString("en-US");
}

function renderViewer(){
  const metrics = calcMetrics(state.orders);
  $("viewSold").textContent = metrics.sold.toLocaleString("en-US");
  $("viewCheckins").textContent = metrics.checkins.toLocaleString("en-US");
}

function renderOps(){
  const body = $("opsBody");
  body.innerHTML = "";
  for(const log of state.scanLogs.slice(0,200)){
    const dt = log?.createdAt?.toDate?.() || (log?.createdAt ? new Date(log.createdAt) : null);
    const time = dt ? dt.toLocaleString() : "—";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${time}</td>
      <td>${log?.gateName || "—"}</td>
      <td>${log?.staffUsername || "—"}</td>
      <td>${log?.outcome || "—"}</td>
      <td>${log?.reason || ""}</td>
    `;
    body.appendChild(tr);
  }
  if(state.scanLogs.length === 0){
    body.innerHTML = `<tr><td colspan="5">No scan activity yet.</td></tr>`;
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
    state.orders = snap.docs.map(d=> normalizeOrder(d.data()));
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
