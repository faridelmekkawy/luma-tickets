/* =========================
   Luma Tickets — Owner Dashboard (Single-file production app)
   ========================= */

/* =========================
   Firebase (Auth + Firestore + Storage)
   - Paste-ready for your project
   ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyA80bAAGPuyscnTVS-zwrxE9Jp3tPiS1gM",
  authDomain: "events-339ce.firebaseapp.com",
  databaseURL: "https://events-339ce-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "events-339ce",
  storageBucket: "events-339ce.firebasestorage.app",
  messagingSenderId: "175601544315",
  appId: "1:175601544315:web:00c94b4affa972b3a286de"
};

const LUMA_LOGO_URL = "https://firebasestorage.googleapis.com/v0/b/events-339ce.firebasestorage.app/o/ChatGPT%20Image%20Dec%2023%2C%202025%2C%2012_55_43%20PM.png?alt=media&token=0facde2f-570c-4004-9e7b-d0d10aca94c3";

// Firebase SDK dynamic imports (PRODUCTION ONLY)
// This app MUST be served over https/http (e.g. Vercel). Opening via file:// is not supported.
let initializeApp, getApp, getApps;

let getAuth, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail,
    signOut, createUserWithEmailAndPassword, updateProfile;

let getFirestore, doc, collection, query, where, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc,
    addDoc, getDocs, orderBy, limit, startAfter, serverTimestamp, Timestamp, increment;

let getStorage, stRef, refFromURL, uploadBytes, getDownloadURL, deleteObject;

// Initialized by __loadFirebase()
let app = null;
let auth = null;
let db = null;
let storage = null;
window.__firebaseReady = false;

// Keep backward-compatible name used elsewhere in this file
let fbSignOut = null;
let __authListenerBound = false;

function __fatalFirebase(msg, err){
  console.error(msg, err || "");
  try{ (window.toast ? window.toast : alert)(msg); }
  catch(_e){ alert(msg); }
}

async function __loadFirebase(){
  if(location.protocol === "file:"){
    throw new Error("This app must be served over https/http (not opened directly from your computer).");
  }

  // Load Firebase modular SDK from official CDN.
  const appMod  = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
  ({ initializeApp, getApp, getApps } = appMod);

  const authMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
  ({ getAuth, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail,
     signOut, createUserWithEmailAndPassword, updateProfile } = authMod);
  fbSignOut = authMod.signOut;

  const fsMod   = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
  ({ getFirestore, doc, collection, query, where, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc,
     addDoc, getDocs, orderBy, limit, startAfter, serverTimestamp, Timestamp, increment } = fsMod);

  const stMod   = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js");
  ({ getStorage, uploadBytes, getDownloadURL, deleteObject } = stMod);
  stRef = stMod.ref;
  refFromURL = stMod.refFromURL;

  app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

  window.__firebaseReady = true;
}

async function __loadFirebaseWithTimeout(ms=4500){
  let timer;
  try{
    return await Promise.race([
      __loadFirebase(),
      new Promise((_, reject)=>{
        timer = setTimeout(()=>reject(new Error("Firebase load timeout")), ms);
      })
    ]);
  }finally{
    if(timer) clearTimeout(timer);
  }
}

async function initFirebase(){
  if(window.__firebaseInit) return window.__firebaseInit;
  window.__firebaseInit = (async ()=>{
    try{
      await __loadFirebaseWithTimeout();
      window.__firebaseReady = true;
    }catch(err){
      window.__firebaseReady = false;
      __fatalFirebase("Firebase failed to load. Check firebaseConfig and that the app is served over https.", err);
    }
  })();
  return window.__firebaseInit;
}


// App init
// (app/auth/db/storage are initialized above)


// Canonical doc path for this single-file app
function ownerDocRef(uid){
  return doc(db, "owners", uid, "apps", "lumaTicketsOwnerDashboard");
}
// PUBLIC EVENTS (what the customer app reads)
function publicEventRef(eventId){
  return doc(db, "events", eventId);
}

// Orders live source (public events/{eventId}/orders)
function publicEventOrdersCol(eventId){
  return collection(db, "events", eventId, "orders");
}

// Scan logs live source (public events/{eventId}/scanLogs)
function publicEventScanLogsCol(eventId){
  return collection(db, "events", eventId, "scanLogs");
}

// Staff live source (public events/{eventId}/staff)
function publicEventStaffCol(eventId){
  return collection(db, "events", eventId, "staff");
}

// Invites live source (public events/{eventId}/invites)
function publicEventInvitesCol(eventId){
  return collection(db, "events", eventId, "invites");
}

function normalizeOrderDoc(id, o){
  const ts = o?.createdAt;
  let dt = null;
  try{
    if(ts?.toDate) dt = ts.toDate();
    else if(typeof ts === "string") dt = new Date(ts);
    else if(typeof ts?.seconds === "number") dt = new Date(ts.seconds*1000);
  }catch(_){}
  const iso = (dt && !isNaN(dt.getTime())) ? dt.toISOString() : (o?.timestamp || new Date().toISOString());

  const rawStatus = (o?.status ?? "paid").toString().trim().toLowerCase();
  const status = rawStatus==="paid" ? "Paid" :
                 rawStatus==="refunded" ? "Refunded" :
                 rawStatus==="pending" ? "Pending" :
                 rawStatus==="cancelled" ? "Cancelled" :
                 rawStatus ? rawStatus[0].toUpperCase()+rawStatus.slice(1) : "Paid";

  const amount = Number(o?.total ?? o?.amount ?? o?.price ?? 0) || 0;
  const ticketsArray = Array.isArray(o?.tickets) ? o.tickets : [];
  const qtyFromTickets = ticketsArray.reduce((s,t)=>s+(Number(t?.quantity ?? t?.qty ?? 0) || 0),0);
  const qtyRaw = Number(o?.qty ?? o?.quantity ?? o?.count ?? 0) || qtyFromTickets || 0;
  const unitPrice = Number(o?.unitPrice ?? (qtyRaw ? amount/qtyRaw : amount) ?? 0) || 0;
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
    else if(typeof checkinTs?.seconds === "number") checkinDate = new Date(checkinTs.seconds*1000);
  }catch(_){}
  const checkinIso = (checkinDate && !isNaN(checkinDate.getTime())) ? checkinDate.toISOString() : (o?.checkedInAt || "");
  const checkedIn = typeof o?.checkedIn === "boolean" ? o.checkedIn : !!checkinIso;
  const tierId = o?.tierId || o?.tierid || o?.tier?.id || "";
  const waveId = o?.waveId || o?.waveid || o?.wave?.id || "";
  const tiers = Array.isArray(o?.tiers)
    ? o.tiers.map(t=>({
        tierId: t.tierId || t.id || "",
        tierName: t.tierName || t.name || "",
        qty: Number(t.qty ?? t.quantity ?? 1) || 1
      }))
    : (ticketsArray.length
      ? ticketsArray.map(t=>({
          tierId: t.tierId || t.id || "",
          tierName: t.tierName || t.name || "",
          qty: Number(t.quantity ?? t.qty ?? 1) || 1
        }))
      : (tierId ? [{ tierId, tierName: o?.tierName || o?.tier?.name || "", qty: qtyRaw || 1 }] : []));
  const qtyFromTiers = tiers.reduce((s,t)=>s+(Number(t.qty)||0),0);
  const qty = (qtyRaw && qtyRaw >= qtyFromTiers) ? qtyRaw : (qtyFromTiers || 1);

  return {
    id,
    orderId: o?.orderId || id,
    timestamp: iso,
    status,
    amount,
    currency: o?.currency || "EGP",
    unitPrice,
    qty,
    waveId,
    tierId,
    ticketId: o?.ticketId || o?.ticketid || o?.ticket?.id || "",
    customer,
    contact,
    tiers,
    customerUid: o?.uid || "",
    checkedIn,
    checkedInAt: checkinIso,
    checkedInBy: o?.checkedInBy || "",
    checkedInByUsername: o?.checkedInByUsername || "",
    checkedInGate: o?.checkedInGate || ""
  };
}

function normalizeInviteDoc(id, invite){
  const createdTs = invite?.createdAt;
  let createdDate = null;
  try{
    if(createdTs?.toDate) createdDate = createdTs.toDate();
    else if(typeof createdTs === "string") createdDate = new Date(createdTs);
    else if(typeof createdTs?.seconds === "number") createdDate = new Date(createdTs.seconds*1000);
  }catch(_){}
  const createdAt = (createdDate && !isNaN(createdDate.getTime())) ? createdDate.toISOString() : (invite?.createdAt || new Date().toISOString());

  const checkinTs = invite?.checkedInAt || invite?.redeemedAt;
  let checkinDate = null;
  try{
    if(checkinTs?.toDate) checkinDate = checkinTs.toDate();
    else if(typeof checkinTs === "string") checkinDate = new Date(checkinTs);
    else if(typeof checkinTs?.seconds === "number") checkinDate = new Date(checkinTs.seconds*1000);
  }catch(_){}
  const checkinAt = (checkinDate && !isNaN(checkinDate.getTime())) ? checkinDate.toISOString() : (invite?.checkedInAt || invite?.redeemedAt || "");

  const statusRaw = (invite?.status || "").toString().trim().toLowerCase();
  const hasCheckin = !!(invite?.checkedInAt || invite?.redeemedAt);
  const status = (statusRaw === "redeemed" || hasCheckin) ? "Checked-in" : "Not checked-in";

  const recipient = invite?.recipient || {};
  return {
    id: id || invite?.inviteToken || "",
    inviteToken: invite?.inviteToken || id || "",
    createdAt,
    status,
    tierId: invite?.tierId || "",
    name: recipient?.name || invite?.name || "",
    contact: {
      phone: recipient?.phone || invite?.phone || "",
      email: recipient?.email || invite?.email || ""
    },
    checkinAt,
    checkinGate: invite?.checkedInGate || invite?.redeemedGate || "",
    checkedInBy: invite?.checkedInBy || invite?.redeemedBy || "",
    checkedInByUsername: invite?.checkedInByUsername || invite?.redeemedByUsername || ""
  };
}

function normalizeScanLogDoc(id, log){
  const ts = log?.createdAt;
  let dt = null;
  try{
    if(ts?.toDate) dt = ts.toDate();
    else if(typeof ts === "string") dt = new Date(ts);
    else if(typeof ts?.seconds === "number") dt = new Date(ts.seconds*1000);
  }catch(_){}
  const ticketTier = log?.ticketId_Tierid || [log?.ticketId, log?.tierId].filter(Boolean).join("_");
  const bits = [];
  if(log?.reason) bits.push(log.reason);
  if(log?.orderId) bits.push(`Order ${log.orderId}`);
  if(ticketTier) bits.push(`Ticket ${ticketTier}`);
  return {
    id,
    time: dt ? dt.toISOString() : (log?.createdAt || new Date().toISOString()),
    gate: log?.gateName || "—",
    staff: log?.staffUsername || "—",
    staffId: log?.staffId || "",
    customer: log?.orderId || "—",
    orderId: log?.orderId || "",
    ticketId: log?.ticketId || "",
    tierId: log?.tierId || "",
    ticketId_Tierid: ticketTier || "",
    outcome: log?.outcome || "—",
    notes: bits.join(" • "),
    source: "scanLog"
  };
}

// Keep a live cache of orders per event for analytics + orders tab
async function hydrateAllOrders(){
  state.ordersByEvent = state.ordersByEvent || {};
  state.ordersUnsubs = state.ordersUnsubs || {};
  state.invitesByEvent = state.invitesByEvent || {};
  state.invitesUnsubs = state.invitesUnsubs || {};

  if(!db) return;
  const evs = data?.events || [];
  await Promise.all(evs.map(async (ev)=>{
    if(!ev?.id) return;
    await ensureOrdersListener(ev.id);
    await ensureScanLogsListener(ev.id);
    await ensureInvitesListener(ev.id);
  }));
}

async function ensureOrdersListener(eventId){
  if(!window.__firebaseReady || typeof onSnapshot !== 'function'){
    console.warn('[Orders] Firebase not ready; skipping realtime listener.');
    return;
  }

  if(state.ordersUnsubs?.[eventId]) return;
  try{
    const col = publicEventOrdersCol(eventId);
    // Live listener (no index assumptions)
    const unsub = onSnapshot(col, (snap)=>{
      const list = snap.docs.map(d=> normalizeOrderDoc(d.id, d.data()));
      // newest first
      list.sort((a,b)=> (b.timestamp||"").localeCompare(a.timestamp||""));
      state.ordersByEvent[eventId] = list;

      // Mirror into data.events for existing UI helpers
      const ev = (data?.events||[]).find(x=>x.id===eventId);
      if(ev) refreshEventFromOrders(ev, list, state.invitesByEvent?.[eventId] || []);

      // Light refresh if user is on analytics or inside this event
      if(state.route==="analytics" || (state.route==="event" && state.activeEventId===eventId)){
        try{ renderAll(); }catch(e){ console.warn(e); }
      }
      if(state.route==="hub"){
        try{ renderHub(); }catch(e){ console.warn(e); }
      }
      if(state.route==="notifications"){
        try{ renderAttentionPage(); }catch(e){ console.warn(e); }
      }
    }, (err)=>{
      console.warn("[Orders listener] failed:", err);
    });
    state.ordersUnsubs[eventId] = unsub;
  }catch(err){
    console.warn("[Orders] could not attach listener", eventId, err);
  }
}

async function ensureScanLogsListener(eventId){
  if(!window.__firebaseReady || typeof onSnapshot !== "function"){
    console.warn("[ScanLogs] Firebase not ready; skipping realtime listener.");
    return;
  }

  if(state.scanLogsUnsubs?.[eventId]) return;
  try{
    const col = publicEventScanLogsCol(eventId);
    const unsub = onSnapshot(col, (snap)=>{
      const list = snap.docs.map(d=> normalizeScanLogDoc(d.id, d.data()));
      list.sort((a,b)=> (b.time||"").localeCompare(a.time||""));
      state.scanLogsByEvent[eventId] = list;

      const ev = (data?.events||[]).find(x=>x.id===eventId);
      if(ev){
        ev.__scanLogs = list;
      }

      if(state.route==="analytics" || (state.route==="event" && state.activeEventId===eventId)){
        try{ renderAll(); }catch(e){ console.warn(e); }
      }
      if(state.route==="hub"){
        try{ renderHub(); }catch(e){ console.warn(e); }
      }
      if(state.route==="notifications"){
        try{ renderAttentionPage(); }catch(e){ console.warn(e); }
      }
    }, (err)=>{
      console.warn("[ScanLogs listener] failed:", err);
    });
    state.scanLogsUnsubs[eventId] = unsub;
  }catch(err){
    console.warn("[ScanLogs] could not attach listener", eventId, err);
  }
}

async function ensureInvitesListener(eventId){
  if(!window.__firebaseReady || typeof onSnapshot !== "function"){
    console.warn("[Invites] Firebase not ready; skipping realtime listener.");
    return;
  }

  if(state.invitesUnsubs?.[eventId]) return;
  try{
    const col = publicEventInvitesCol(eventId);
    const unsub = onSnapshot(col, (snap)=>{
      const list = snap.docs.map(d=> normalizeInviteDoc(d.id, d.data()));
      list.sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));
      state.invitesByEvent[eventId] = list;

      const ev = (data?.events||[]).find(x=>x.id===eventId);
      if(ev){
        refreshEventFromOrders(ev, state.ordersByEvent?.[eventId] || ev.orders || [], list);
      }

      if(state.route==="analytics" || (state.route==="event" && state.activeEventId===eventId)){
        try{ renderAll(); }catch(e){ console.warn(e); }
      }
      if(state.route==="hub"){
        try{ renderHub(); }catch(e){ console.warn(e); }
      }
      if(state.route==="notifications"){
        try{ renderAttentionPage(); }catch(e){ console.warn(e); }
      }
    }, (err)=>{
      console.warn("[Invites listener] failed:", err);
    });
    state.invitesUnsubs[eventId] = unsub;
  }catch(err){
    console.warn("[Invites] could not attach listener", eventId, err);
  }
}

function normalizeStoragePath(storagePath){
  if(!storagePath) return "";
  const trimmed = String(storagePath).trim();
  if(/^https?:\/\//i.test(trimmed) || /^gs:\/\//i.test(trimmed)) return trimmed;
  try{
    return decodeURIComponent(trimmed);
  }catch(_e){
    return trimmed;
  }
}

async function uploadDataUrlIfNeeded(dataUrl, storagePath){
  if(!dataUrl) return "";
  // already a URL
  if(/^https?:\/\//i.test(dataUrl)) return dataUrl;
  // only upload if it's a data URL
  if(!/^data:/i.test(dataUrl)) return dataUrl;

  if(!storage || !stRef){
    throw new Error("Storage not ready. Make sure Firebase Storage SDK is loaded.");
  }

  try{
    const blob = dataUrlToBlob(dataUrl);
    const contentType = blob.type || "image/jpeg";

    const normalizedPath = normalizeStoragePath(storagePath);
    const r = /^https?:\/\//i.test(normalizedPath) || /^gs:\/\//i.test(normalizedPath)
      ? refFromURL(normalizedPath)
      : stRef(storage, normalizedPath);
    await uploadBytes(r, blob, {
      contentType
    });
    return await getDownloadURL(r);
  }catch(err){
    console.error("[Storage upload failed]", {
      code: err?.code,
      message: err?.message,
      name: err?.name,
      customData: err?.customData,
      status: err?.status,
      serverResponse: err?.serverResponse,
      _raw: err
    });
    try{
      const anyResp =
        err?.customData?.serverResponse ||
        err?.serverResponse ||
        err?.customData?.response ||
        err?.response;
      if(anyResp) console.error("[Storage server response]", anyResp);
    }catch(_e){}
    throw err;
  }
}

function dataUrlToBlob(dataUrl){
  const parts = String(dataUrl).split(",");
  if(parts.length < 2){
    throw new Error("Invalid data URL");
  }
  const header = parts[0];
  const data = parts.slice(1).join(",");
  const isBase64 = /;base64/i.test(header);
  const mime = header.match(/^data:([^;]+)/i)?.[1] || "application/octet-stream";

  if(isBase64){
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++){
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  return new Blob([decodeURIComponent(data)], { type: mime });
}

// Sync one event to /events/{eventId} so customer.html can see it
async function syncEventToPublic(ev){
    if(!window.__firebaseReady) return;

  const uid = auth?.currentUser?.uid;
  if(!uid) throw new Error("Not signed in.");

  const eventId = ev?.id;
  if(!eventId) throw new Error("Event has no id.");

  // Map fields expected by customer.html
  const dateISO = ev.date || ev.dateISO || "";       // owner uses `date`
  const time = ev.time || "";
  const city = ev.city || ev.locationCity || "";     // optional
  const locationText = ev.locationText || ev.location || "";
  const locationUrl = ev.locationUrl || "";          // explicit URL (maps/website)

  // Design/branding (ticket + marketplace visuals)
  const d = ev.design || {};

  // Upload images if they are data URLs (from file picker previews)
  const bannerSource = d.bannerDataUrl || ev.bannerDataUrl || d.bannerUrl || ev.bannerUrl || "";
  const logoSource   = d.logoDataUrl   || ev.logoDataUrl   || d.logoUrl   || ev.logoUrl   || "";
  const bgSource     = d.bgDataUrl     || d.bgUrl          || "";

  const ownerLogoSource = d.ownerLogoDataUrl || ev.ownerLogoDataUrl || ev.ownerLogoUrl || "";

  const bannerUrl = await uploadDataUrlIfNeeded(
    bannerSource,
    `publicEvents/${eventId}/banner`
  );

  const logoUrl = await uploadDataUrlIfNeeded(
    logoSource,
    `publicEvents/${eventId}/logo`
  );

  const bgUrl = await uploadDataUrlIfNeeded(
    bgSource,
    `publicEvents/${eventId}/bg`
  );

  const ownerLogoUrl = await uploadDataUrlIfNeeded(
    ownerLogoSource,
    `publicEvents/${eventId}/ownerLogo`
  );

  // Keep local cache in sync (so we don't re-upload on every save)
  ev.bannerUrl = bannerUrl || ev.bannerUrl || "";
  ev.logoUrl = logoUrl || ev.logoUrl || "";
  if(!ev.design) ev.design = {};
  ev.design.bannerUrl = bannerUrl || ev.design.bannerUrl || "";
  ev.design.logoUrl = logoUrl || ev.design.logoUrl || "";
  ev.design.bgUrl = bgUrl || ev.design.bgUrl || "";
  ev.ownerLogoUrl = ownerLogoUrl || ev.ownerLogoUrl || "";

  const payload = {
    // visibility
    published: (ev.status || "Draft") !== "Draft",
    status: ev.status || "Draft",

    // basic info
    id: eventId,
    name: ev.name || "",
    dateISO,
    time,
    venue: ev.venue || "",
    description: ev.description || ev.desc || "",
    city,
    locationText,
    locationUrl,

    // visuals (marketplace)
    bannerUrl,
    logoUrl,
    ownerLogoUrl: ownerLogoUrl || ev.ownerLogoUrl || "",

    // details
    desc: ev.desc || ev.description || "",

    // design (ticket + email previews)
    design: {
      primary: d.primary || "#2563eb",
      accent: d.accent || "#16a34a",
      fontFamily: d.fontFamily || "Montserrat",
      textColor: d.textColor || "#0f172a",
      headline: d.headline || "Your ticket is ready",
      emailText: d.emailText || "",
      bannerUrl: bannerUrl || d.bannerUrl || "",
      logoUrl: logoUrl || d.logoUrl || "",
      bgUrl: bgUrl || d.bgUrl || "",
      updatedAt: serverTimestamp(),
    },

    // ticket structure
    tiers: Array.isArray(ev.tiers) ? ev.tiers.map(t=>({
      id: t.id,
      name: t.name || "",
      desc: t.desc || "",
      capacity: Number(t.baseCap||t.capacity||0),
      color: t.color || "#2563eb",
      inviteOnly: !!t.inviteOnly,
      rules: Array.isArray(t.rules) ? t.rules : (typeof t.rulesText==="string" ? t.rulesText.split(/\n+/).map(s=>s.trim()).filter(Boolean) : [])
    })) : [],
    waves: Array.isArray(ev.waves) ? ev.waves : [],

    // ownership / audit
    ownerId: uid,
    updatedAt: serverTimestamp(),
  };

  await setDoc(publicEventRef(eventId), payload, { merge: true });
}

async function syncStaffToFirestore(ev){
  if(!window.__firebaseReady || !db) return;
  const uid = auth?.currentUser?.uid;
  if(!uid || !ev?.id) return;

  const staffList = Array.isArray(ev.staff) ? ev.staff : [];
  const staffCol = publicEventStaffCol(ev.id);

  const snap = await getDocs(staffCol);
  const existingIds = new Set(snap.docs.map(d=>d.id));
  const desiredIds = new Set(staffList.map(s=>s.id));

  const ops = [];

  for(const s of staffList){
    const isUsher = s.role === "Usher";
    const gateId = isUsher ? (s.gate || "") : "";
    const gateName = isUsher ? gateNameFromId(ev, gateId) : "";
    const payload = {
      id: s.id,
      full: s.full || "",
      username: s.username || "",
      pin: s.pin || "",
      role: s.role || "",
      gate: gateId,
      gateName,
      disabled: !!s.disabled,
      events: Array.isArray(s.events) && s.events.length ? s.events : [ev.id],
      ownerId: uid,
      eventId: ev.id,
      updatedAt: serverTimestamp(),
    };
    ops.push(setDoc(doc(staffCol, s.id), payload, { merge: true }));
  }

  for(const id of existingIds){
    if(!desiredIds.has(id)){
      ops.push(deleteDoc(doc(staffCol, id)));
    }
  }

  await Promise.all(ops);
}


const $ = (q, el=document)=>el.querySelector(q);
const $$ = (q, el=document)=>Array.from(el.querySelectorAll(q));
const on = (sel, evt, fn)=>{
  const el = (typeof sel==="string") ? $(sel) : sel;
  if(!el) return null;
  el.__wired = el.__wired || {};
  const key = evt;
  if(el.__wired[key]) return el;
  el.__wired[key] = true;
  el.addEventListener(evt, fn);
  return el;
};
// Make helpers available to non-module scripts too
window.$ = $; window.$$ = $$;

function safeParseJSON(str, fallback){
  try{ return JSON.parse(str); }catch(e){ return fallback; }
}
window.safeParseJSON = safeParseJSON;

const fmtEGP = n => `EGP ${Number(n||0).toLocaleString('en-US')}`;
const nowISO = () => new Date().toISOString();
const pad2 = n => String(n).padStart(2,'0');
const fmtTime = (d=new Date())=>{
  const hh = pad2(d.getHours()), mm = pad2(d.getMinutes());
  const dd = pad2(d.getDate()), mo = pad2(d.getMonth()+1), yy = d.getFullYear();
  return `${yy}-${mo}-${dd} • ${hh}:${mm}`;
};
const uid = (p="") => p + Math.random().toString(16).slice(2,10).toUpperCase();
const uid8 = (p="") => uid(p);

const slugId = (...parts)=>{
  const raw = parts.filter(Boolean).join(" ").toLowerCase().trim();
  const slug = raw
    .normalize("NFKD").replace(/[̀-ͯ]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/(^-|-$)/g,"")
    .slice(0,48) || "event";
  return slug;
};

const mapsLink = (q)=>{
  const qq = encodeURIComponent(q || "");
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return isiOS ? `http://maps.apple.com/?q=${qq}` : `https://www.google.com/maps/search/?api=1&query=${qq}`;
};
const clamp = (n,a,b)=>Math.max(a,Math.min(b,n));
const safe = s => (s ?? "").toString();

const STORAGE = {
  userKey: "luma_owner_user",  authKey: "luma_owner_auth",
  dataKey: "luma_owner_data_v1",
  navKey: "luma_owner_nav_v1",
}

function dataCacheKey(uid){
  const u = uid || "anon";
  return `${STORAGE.dataKey}:${u}`;
}
;

function navCacheKey(uid){
  const u = uid || "anon";
  return `${STORAGE.navKey}:${u}`;
}

function saveNavState(){
  const uid = auth?.currentUser?.uid;
  const payload = {
    route: state.route,
    activeEventId: state.activeEventId,
    activeTab: state.activeTab
  };
  localStorage.setItem(navCacheKey(uid), JSON.stringify(payload));
}

function loadNavState(uid){
  return safeParseJSON(localStorage.getItem(navCacheKey(uid)), null);
}

const ROLES = ["Usher","Manual Desk","Finance","Design","Viewer","Ops Manager"];

const embedMode = new URLSearchParams(location.search).get("embed") || "";

let state = {
  uiWired: false,
  user: null,
  viewAs: "Owner",        // Owner or Viewer (read-only)
  route: "hub",           // hub, workspace, notifications, analytics, settings, event
  activeEventId: null,
  activeTab: "overview",  // event workspace tab
  attentionFeed: [],
  simulateOn: false,
  designPreview: { mode:"mobile" },
  scanLogsByEvent: {},
  scanLogsUnsubs: {},
  invitesByEvent: {},
  invitesUnsubs: {},
  embedMode
};

/* ---------- Data ---------- */


function seedOrdersAndAttendees(ev){
  const names = ["Farid Elmekkawy","Mariam Salah","Omar Adel","Nour Ayman","Hassan Said","Laila Mostafa","Ahmed Saad","Hoda Yassin","Karim Hany","Menna Sherif","Aya Magdy","Tarek Samy","Nada Wael","Yara Mahmoud","Mostafa Ali","Sarah Hesham"];
  const phones = ["010","011","012","015"];
  const emailDomains = ["gmail.com","outlook.com","yahoo.com","company.com"];
  const rand = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;

  const orders = [];
  const attendees = [];
  let idx = 0;

  // create orders based on sold counts
  for(const w of ev.waves){
    const tierIds = w.tiersActive;
    for(const tId of tierIds){
      const sold = (w.sold && w.sold[tId]) ? w.sold[tId] : 0;
      if(sold<=0) continue;

      // split sold into orders of 1-4 qty
      let remaining = sold;
      while(remaining>0 && orders.length<260){
        const qty = clamp(rand(1,4), 1, remaining);
        remaining -= qty;

        const nm = names[(idx++) % names.length];
        const ph = phones[rand(0,phones.length-1)] + String(rand(10000000,99999999));
        const em = nm.toLowerCase().replace(/\s+/g,".") + "@" + emailDomains[rand(0,emailDomains.length-1)];
        const tierName = (ev.tiers.find(x=>x.id===tId)?.name) || tId;
        const amount = qty * (w.pricing[tId] || 0);
        const statusPick = Math.random()<0.04 ? "Refunded" : (Math.random()<0.03 ? "Cancelled" : "Paid");

        const stamp = new Date();
        stamp.setDate(stamp.getDate() - rand(0, 10));
        stamp.setHours(rand(10,23), rand(0,59), 0, 0);

        const orderId = uid("ORD-");
        orders.push({
          id: orderId,
          customer: nm,
          contact: { phone: ph, email: em },
          waveId: w.id,
          waveName: w.name,
          tiers: [{ tierId: tId, tierName, qty }],
          qty,
          amount,
          status: statusPick,
          timestamp: stamp.toISOString()
        });

        // create attendee rows per ticket
        for(let k=0;k<qty;k++){
          const ticketCode = uid("TKT-");
          attendees.push({
            id: ticketCode,
            name: nm,
            contact: { phone: ph, email: em },
            waveId: w.id,
            waveName: w.name,
            tierId: tId,
            tierName,
            status: "Not checked-in",
            checkinTime: "",
            gateId: "",
            gateName: "",
            orderId
          });
        }
      }
    }
  }

  // random check-ins if Live or Ended
  const shouldCheck = (ev.status==="Live" || ev.status==="Ended");
  if(shouldCheck){
    const count = Math.min(attendees.length, Math.floor(attendees.length * 0.55));
    for(let i=0;i<count;i++){
      const a = attendees[Math.floor(Math.random()*attendees.length)];
      if(a.status==="Checked-in") continue;
      const gate = ev.gates[Math.floor(Math.random()*ev.gates.length)];
      a.status = "Checked-in";
      a.checkinTime = new Date(Date.now() - Math.floor(Math.random()*2*3600*1000)).toISOString();
      a.gateId = gate?.id || "";
      a.gateName = gate?.name || "";
    }
  }

  ev.orders = orders;
  ev.attendees = attendees;
}

function seedInitialLogs(ev){
  // A few starter logs
  const gateA = ev.gates?.[0]?.name || "Gate A";
  ev.activity = ev.activity || [];
  ev.incidents = ev.incidents || [];

  const sampleActs = [
    {t: `Event workspace created`, meta:`${ev.name}`},
    {t: `Ticketing updated`, meta:`${ev.waves.length} wave(s) active`},
    {t: `Staff list updated`, meta:`${ev.staff.length} staff member(s)`},
  ];
  for(const s of sampleActs){
    ev.activity.unshift({ id: uid("LOG-"), time: new Date(Date.now()-Math.random()*2*86400000).toISOString(), text:s.t, meta:s.meta, type:"info" });
  }

  // Seed a few incidents for realism
  if(ev.status==="Live" || ev.status==="On Sale"){
    ev.incidents.unshift({
      id: uid("INC-"),
      time: new Date(Date.now()-Math.random()*3*3600*1000).toISOString(),
      gate: gateA,
      staff: ev.staff?.[0]?.username || "system",
      customer: "—",
      outcome: "Blocked duplicate attempt",
      notes: "Duplicate scan attempt blocked."
    });
  }
}

/* ---------- Persistence ---------- */


function defaultData(){
  // Production default: no sample events.
  return {
    version: 1,
    events: [],
    staff: [],
    settings: {},
    automations: []
  };
}

function ensureDataShape(raw){
  const base = defaultData();
  const d = raw && typeof raw === "object" ? raw : {};
  d.version = d.version || base.version;
  d.events = Array.isArray(d.events) ? d.events : [];
  d.staff = Array.isArray(d.staff) ? d.staff : [];
  d.settings = d.settings && typeof d.settings === "object" ? d.settings : {};
  d.automations = Array.isArray(d.automations) ? d.automations : [];
  return d;
}

async function loadData(){
  // Production-only: load from Firestore (owners/{uid}) with local cache fallback
  const uid = auth?.currentUser?.uid;
  const cached = localStorage.getItem(dataCacheKey(uid));
  const cachedData = cached ? safeParseJSON(cached, null) : null;
  if(uid && window.__firebaseReady && db && getDoc){
    const ref = ownerDocRef(uid);
    const snap = await getDoc(ref);
    if(snap.exists()){
      const d = snap.data()?.data;
      if(d){
        if(cachedData?.events?.length){
          const cachedById = new Map((cachedData.events || []).map(ev=>[ev.id, ev]));
          (d.events || []).forEach((ev)=>{
            const cachedEv = cachedById.get(ev.id);
            if(!cachedEv) return;
            ev.bannerDataUrl = ev.bannerDataUrl || cachedEv.bannerDataUrl || "";
            ev.logoDataUrl = ev.logoDataUrl || cachedEv.logoDataUrl || "";
            ev.ownerLogoDataUrl = ev.ownerLogoDataUrl || cachedEv.ownerLogoDataUrl || "";
            ev.design = ev.design || {};
            const cachedDesign = cachedEv.design || {};
            ev.design.bannerDataUrl = ev.design.bannerDataUrl || cachedDesign.bannerDataUrl || "";
            ev.design.logoDataUrl = ev.design.logoDataUrl || cachedDesign.logoDataUrl || "";
            ev.design.ownerLogoDataUrl = ev.design.ownerLogoDataUrl || cachedDesign.ownerLogoDataUrl || "";
            ev.design.bgDataUrl = ev.design.bgDataUrl || cachedDesign.bgDataUrl || "";
          });
        }
        // cache for faster loads / offline
        const shaped = ensureDataShape(d);
        localStorage.setItem(dataCacheKey(uid), JSON.stringify(shaped));
        return shaped;
      }
    }
    // First time: seed
    const seed = ensureDataShape(cachedData || defaultData());
    await setDoc(ref, { data: seed, updatedAt: serverTimestamp() }, { merge: true });
    localStorage.setItem(dataCacheKey(uid), JSON.stringify(seed));
    return seed;
  }

  // Not signed in: fallback to localStorage only
  if(cachedData) return ensureDataShape(cachedData);
  const seed = ensureDataShape(defaultData());
  localStorage.setItem(dataCacheKey(uid), JSON.stringify(seed));
  return seed;
}

function sanitizeDataForFirestore(raw){
  const clone = JSON.parse(JSON.stringify(raw || {}));
  const events = clone.events || [];
  for(const ev of events){
    if(!ev) continue;
    const design = ev.design || {};
    const stripDataUrl = (obj, key)=>{
      if(obj && typeof obj[key] === "string" && obj[key].startsWith("data:")){
        obj[key] = "";
      }
    };
    ["bannerDataUrl","logoDataUrl","ownerLogoDataUrl"].forEach(k=> stripDataUrl(ev, k));
    ["bannerDataUrl","logoDataUrl","ownerLogoDataUrl","bgDataUrl"].forEach(k=> stripDataUrl(design, k));
    ev.design = design;
  }
  return clone;
}

let __saveTimer = null;
function saveData(){
  // Debounced save (keeps UI snappy)
  clearTimeout(__saveTimer);
  __saveTimer = setTimeout(async ()=>{
    try{
      const payload = JSON.stringify(data);
      const uid = auth?.currentUser?.uid;
      localStorage.setItem(dataCacheKey(uid), payload);

      if(uid && window.__firebaseReady && setDoc){
        const sanitized = sanitizeDataForFirestore(data);
        await setDoc(ownerDocRef(uid), { data: sanitized, updatedAt: serverTimestamp() }, { merge: true });
      }
    }catch(err){
      console.error(err);
      toast("Save failed", "Could not sync changes right now. Your browser still cached your data.");
    }
  }, 250);
}

let data = defaultData();

/* ---------- Auto sync to Public Events (Customer Marketplace) ---------- */
/**
 * This dashboard has TWO data layers:
 *  1) Owner workspace data (saved in owners/{uid}/apps/...)
 *  2) Public event doc (events/{eventId}) that customer.html reads.
 *
 * If you update an event and don't publish/sync, customers won't see changes.
 * This auto-sync marks events dirty on workspace edits and pushes updates in a debounce.
 */
const __publicSyncTimers = new Map();

function __isPublicSyncEnabled(){
  return window.__firebaseReady;
}

function markEventDirtyForPublic(ev){
  if(!ev) return;
  ev.__publicDirty = true;
}

function schedulePublicSync(ev, reason="edit"){
  if(!ev) return;
  if(isReadOnly()) return;
  if(!__isPublicSyncEnabled()) return;

  markEventDirtyForPublic(ev);

  const key = ev.id;
  clearTimeout(__publicSyncTimers.get(key));
  __publicSyncTimers.set(key, setTimeout(async ()=>{
    try{
      // only sync if still dirty
      const events = Array.isArray(data?.events) ? data.events : [];
      const cur = events.find(x=>x.id===key);
      if(!cur || !cur.__publicDirty) return;
      cur.__publicDirty = false;
      await syncEventToPublic(cur);
      // also ensure status mirrors (cheap merge)
      try{
        await updateDoc(publicEventRef(cur.id), { status: cur.status || "Draft" });
      }catch(_e){ /* ignore merge failures; syncEventToPublic is primary */ }
    }catch(err){
      console.error("Public sync failed", err);
      // keep dirty so we can retry on next change
      const events = Array.isArray(data?.events) ? data.events : [];
      const cur = events.find(x=>x.id===key);
      if(cur) cur.__publicDirty = true;
      toast("Sync warning", "Saved locally, but could not publish to customer marketplace yet.");
    }
  }, 700));
}

// Mark dirty on any change inside Event Workspace
document.addEventListener("input", (e)=>{
  const ev = currentEvent();
  if(!ev) return;
  if(!e.target) return;
  if(!(e.target.closest && e.target.closest("#page-event"))) return;
  markEventDirtyForPublic(ev);
  schedulePublicSync(ev, "input");
}, true);

document.addEventListener("change", (e)=>{
  const ev = currentEvent();
  if(!ev) return;
  if(!e.target) return;
  if(!(e.target.closest && e.target.closest("#page-event"))) return;
  // status select has its own handler that already syncs immediately
  if(e.target.id==="ovStatusSelectTop" || e.target.id==="ovStatusSelectOverview") return;
  markEventDirtyForPublic(ev);
  schedulePublicSync(ev, "change");
}, true);

/* ---------- End auto sync ---------- */


/* ---------- Auth ---------- */

function loadAuth(){
  try{
    const auth = JSON.parse(localStorage.getItem(STORAGE.authKey) || "null");
    if(auth && auth.email){
      const user = JSON.parse(localStorage.getItem(STORAGE.userKey) || "null");
      if(user && user.email === auth.email){
        state.user = user;
        state.viewAs = auth.viewAs || "Owner";
        return true;
      }
    }
  }catch(e){}
  return false;
}
function saveAuth(){
  localStorage.setItem(STORAGE.userKey, JSON.stringify(state.user));
  localStorage.setItem(STORAGE.authKey, JSON.stringify({ email: state.user.email, viewAs: state.viewAs }));
}

function waitForAuthReady(){
  if(!window.__firebaseReady || !auth || !onAuthStateChanged){
    return Promise.resolve(null);
  }
  return new Promise((resolve)=>{
    const unsub = onAuthStateChanged(auth, (user)=>{
      try{ unsub(); }catch(_e){}
      resolve(user || null);
    });
  });
}

async function ensureAuthListener(){
  if(__authListenerBound || !window.__firebaseReady || !auth || !onAuthStateChanged) return;
  __authListenerBound = true;
  onAuthStateChanged(auth, async (user)=>{
    if(user){
      const uid = user.uid;
      const shouldReload = !state.__booted || state.__bootedUid !== uid;
      state.user = { name: user.displayName || "Owner", email: user.email || "" };
      state.viewAs = "Owner";
      saveAuth();
      await bootDashboard({ force: shouldReload });
    }else{
      state.user = null;
      state.__booted = false;
      state.__bootedUid = null;
      document.getElementById("dash")?.classList.add("hidden");
      document.getElementById("auth")?.classList.remove("hidden");
    }
  });
}

async function appSignOut(){
  try{
    await fbSignOut(auth);
  }catch(_e){}
  localStorage.removeItem(STORAGE.authKey);
  state.user = null;
  state.__booted = false;
  state.activeEventId = null;
  state.route = "hub";
  state.activeTab = "overview";
  // reset local UI state only (no-op placeholder removed)
  document.getElementById("dash")?.classList.add("hidden");
  document.getElementById("auth")?.classList.remove("hidden");
  document.getElementById("menuPanel")?.classList.remove("open");
  toast("Signed out", "You’re now signed out of the dashboard.");
}


function setAuthTab(tab){
  const activeTab = tab === "forgot" ? "signin" : tab;
  $$(".tabBtn").forEach(b=>b.classList.toggle("active", b.dataset.authTab===activeTab));
  document.getElementById("auth-signin")?.classList.toggle("hidden", tab!=="signin");
  document.getElementById("auth-signup")?.classList.toggle("hidden", tab!=="signup");
  document.getElementById("auth-forgot")?.classList.toggle("hidden", tab!=="forgot");
}

function authInit(){
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  applyLumaLogo();
  initTheme();

  $$(".tabBtn").forEach(b =>
    b.addEventListener("click", () => setAuthTab(b.dataset.authTab))
  );
  $("#btnAuthSignup")?.addEventListener("click", (e)=>{
    e.preventDefault();
    setAuthTab("signup");
    $("#signup-name")?.focus();
  });

  $("#go-signin")?.addEventListener("click", (e)=>{
    e.preventDefault();
    setAuthTab("signin");
  });

  $("#go-signin2")?.addEventListener("click", (e)=>{
    e.preventDefault();
    setAuthTab("signin");
  });

  $("#go-signup")?.addEventListener("click", (e)=>{
    e.preventDefault();
    setAuthTab("signup");
  });

  $("#btnForgot")?.addEventListener("click", (e)=>{
    e.preventDefault();
    setAuthTab("forgot");
    const email = $("#signin-email")?.value?.trim();
    if(email) $("#forgot-email").value = email;
    $("#forgot-email")?.focus();
  });

  $$("[data-auth-link]").forEach((btn)=>{
    if(btn.__authWired) return;
    btn.__authWired = true;
    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      const tab = btn.dataset.authLink;
      if(tab) setAuthTab(tab);
    });
  });

  renderFooterLinks();
  if(!state.__hashWired){
    window.addEventListener("hashchange", __applyHash);
    state.__hashWired = true;
  }
}

function applyLumaLogo(){
  const imgs = [$("#lumaLogoImgAuth"), $("#lumaLogoImgDash")];
  const svgs = [$("#lumaLogoSvgAuth"), $("#lumaLogoSvgDash")];
  document.body.classList.toggle("hasLumaLogo", !!LUMA_LOGO_URL);
  document.documentElement.style.setProperty(
    "--luma-logo-url",
    LUMA_LOGO_URL ? `url("${LUMA_LOGO_URL}")` : "none"
  );
  imgs.forEach(img=>{
    if(!img) return;
    if(LUMA_LOGO_URL){
      img.src = LUMA_LOGO_URL;
      img.style.display = "block";
    }else{
      img.removeAttribute("src");
      img.style.display = "none";
    }
  });
  svgs.forEach(svg=>{
    if(!svg) return;
    svg.style.display = LUMA_LOGO_URL ? "none" : "block";
  });
}

const THEME_KEY = "luma_theme";
function applyTheme(mode){
  const theme = mode === "dark" ? "dark" : "light";
  document.body.classList.toggle("dark", theme === "dark");
  localStorage.setItem(THEME_KEY, theme);
  const select = $("#themeSelect");
  if(select) select.value = theme;
}
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  applyTheme(theme);
  const select = $("#themeSelect");
  if(select && !select.__themeWired){
    select.__themeWired = true;
    select.addEventListener("change", ()=> applyTheme(select.value));
  }
}

const LEGAL_PAGES = {
  about: {
    title: "About Luma Tickets",
    body: `
      <p>Luma Tickets is an event operations platform designed for organizers who need clarity, control, and reliability.</p>
      <p><b>Mission:</b> Between ideas and impact.</p>
      <p>The dashboard helps event owners create events, sell tickets, manage capacities, track performance, and control on-site check-ins — all in one workspace.</p>
      <p>From ticket tiers and waves to real-time sales tracking and access validation, Luma Tickets equips organizers to run secure events at scale.</p>
      <p>Luma Tickets does not run events — it empowers the teams who do.</p>
    `
  },
  faqs: {
    title: "Frequently Asked Questions",
    body: `
      <h4>What does Luma Tickets provide for event owners?</h4>
      <p>Luma Tickets provides:</p>
      <ul>
        <li>Event creation and management tools</li>
        <li>Ticket tiers, waves, pricing, and capacity controls</li>
        <li>Real-time sales and check-in tracking</li>
        <li>Secure digital ticket validation</li>
        <li>Organizer and usher access controls</li>
        <li>Analytics to monitor performance</li>
      </ul>
      <h4>Does Luma Tickets run my event operations?</h4>
      <p>No. Luma Tickets provides the platform and tools. The event owner remains responsible for event execution, staffing, venue coordination, and guest experience.</p>
      <h4>Can I manage multiple events?</h4>
      <p>Yes. Owners can manage multiple events from a single dashboard.</p>
      <h4>Can I limit ticket quantities per tier or wave?</h4>
      <p>Yes. You control ticket capacities at all levels and can adjust them before or during sales.</p>
      <h4>Can tickets be duplicated or reused?</h4>
      <p>No. Once a ticket is checked in, it becomes invalid. Duplicate or manipulated tickets will be rejected.</p>
    `
  },
  terms: {
    title: "Terms of Service",
    body: `
      <p>By using Luma Tickets, you agree to provide accurate event information, manage ticket access responsibly, and follow applicable laws and venue policies.</p>
      <p>As an event owner, you are responsible for:</p>
      <ul>
        <li>All content you publish</li>
        <li>Event safety and on-site operations</li>
        <li>Payments, taxes, and compliance</li>
        <li>Customer support and refunds</li>
      </ul>
      <p>Luma Tickets reserves the right to suspend accounts for misuse, fraud, or policy violations.</p>
    `
  },
  privacy: {
    title: "Privacy Policy",
    body: `
      <p>Luma Tickets stores owner data securely and uses it only to provide product functionality, analytics, and system improvements.</p>
      <p>We do not sell your data to third parties. Access to attendee information is limited to you and authorized staff.</p>
      <p>We apply industry-standard security practices to protect credentials and sensitive data.</p>
    `
  }
};

function openLegalModal(key){
  const page = LEGAL_PAGES[key];
  if(!page) return;
  openModal({
    title: page.title,
    desc: "",
    bodyHtml: `<div class="legalContent">${page.body}</div>`,
    footButtons: [{ label: "Close", kind: "primary", onClick: closeModal }]
  });
}

function renderFooterLinks(){
  const links = [
    { key: "about", label: "About Us" },
    { key: "faqs", label: "FAQs" },
    { key: "privacy", label: "Privacy Policy" },
    { key: "terms", label: "Terms of Service" }
  ];
  const stripPhoneNumbers = (footer)=>{
    const phonePattern = /(\+?\d[\d\s().-]{6,}\d)/g;
    footer.querySelectorAll('a[href^="tel:"]').forEach(link=> link.remove());
    const walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while(walker.nextNode()){
      textNodes.push(walker.currentNode);
    }
    textNodes.forEach(node=>{
      if(!node.textContent) return;
      node.textContent = node.textContent.replace(phonePattern, "");
    });
  };
  document.querySelectorAll(".footer").forEach(footer=>{
    if(footer.querySelector(".footerLinks")) return;
    const wrap = document.createElement("div");
    wrap.className = "footerLinks";
    wrap.innerHTML = links.map(l => `<a href="#legal:${l.key}" data-legal="${l.key}">${l.label}</a>`).join("");
    footer.appendChild(wrap);
    stripPhoneNumbers(footer);
  });
  document.querySelectorAll("[data-legal]").forEach(link=>{
    if(link.__legalWired) return;
    link.__legalWired = true;
    link.addEventListener("click", (e)=>{
      e.preventDefault();
      const key = link.dataset.legal;
      if(!key) return;
      const nextHash = `legal:${key}`;
      if(location.hash !== `#${nextHash}`) location.hash = nextHash;
      openLegalModal(key);
    });
  });
}

  // Signup
  $("#form-signup")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!window.__firebaseReady || !auth){
      toast("Firebase unavailable", "Auth is offline. Please check your connection and reload.");
      return;
    }
    const name = $("#signup-name").value.trim();
    const email = $("#signup-email").value.trim().toLowerCase();
    const pass = $("#signup-pass").value;

    if(!email || !pass){
      toast("Missing info", "Please enter your email and password.");
      return;
    }
    try{
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if(name) await updateProfile(cred.user, { displayName: name });
      state.user = { name: cred.user.displayName || name || "Owner", email: cred.user.email };
      state.viewAs = "Owner";
      saveAuth();
      toast("Account created", "Welcome! Loading your Events Hub...");
      await bootDashboard();
    }catch(err){
      toast("Signup failed", niceAuthError(err));
    }
  });

  // Signin
  $("#form-signin")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!window.__firebaseReady || !auth){
      toast("Firebase unavailable", "Auth is offline. Please check your connection and reload.");
      return;
    }
    const email = $("#signin-email").value.trim().toLowerCase();
    const pass = $("#signin-pass").value;

    if(!email || !pass){
      toast("Missing info", "Please enter your email and password.");
      return;
    }
    try{
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      state.user = { name: cred.user.displayName || "Owner", email: cred.user.email };
      state.viewAs = "Owner";
      saveAuth();
      toast("Signed in", "Loading your Events Hub...");
      await bootDashboard();
    }catch(err){
      toast("Sign in failed", niceAuthError(err));
    }
  });

  // Forgot password
  $("#form-forgot")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    if(!window.__firebaseReady || !auth){
      toast("Firebase unavailable", "Auth is offline. Please check your connection and reload.");
      return;
    }
    const email = $("#forgot-email").value.trim().toLowerCase();
    if(!email){
      toast("Missing email", "Type your email first.");
      return;
    }
    try{
      await sendPasswordResetEmail(auth, email);
      toast("Reset link sent", `Check your inbox for ${email}.`);
      setAuthTab("signin");
      $("#signin-email").value = email;
    }catch(err){
      toast("Reset failed", niceAuthError(err));
    }
  });
  

  // Firebase auth session restore
  // Bound in start() after Firebase init to avoid missing the listener.


/* ---------- UI helpers ---------- */

function niceAuthError(err){
  const code = (err && err.code) ? String(err.code) : "";
  if(code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) return "Wrong email or password.";
  if(code.includes("auth/user-not-found")) return "No account found for this email.";
  if(code.includes("auth/email-already-in-use")) return "This email is already registered.";
  if(code.includes("auth/weak-password")) return "Password is too weak (min 6 characters).";
  if(code.includes("auth/invalid-email")) return "Invalid email address.";
  if(code.includes("auth/network-request-failed")) return "Network error. Check your internet connection.";
  return (err && err.message) ? err.message : "Something went wrong. Please try again.";
}



function toast(title, msg){
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <div>
      <b>${escapeHtml(title)}</b>
      <p>${escapeHtml(msg)}</p>
    </div>
    <button class="x" title="Close"><svg width="18" height="18"><use href="#i-close"/></svg></button>
  `;
  el.querySelector(".x").addEventListener("click", ()=> el.remove());
  const wrap = $("#toasts") || (()=>{
    const w = document.createElement("div");
    w.id = "toasts";
    w.className = "toasts";
    document.body.appendChild(w);
    return w;
  })();
  wrap.appendChild(el);
  setTimeout(()=>{ if(el.isConnected) el.remove(); }, 5200);
}
function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function confirmModal({title, desc, danger=false, actionLabel="Confirm", onConfirm}){
  openModal({
    title,
    desc,
    bodyHtml: `<div class="hint">${escapeHtml(desc || "Are you sure?")}</div>`,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label: actionLabel, kind: danger ? "danger" : "primary", onClick: ()=>{ closeModal(); onConfirm?.(); }}
    ]
  });
}

/* ---------- Modal / Drawer ---------- */

function openModal({title, desc, bodyHtml, footButtons=[]}){
  $("#modalTitle").textContent = title || "Modal";
  $("#modalDesc").textContent = desc || "";
  $("#modalBody").innerHTML = bodyHtml || "";
  const foot = $("#modalFoot"); foot.innerHTML = "";
  for(const b of footButtons){
    const btn = document.createElement("button");
    btn.className = `btn ${b.size==="sm" ? "sm" : ""} ${b.kind||""}`.trim();
    btn.textContent = b.label || "OK";
    if(b.icon){
      btn.innerHTML = `${b.icon} ${escapeHtml(b.label || "")}`;
    }
    btn.addEventListener("click", b.onClick || closeModal);
    foot.appendChild(btn);
  }
  document.getElementById("modalOverlay")?.classList.add("open");
}
function closeModal(){ document.getElementById("modalOverlay")?.classList.remove("open"); }

function openDrawer(title, sub, bodyHtml){
  $("#drawerTitle").textContent = title || "Details";
  $("#drawerSub").textContent = sub || "";
  $("#drawerBody").innerHTML = bodyHtml || "";
  document.getElementById("drawerOverlay")?.classList.add("open");
}
function closeDrawer(){ document.getElementById("drawerOverlay")?.classList.remove("open"); }



/* ---------- Activity helper ---------- */
function addActivity(ev, text, detail, type){
  if(!ev) return;
  if(!Array.isArray(ev.activity)) ev.activity = [];
  ev.activity.unshift({
    text: String(text||""),
    detail: String(detail||""),
    type: type || "info",
    time: Date.now()
  });
  // cap to keep the doc light
  if(ev.activity.length>200) ev.activity.length = 200;

  // Keep a small "needs attention" list derived from warn/danger types (optional)
  if(type==="warn" || type==="danger"){
    if(!Array.isArray(ev.attention)) ev.attention = [];
    ev.attention.unshift({
      text: String(text||""),
      detail: String(detail||""),
      type: type,
      time: Date.now()
    });
    if(ev.attention.length>100) ev.attention.length = 100;
  }
}
/* ---------- Routing ---------- */


// Hash routing (Gmail-style URLs):
//   #hub
//   #event:<eventId>?tab=orders
//   #notifications , #analytics
//   #legal:<page>
function __parseHash(){
  const raw = (location.hash||"").replace(/^#/, "").trim();
  if(!raw) return { route: null };
  const [path, qs=""] = raw.split("?");
  const params = new URLSearchParams(qs);
  if(path.startsWith("event:")){
    return { route:"event", eventId: path.slice(6), tab: params.get("tab")||null };
  }
  if(path.startsWith("legal:")){
    return { route:"legal", legal: path.slice(6) };
  }
  if(path==="hub"||path==="workspace"||path==="notifications"||path==="analytics"||path==="hub"){
    return { route:path, tab: params.get("tab")||null };
  }
  return { route: null };
}
function __setHash(route){
  // Avoid loops while handling hashchange
  if(state.__hashLock) return;
  let h = "";
  if(route==="event" && state.activeEventId){
    h = `event:${state.activeEventId}`;
    if(state.activeTab) h += `?tab=${encodeURIComponent(state.activeTab)}`;
  }else if(route){
    h = route;
  }
  const next = "#"+h;
  if(location.hash !== next) {
    state.__hashLock = true;
    location.hash = h;
    setTimeout(()=>{ state.__hashLock = false; }, 0);
  }
}
function __applyHash(){
  const h = __parseHash();
  if(!h.route) return;
  if(h.route === "legal" && h.legal){
    openLegalModal(h.legal);
    return;
  }
  if(h.route==="event" && h.eventId){
    state.activeEventId = h.eventId;
    if(h.tab) state.activeTab = h.tab;
    setRoute("event", { noHash:true });
    // If event id isn't loaded yet, renderAll() will handle once data is ready.
  }else{
    if(h.tab) state.activeTab = h.tab;
    setRoute(h.route, { noHash:true });
  }
}

function setRoute(route, opts={}){
  if(!opts.noHash) __setHash(route);
  state.route = route;
  // sidebar active
  $$(".navItem").forEach(x=>x.classList.toggle("active", x.dataset.route===route));
  // pages
  document.getElementById("page-hub")?.classList.toggle("hidden", route!=="hub");
  document.getElementById("page-workspace")?.classList.toggle("hidden", route!=="workspace");
  document.getElementById("page-notifications")?.classList.toggle("hidden", route!=="notifications");
  document.getElementById("page-analytics")?.classList.toggle("hidden", route!=="analytics");
  document.getElementById("page-settings")?.classList.toggle("hidden", route!=="settings");
    document.getElementById("page-event")?.classList.toggle("hidden", route!=="event");

  $("#sideSubtitle").textContent =
    route==="hub" ? "Events Hub" :
    route==="workspace" ? "Workspace" :
    route==="notifications" ? "Attention" :
    route==="analytics" ? "Analytics" :
    route==="settings" ? "Settings" :
        route==="event" ? "Event Workspace" : "Dashboard";

  const crumb =
    route==="hub" ? `You are in <b>Events Hub</b>` :
    route==="workspace" ? `Select an event to open its <b>Workspace</b>` :
    route==="notifications" ? `You are in <b>What needs attention</b>` :
    route==="analytics" ? `You are in <b>Analytics</b>` :
    route==="settings" ? `You are in <b>Settings</b>` :
        route==="event" ? `You are in <b>Event Workspace</b>` : `Dashboard`;
  $("#crumb").innerHTML = crumb;

  if(route==="analytics") renderAllAnalytics();
    if(route==="notifications") renderAttentionPage();
  if(route==="settings") renderTopIdentity();
  if(route==="workspace") renderWorkspacePicker();
  if(route==="hub") renderHub();
  renderSearchResults();

  saveNavState();
}

/* ---------- Access control ---------- */

function isReadOnly(){
  return state.viewAs === "Viewer";
}
function lockIfReadOnly(buttonEl){
  if(!buttonEl) return;
  const ro = isReadOnly();
  buttonEl.disabled = ro;
  if(ro) buttonEl.title = "Viewer mode is read-only";
}

/* ---------- Core render ---------- */

function currentEvent(){
  const events = Array.isArray(data?.events) ? data.events : [];
  return events.find(e=>e.id===state.activeEventId) || null;
}
function eventSold(ev){
  return ev.orders.filter(o=>o.status==="Paid").reduce((s,o)=>s+o.qty,0);
}
function eventCheckins(ev){
  return ev.attendees.filter(a=>a.status==="Checked-in").length;
}
function eventGross(ev){
  return ev.orders.filter(o=>o.status==="Paid" || o.status==="Refunded").reduce((s,o)=>s+o.amount,0);
}
function eventRefunds(ev){
  return ev.orders.filter(o=>o.status==="Refunded").reduce((s,o)=>s+o.amount,0);
}
function eventNet(ev){
  return eventGross(ev) - eventRefunds(ev);
}
function getIncidentFeed(ev){
  const scanLogs = state.scanLogsByEvent?.[ev.id] || ev.__scanLogs || [];
  const manual = (ev.incidents || []).filter(i=>i.source !== "scanLog");
  const merged = [...scanLogs, ...manual];
  merged.sort((a,b)=> (b.time||"").localeCompare(a.time||""));
  return merged;
}
function eventFraud(ev){
  return getIncidentFeed(ev).filter(i=>String(i.outcome||"").toLowerCase().includes("blocked")).length;
}
function eventDenied(ev){
  return getIncidentFeed(ev).filter(i=>String(i.outcome||"").toLowerCase().includes("denied")).length;
}

function tierSalesMap(ev){
  const sales = {};
  for(const o of (ev.orders || [])){
    if(o.status !== "Paid") continue;
    const items = (o.tiers && o.tiers.length)
      ? o.tiers
      : (o.tierId ? [{ tierId:o.tierId, qty:o.qty || 1, tierName:o.tierName || "" }] : []);
    for(const it of items){
      const tid = it.tierId;
      if(!tid) continue;
      sales[tid] = (sales[tid] || 0) + (Number(it.qty) || 1);
    }
  }
  return sales;
}

function waveSalesMap(ev){
  const sales = {};
  for(const w of (ev.waves || [])){
    sales[w.id] = {};
  }
  for(const o of (ev.orders || [])){
    if(o.status !== "Paid") continue;
    const items = (o.tiers && o.tiers.length)
      ? o.tiers
      : (o.tierId ? [{ tierId:o.tierId, qty:o.qty || 1, tierName:o.tierName || "" }] : []);
    for(const it of items){
      const tid = it.tierId;
      if(!tid || !o.waveId) continue;
      if(!sales[o.waveId]) sales[o.waveId] = {};
      sales[o.waveId][tid] = (sales[o.waveId][tid] || 0) + (Number(it.qty) || 1);
    }
  }
  return sales;
}

function enrichOrdersForEvent(ev, orders){
  const tierById = Object.fromEntries((ev.tiers || []).map(t=>[t.id, t]));
  const waveById = Object.fromEntries((ev.waves || []).map(w=>[w.id, w]));

  return (orders || []).map(o=>{
    const rawItems = (o.tiers && o.tiers.length)
      ? o.tiers
      : (o.tierId ? [{ tierId:o.tierId, tierName:o.tierName || "", qty:o.qty || 1 }] : []);
    const tiers = rawItems.map(it=>{
      const tid = it.tierId || "";
      return {
        tierId: tid,
        tierName: it.tierName || tierById[tid]?.name || tid || "—",
        qty: Number(it.qty || 1) || 1
      };
    });
    const qtyFromTiers = tiers.reduce((s,it)=>s+it.qty,0);
    const qty = (Number(o.qty) && Number(o.qty) >= qtyFromTiers) ? Number(o.qty) : (qtyFromTiers || 1);
    return {
      ...o,
      qty,
      tiers,
      tierName: o.tierName || tiers[0]?.tierName || "",
      waveName: o.waveName || waveById[o.waveId]?.name || o.waveId || ""
    };
  });
}

function refreshEventFromOrders(ev, orders, invites=null){
  if(!ev) return;
  const enriched = enrichOrdersForEvent(ev, orders || ev.orders || []);
  ev.orders = enriched;

  const salesByWave = waveSalesMap(ev);
  for(const w of (ev.waves || [])){
    const sold = salesByWave[w.id] || {};
    w.sold = w.sold || {};
    for(const tid of (w.tiersActive || [])){
      w.sold[tid] = sold[tid] || 0;
    }
  }

  const existing = new Map((ev.attendees || []).map(a=>[a.id, a]));
  const attendees = [];
  for(const o of enriched){
    const name = o.customer || "—";
    const contact = o.contact || {};
    const items = (o.tiers && o.tiers.length) ? o.tiers : (o.tierId ? [{ tierId:o.tierId, tierName:o.tierName || "", qty:o.qty || 1 }] : []);
    const checkedIn = !!(o.checkedIn || o.checkedInAt);
    const checkedInTicketId = o.checkedInTicketId || o.ticketId || "";
    const checkinTime = o.checkedInAt?.toDate?.() || (typeof o.checkedInAt === "string" ? new Date(o.checkedInAt) : null);
    const checkinIso = (checkinTime && !isNaN(checkinTime.getTime())) ? checkinTime.toISOString() : "";
    const totalQty = items.reduce((s,it)=>s+(Number(it.qty)||0),0);
    const applyOrderCheckin = checkedIn && totalQty <= 1;
    for(const it of items){
      for(let i=0;i<(Number(it.qty)||1);i++){
        const id = o.ticketId || `${o.id}-${it.tierId || "tier"}-${i+1}`;
        const prev = existing.get(id);
        const matchesTicket = checkedInTicketId && checkedInTicketId === id;
        const shouldCheckIn = applyOrderCheckin || matchesTicket;
        attendees.push({
          id,
          name,
          contact,
          waveId: o.waveId || "",
          waveName: o.waveName || "",
          tierId: it.tierId || "",
          tierName: it.tierName || "",
          status: shouldCheckIn ? "Checked-in" : (prev?.status || "Not checked-in"),
          checkinTime: shouldCheckIn ? (checkinIso || (typeof o.checkedInAt === "string" ? o.checkedInAt : "")) : (prev?.checkinTime || ""),
          gateId: shouldCheckIn ? (o.checkedInGate || prev?.gateId || "") : (prev?.gateId || ""),
          gateName: shouldCheckIn ? (o.checkedInGate || prev?.gateName || "") : (prev?.gateName || ""),
          orderId: o.id || o.orderId || ""
        });
      }
    }
  }
  const inviteList = Array.isArray(invites) ? invites : (state.invitesByEvent?.[ev.id] || []);
  for(const inv of inviteList){
    const inviteId = `invite:${inv.inviteToken || inv.id}`;
    if(existing.has(inviteId)) continue;
    const tierName = ev.tiers.find(t=>t.id===inv.tierId)?.name || inv.tierId || "—";
    const checkedIn = !!(inv.checkinAt || inv.status==="Checked-in");
    attendees.push({
      id: inviteId,
      inviteToken: inv.inviteToken || inv.id || "",
      name: inv.name || "—",
      contact: inv.contact || {},
      waveId: "invite",
      waveName: "Invite",
      tierId: inv.tierId || "",
      tierName,
      status: checkedIn ? "Checked-in" : "Not checked-in",
      checkinTime: checkedIn ? (inv.checkinAt || "") : "",
      gateId: "",
      gateName: checkedIn ? (inv.checkinGate || "") : "",
      orderId: ""
    });
  }
  ev.attendees = attendees;
}

function statusBadgeClass(s){
  if(s==="Live") return "ok";
  if(s==="On Sale") return "info";
  if(s==="Draft") return "warn";
  if(s==="Ended") return "danger";
  return "";
}
function statusText(s){ return s || "Draft"; }


function normalizeEventStatus(ev){
  // Auto-end after the event date passes (based on device local date in YYYY-MM-DD)
  try{
    const today = new Date();
    const yy = today.getFullYear();
    const mo = String(today.getMonth()+1).padStart(2,"0");
    const dd = String(today.getDate()).padStart(2,"0");
    const t = `${yy}-${mo}-${dd}`;
    if(ev.date && ev.date < t && ev.status !== "Ended"){
      ev.status = "Ended";
      addActivity(ev, "Event ended", "Auto-ended after event date.", "info");
    }
  }catch(_){}
}

function initials(name){
  const parts = (name||"").trim().split(/\s+/).filter(Boolean);
  if(parts.length===0) return "LU";
  const a = parts[0][0] || "L";
  const b = (parts[1]?.[0]) || (parts[0][1] || "U");
  return (a+b).toUpperCase();
}

function renderAll(){
  renderTopIdentity();
  renderHub();
  renderWorkspacePicker();
  renderAttentionPage();
  renderAllAnalytics();
  if(state.route==="event") renderEventWorkspace();
  renderSearchResults();
}

// Backwards-compatible alias (some flows call render())
function render(){
  renderAll();
}

function renderTopIdentity(){
  const nm = state.user?.name || "Owner";
  const em = state.user?.email || "—";
  $("#avaName").textContent = nm;
  $("#avaEmail").textContent = em;
  $("#menuName").textContent = nm;
  $("#menuEmail").textContent = em;
  $("#avaInitials").textContent = initials(nm);
  $("#avaInitials2").textContent = initials(nm);
  $("#menuPlan").textContent = state.viewAs==="Viewer" ? "Viewer" : "Owner";
  $("#roleBadge").className = "badge " + (state.viewAs==="Viewer" ? "warn" : "info");
  $("#roleBadge").innerHTML = state.viewAs==="Viewer" ? "<strong>Viewer</strong> read-only" : "<strong>Owner</strong> access";
  $("#pfMini").textContent = state.viewAs==="Viewer" ? "Viewer" : "Owner";
  $("#viewAs").value = state.viewAs;
  const settingsName = $("#settingsName");
  const settingsEmail = $("#settingsEmail");
  const settingsRole = $("#settingsRole");
  if(settingsName) settingsName.value = nm;
  if(settingsEmail) settingsEmail.value = em;
  if(settingsRole) settingsRole.textContent = state.viewAs === "Viewer" ? "Viewer" : "Owner";
}

function renderHub(){
  const events = Array.isArray(data?.events) ? data.events : [];
  $("#hubCount").textContent = events.length;
  const status = $("#hubStatus").value;
  const venue = $("#hubVenue").value.trim().toLowerCase();
  const dFrom = $("#hubDateFrom").value;
  const dTo = $("#hubDateTo").value;

  let list = [...events];

  if(status) list = list.filter(e=>e.status===status);
  if(venue) list = list.filter(e=>e.venue.toLowerCase().includes(venue));
  if(dFrom) list = list.filter(e=>e.date >= dFrom);
  if(dTo) list = list.filter(e=>e.date <= dTo);

  list.forEach(ev=> refreshEventFromOrders(ev));

  const grid = $("#eventsGrid");
  grid.innerHTML = "";

  if(list.length===0){
    grid.innerHTML = `<div class="card" style="grid-column:1/-1">
      <div class="cardBody">
        <div class="hint"><b>No events match</b> your filters. Try clearing filters or create a new event.</div>
      </div>
    </div>`;
    return;
  }

  for(const ev of list){
    normalizeEventStatus(ev);
    const sold = eventSold(ev);
    const checkins = eventCheckins(ev);
    const net = eventNet(ev);

    const badgeClass = statusBadgeClass(ev.status);
    const card = document.createElement("div");
    card.className = "eventCard";

    const bannerSrc = ev.design?.bannerDataUrl || ev.bannerDataUrl || ev.design?.bannerUrl || ev.bannerUrl || "";
    const banner = bannerSrc ? `<img alt="" src="${bannerSrc}">` : "";
    const logoSrc = ev.design?.logoDataUrl || ev.logoDataUrl || ev.design?.logoUrl || ev.logoUrl || "";
    const logo = logoSrc ? `<img alt="" src="${logoSrc}">` : `<b style="font-size:14px">${initials(ev.name)}</b>`;

    card.innerHTML = `
      <div class="eventBanner">${banner}
        <div class="eventLogo">${logo}</div>
      </div>
      <div class="eventBody">
        <div class="eventTitle">
          <div style="min-width:0">
            <b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(ev.name)}</b>
            <div class="eventMeta">
              <div class="row"><span class="chip ${badgeClass}">${escapeHtml(statusText(ev.status))}</span></div>
              <div class="row"><span class="muted2">Date:</span> ${escapeHtml(ev.date)}${ev.time?` • ${escapeHtml(ev.time)}`:""}</div>
              <div class="row"><span class="muted2">Venue:</span> ${escapeHtml(ev.venue)}</div>
              ${ev.locationText?`<div class="row"><span class="muted2">Location:</span> <a class="link" href="${escapeHtml(ev.locationUrl||mapsLink(ev.locationText))}" target="_blank" rel="noopener">${escapeHtml(ev.locationText)}</a></div>`:""}            </div>
          </div>
        </div>

        <div class="miniKpis">
          <div class="mini"><span>Sold</span><b>${sold.toLocaleString('en-US')}</b></div>
          <div class="mini"><span>Check-ins</span><b>${checkins.toLocaleString('en-US')}</b></div>
          <div class="mini"><span>Net revenue</span><b>${fmtEGP(net)}</b></div>
        </div>

        <div class="eventActions">
          <button class="btn sm primary" data-act="open">Open Workspace</button>
          <button class="btn sm" data-act="dup"><svg width="14" height="14"><use href="#i-copy"/></svg> Duplicate</button>
          <button class="btn sm" data-act="edit"><svg width="14" height="14"><use href="#i-edit"/></svg> Edit</button>
          <button class="btn sm danger" data-act="del"><svg width="14" height="14"><use href="#i-trash"/></svg> Delete</button>
        </div>
      </div>
    `;

    const [btnOpen, btnDup, btnEdit, btnDel] = $$("button", card);
    lockIfReadOnly(btnEdit);
    lockIfReadOnly(btnDel);
    lockIfReadOnly(btnDup); // duplicating changes data

    btnOpen.addEventListener("click", ()=> openEventWorkspace(ev.id));
    btnDup.addEventListener("click", ()=> duplicateEvent(ev.id));
    btnEdit.addEventListener("click", ()=> editEventModal(ev.id));
    btnDel.addEventListener("click", ()=> deleteEventModal(ev.id));

    grid.appendChild(card);
  }
}

function renderSearchResults(){
  const panel = $("#searchResults");
  if(!panel) return;
  const query = ($("#globalSearch")?.value || "").trim().toLowerCase();
  const hub = $("#page-hub");

  if(state.route !== "hub"){
    panel.classList.remove("open");
    return;
  }

  if(!query){
    panel.classList.remove("open");
    panel.innerHTML = "";
    hub?.classList.remove("hidden");
    return;
  }

  const matches = data.events.filter(ev =>
    ev.name.toLowerCase().includes(query) ||
    ev.venue.toLowerCase().includes(query) ||
    ev.id.toLowerCase().includes(query)
  );

  if(matches.length === 0){
    panel.innerHTML = `<div class="muted small" style="padding:8px 10px">No results found.</div>`;
  }else{
    panel.innerHTML = matches.map(ev => `
      <button class="searchResult" type="button" data-event-id="${ev.id}">
        <b>${escapeHtml(ev.name)}</b>
        <span>${escapeHtml(ev.venue)} • ${escapeHtml(ev.date || "TBA")}</span>
      </button>
    `).join("");
  }
  panel.classList.add("open");
  hub?.classList.add("hidden");

  panel.querySelectorAll("[data-event-id]").forEach(btn=>{
    if(btn.__searchWired) return;
    btn.__searchWired = true;
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.eventId;
      $("#globalSearch").value = "";
      panel.classList.remove("open");
      panel.innerHTML = "";
      hub?.classList.remove("hidden");
      if(id) openEventWorkspace(id);
    });
  });
}

function renderWorkspacePicker(){
  const sel = $("#wsSelect");
  sel.innerHTML = "";
  for(const ev of data.events){
    const opt = document.createElement("option");
    opt.value = ev.id;
    opt.textContent = `${ev.name} (${ev.date})`;
    sel.appendChild(opt);
  }
  $("#wsHintCount").textContent = data.events.length;
}

/* ---------- Event workspace ---------- */

function openEventWorkspace(eventId){
  state.activeEventId = eventId;
  state.route = "event";
  state.activeTab = "overview";
  setRoute("event");
  $$("#subTabs .subTab").forEach(b=>b.classList.toggle("active", b.dataset.tab===state.activeTab));
  switchTab(state.activeTab);
  renderEventWorkspace();
}

function renderEventWorkspace(){
  const ev = currentEvent();
  if(ev) normalizeEventStatus(ev);
  
  if(!ev){
    toast("Event not found", "Please select another event.");
    setRoute("hub");
    return;
  } // <--- Ensure this brace correctly closes the IF block

  refreshEventFromOrders(ev, state.ordersByEvent?.[ev.id] || ev.orders || [], state.invitesByEvent?.[ev.id] || []);
  if(state.embedMode === "design"){
    state.activeTab = "design";
    document.body.classList.add("embed-design");
  }
  $$("#subTabs .subTab").forEach(b=>b.classList.toggle("active", b.dataset.tab===state.activeTab));
  if(!state.activeTab) state.activeTab = "overview";
  switchTab(state.activeTab);

    // 1. Sync the status dropdown(s)
  const statusSelects = [$("#ovStatusSelectTop"), $("#ovStatusSelectOverview")].filter(Boolean);
  for (const sel of statusSelects) {
    sel.value = ev.status || "Draft";
    sel.disabled = isReadOnly();
    // keep a status class for styling hooks
    sel.classList.remove("status-draft","status-on-sale","status-live","status-ended");
    sel.classList.add(
      ev.status==="Live" ? "status-live" :
      ev.status==="On Sale" ? "status-on-sale" :
      ev.status==="Ended" ? "status-ended" : "status-draft"
    );
  }

  // 2. Update Top Titles
  $("#evName").textContent = ev.name;
  $("#evMeta").textContent = `${ev.date}${ev.time?` • ${ev.time}`:""} • ${ev.venue}`;

  // 3. Update the existing badge for visual consistency
  const badge = $("#evStatusBadge");
  if (badge) {
    badge.className = "badge " + statusBadgeClass(ev.status);
    badge.innerHTML = `<strong>${escapeHtml(statusText(ev.status))}</strong>`;
  }

  // 4. Handle Overview status panel (for the manual chip)
  if($("#ovStatusChip")){
    $("#ovStatusChip").className = "chip " + (ev.status==="Live"?"good":(ev.status==="On Sale"?"info":(ev.status==="Ended"?"danger":"")));
    $("#ovStatusChip").textContent = statusText(ev.status);
    $("#ovVenue").textContent = ev.venue || "—";
    $("#ovDate").textContent = `${ev.date}${ev.time?` • ${ev.time}`:""}`.trim();
    const loc = ev.locationText || ev.venue || "";
    $("#ovMapsLink").href = (ev.locationUrl ? ev.locationUrl : (loc ? mapsLink(loc) : "#"));
    $("#ovMapsLink").style.pointerEvents = loc ? "auto" : "none";
    $("#ovMapsLink").style.opacity = loc ? "1" : ".5";
    
    const today = (()=>{
      const d=new Date();
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    })();
    const canLive = (ev.date && ev.date <= today);
    
    // Original buttons (can keep or remove)
    $("#btnSetOnSale").disabled = isReadOnly() || ev.status!=="Draft";
    $("#btnGoLive").disabled = isReadOnly() || !canLive || (ev.status==="Live") || (ev.status==="Ended");
    $("#btnEndEvent").disabled = isReadOnly() || ev.status==="Ended";
  }
  // lock event-level actions in Viewer mode
  lockIfReadOnly($("#btnEditEvent"));
  lockIfReadOnly($("#btnDuplicateEvent"));
  lockIfReadOnly($("#btnDeleteEvent"));
  lockIfReadOnly($("#btnInviteGuest"));

  // KPI calc
  const sold = eventSold(ev);
  const checkins = eventCheckins(ev);
  const gross = eventGross(ev);
  const refunds = eventRefunds(ev);
  const net = gross - refunds;
  const fraud = eventFraud(ev);
  const denied = eventDenied(ev);
  const attend = sold ? Math.round((checkins/sold)*100) : 0;

  $("#kSold").textContent = sold.toLocaleString('en-US');
  $("#kCheckins").textContent = checkins.toLocaleString('en-US');
  $("#kGross").textContent = fmtEGP(gross);
  $("#kRefunds").textContent = fmtEGP(refunds);
  $("#kNet").textContent = fmtEGP(net);
  $("#kFraud").textContent = fraud.toLocaleString('en-US');
  $("#kDenied").textContent = denied.toLocaleString('en-US');
  $("#kAttend").textContent = `${attend}%`;

  // overview lists
  renderNeedsAttention(ev);
  renderActivityLog(ev);

  // ticketing
  renderTiers(ev);
  renderWaves(ev);

  // orders
  renderOrdersFilters(ev);
  renderOrdersTable(ev);

  // customers
  renderAttendeeFilters(ev);
  renderAttendeesTable(ev);
  renderInviteTierKpis(ev);

  // staff & gates
  renderGates(ev);
  renderStaff(ev);

  // incidents
  renderIncidents(ev);

  // links
  renderLinks(ev);
  renderEventSettings(ev);

  // design studio
  renderDesignStudio(ev);

  // analytics
  renderEventAnalytics(ev);
}

function switchTab(tab){
  if(state.embedMode === "design" && tab !== "design"){
    tab = "design";
  }
  state.activeTab = tab;
  const tabs = ["overview","ticketing","orders","customers","staff","design","analytics","incidents","links","settings"];
  for(const t of tabs){
    const el = $("#tab-"+t);
    if(el) el.classList.toggle("hidden", t!==tab);
  }
  if(state.route==="event") __setHash("event");
  saveNavState();
  if(tab==="analytics"){
    // ensure charts draw after visible
    setTimeout(()=> renderEventAnalytics(currentEvent()), 80);
  }
  if(tab==="design"){
    setTimeout(()=> renderDesignStudio(currentEvent()), 60);
  }
}

function renderNeedsAttention(ev){
  const feed = $("#needsAttention");
  feed.innerHTML = "";

  const items = [];

  // simple heuristics
  const denied = eventDenied(ev);
  const fraud = eventFraud(ev);
  if(denied >= 6) items.push({type:"warn", title:`Denied entries spike`, meta:`${denied} denied entries recently — check gates and manual desk.`});
  if(fraud >= 3) items.push({type:"warn", title:`Fraud attempts detected`, meta:`${fraud} blocked duplicates — consider reinforcing gate process.`});

  // gate-focused heuristic
  const byGateDenied = {};
  for(const i of ev.incidents){
    if(String(i.outcome||"").toLowerCase().includes("denied")){
      byGateDenied[i.gate] = (byGateDenied[i.gate]||0)+1;
    }
  }
  const worstGate = Object.entries(byGateDenied).sort((a,b)=>b[1]-a[1])[0];
  if(worstGate && worstGate[1] >= 4){
    items.push({type:"warn", title:`High denials at ${worstGate[0]}`, meta:`${worstGate[1]} denied entries — check scanning flow.`});
  }

  // ticketing: sold out states
  for(const w of ev.waves){
    for(const tid of w.tiersActive){
      const sold = w.sold?.[tid] || 0;
      const qty = w.qty?.[tid] || 0;
      if(qty>0 && sold>=qty){
        const tName = ev.tiers.find(x=>x.id===tid)?.name || tid;
        items.push({type:"info", title:`Sold out`, meta:`${w.name} — ${tName} is sold out.`});
      }
    }
  }

  if(items.length===0){
    items.push({type:"info", title:"All clear", meta:"No urgent issues detected right now."});
  }

  $("#attLocalCount").textContent = items.filter(x=>x.type==="warn").length;

  for(const it of items.slice(0,8)){
    const node = document.createElement("div");
    node.className = "tItem";
    node.innerHTML = `
      <div class="top">
        <b>${escapeHtml(it.title)}</b>
        <span class="chip ${it.type==="warn"?"warn":"info"}">${it.type==="warn"?"Needs review":"Update"}</span>
      </div>
      <div class="meta">${escapeHtml(it.meta)}</div>
    `;
    feed.appendChild(node);
  }
}

function renderActivityLog(ev){
  const feed = $("#activityLog");
  feed.innerHTML = "";

  // normalize any time format into milliseconds
  const toMs = (t) => {
    if (!t) return 0;
    if (t instanceof Date) return t.getTime();
    if (typeof t === "number") return t;
    if (typeof t === "string") {
      const p = Date.parse(t);
      if (!Number.isNaN(p)) return p;
      const n = Number(t);
      return Number.isFinite(n) ? n : 0;
    }
    // Firestore Timestamp (common)
    if (typeof t === "object") {
      if (typeof t.toMillis === "function") return t.toMillis();
      if (typeof t.seconds === "number") return (t.seconds * 1000) + Math.floor((t.nanoseconds || 0) / 1e6);
    }
    return 0;
  };

  const list = [...(ev.activity || [])]
    .sort((a, b) => toMs(b.time) - toMs(a.time)) // newest first
    .slice(0, 7);

  if(list.length === 0){
    feed.innerHTML = `<div class="tItem"><b>No activity yet</b><div class="meta">Activity will appear here as the event runs.</div></div>`;
    return;
  }

  for(const a of list){
    const dt = new Date(toMs(a.time));
    const label = a.type==="warn" ? "warn" : (a.type==="ok" ? "good" : "info");
    const node = document.createElement("div");
    node.className = "tItem";
    node.innerHTML = `
      <div class="top">
        <b>${escapeHtml(a.text || "")}</b>
        <span class="chip ${label}">${fmtTime(dt)}</span>
      </div>
      <div class="meta">${escapeHtml(a.meta||"")}</div>
    `;
    feed.appendChild(node);
  }
}

/* ---------- Ticketing: tiers & waves ---------- */

function renderTiers(ev){
  const body = $("#tiersBody");
  body.innerHTML = "";
  const sales = tierSalesMap(ev);
  for(const t of ev.tiers){
    const cap = Number(t.baseCap || t.capacity || 0);
    const sold = sales[t.id] || 0;
    const remaining = cap ? Math.max(cap - sold, 0) : 0;
    const inviteChip = t.inviteOnly ? ` <span class="chip warn">Invite only</span>` : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(t.name)}</b>${inviteChip}</td>
      <td class="muted">${escapeHtml(t.desc)}</td>
      <td class="mono">${cap.toLocaleString('en-US')}</td>
      <td class="mono">${sold.toLocaleString('en-US')}</td>
      <td class="mono">${remaining.toLocaleString('en-US')}</td>
      <td>
        <div class="rowActions">
          <button class="btn sm" data-a="edit"><svg width="14" height="14"><use href="#i-edit"/></svg> Edit</button>
          <button class="btn sm danger" data-a="del"><svg width="14" height="14"><use href="#i-trash"/></svg> Delete</button>
        </div>
      </td>
    `;
    const editBtn = tr.querySelector('[data-a="edit"]');
    const delBtn = tr.querySelector('[data-a="del"]');
    lockIfReadOnly(editBtn);
    lockIfReadOnly(delBtn);

    editBtn.addEventListener("click", ()=> tierModal(ev.id, t.id));
    delBtn.addEventListener("click", ()=> deleteTierModal(ev.id, t.id));
    body.appendChild(tr);
  }
}

function tierModal(eventId, tierId=null){
  const ev = data.events.find(e=>e.id===eventId);
  if(!ev) return;
  const editing = tierId ? ev.tiers.find(t=>t.id===tierId) : null;

  openModal({
    title: editing ? "Edit Tier" : "Add Tier",
    desc: "Create a tier with name, description, and base capacity.",
    bodyHtml: `
      <div class="grid cols2">
        <div class="field">
          <label>Tier name</label>
          <div class="input"><input id="mTierName" value="${escapeHtml(editing?.name||"")}" placeholder="e.g., General" required></div>
        </div>
        <div class="field">
          <label>Tier color</label>
          <div class="input"><input id="mTierColor" type="color" value="${escapeHtml(editing?.color||"#2563eb")}" title="Tier color"></div>
          <div class="hint">Used for chips and highlights across orders and the marketplace.</div>
        </div>

        <div class="field">
          <label>Base capacity</label>
          <div class="input"><input id="mTierCap" type="number" min="0" value="${editing?.baseCap ?? 0}" placeholder="e.g., 2000"></div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label>Description</label>
          <div class="input"><textarea id="mTierDesc" rows="2" placeholder="Short description">${escapeHtml(editing?.desc||"")}</textarea></div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label>Ticket rules (one per line)</label>
          <div class="input"><textarea id="mTierRules" rows="4" placeholder="e.g.&#10;• ID required&#10;• No re-entry&#10;• Doors close at 1:00 AM">${escapeHtml((Array.isArray(editing?.rules)? editing.rules.join("\n") : (editing?.rulesText||"")))}</textarea></div>
          <div class="muted2 small">These appear as bullet points in ticket view + receipt.</div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label>Availability</label>
          <label class="chip" style="cursor:pointer;display:inline-flex;gap:8px;align-items:center">
            <input type="checkbox" id="mTierInviteOnly" ${editing?.inviteOnly ? "checked" : ""} style="accent-color: var(--brand)">
            Invitation-only (not sold in waves)
          </label>
          <div class="muted2 small">Use this for VIP or comped tiers that should only be issued via invite.</div>
        </div>
      </div>
    `,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label: editing ? "Save changes" : "Add tier", kind:"primary", onClick: ()=>{
        const name = $("#mTierName").value.trim();
        const cap = Number($("#mTierCap").value||0);
        const desc = $("#mTierDesc").value.trim();
        const color = ($("#mTierColor")?.value || "#2563eb").trim();
        const rulesText = $("#mTierRules")?.value || "";
        const rules = rulesText.split(/\n+/).map(s=>s.trim().replace(/^[-•\s]+/,"")).filter(Boolean);
        const inviteOnly = !!$("#mTierInviteOnly")?.checked;
        if(!name){ toast("Missing name","Please enter a tier name."); return; }

        let tierId = "";
        if(editing){
          editing.name = name;
          editing.baseCap = cap;
          editing.desc = desc;
          editing.color = color;
          editing.rules = rules;
          editing.inviteOnly = inviteOnly;
          tierId = editing.id;
          addActivity(ev, "Ticketing updated", `Tier edited — ${name}`, "info");
        }else{
          tierId = uid("T-");
          ev.tiers.push({id: tierId, name, desc, baseCap:cap, color, rules, inviteOnly});
          // make it available for pricing in waves later (no automatic activation)
          addActivity(ev, "Ticketing updated", `Tier added — ${name}`, "info");
        }
        if(inviteOnly){
          for(const w of (ev.waves || [])){
            w.tiersActive = (w.tiersActive || []).filter(x=>x!==tierId);
            if(w.pricing) delete w.pricing[tierId];
            if(w.qty) delete w.qty[tierId];
            if(w.sold) delete w.sold[tierId];
          }
        }
        saveData();
        schedulePublicSync(ev, "ticketing");
        closeModal();
        renderEventWorkspace();
      }}
    ]
  });
}

function deleteTierModal(eventId, tierId){
  const ev = data.events.find(e=>e.id===eventId);
  const t = ev?.tiers.find(x=>x.id===tierId);
  if(!ev || !t) return;

  confirmModal({
    title:"Delete Tier",
    desc:`Delete "${t.name}"? This removes it from tiers and from any wave pricing/quantities.`,
    danger:true,
    actionLabel:"Delete tier",
    onConfirm: ()=>{
      // remove from tiers
      ev.tiers = ev.tiers.filter(x=>x.id!==tierId);
      // remove from waves
      for(const w of ev.waves){
        w.tiersActive = (w.tiersActive||[]).filter(x=>x!==tierId);
        if(w.pricing) delete w.pricing[tierId];
        if(w.qty) delete w.qty[tierId];
        if(w.sold) delete w.sold[tierId];
      }
      addActivity(ev, "Ticketing updated", `Tier deleted — ${t.name}`, "warn");
      saveData();
      schedulePublicSync(ev, "ticketing");
      renderEventWorkspace();
    }
  });
}

function renderWaves(ev){
  const tl = $("#wavesTimeline");
  tl.innerHTML = "";
  const waves = [...(ev.waves||[])].sort((a,b)=> (a.start||"").localeCompare(b.start||""));

  waves.forEach((w, index)=>{
    const start = w.start ? w.start.replace("T"," ") : "—";
    const end = w.end ? w.end.replace("T"," ") : "—";
    const displayName = w.name || `Wave ${index + 1}`;
    const node = document.createElement("div");
    node.className = "tItem";

    const pills = [];
    for(const tid of (w.tiersActive||[])){
      const t = ev.tiers.find(x=>x.id===tid);
      const name = t?.name || tid;
      const price = w.pricing?.[tid] ?? 0;
      const qty = w.qty?.[tid] ?? 0;
      const sold = w.sold?.[tid] ?? 0;
      const so = qty>0 && sold>=qty;
      pills.push(`
        <span class="pricePill ${so?"soldout":""}">
          <b>${escapeHtml(name)}</b>
          <small>${fmtEGP(price)}</small>
          <small class="mono">${sold.toLocaleString('en-US')}/${qty.toLocaleString('en-US')}</small>
          ${so ? `<small style="color:rgba(255,255,255,.9)">Sold out</small>` : ``}
        </span>
      `);
    }

    node.innerHTML = `
      <div class="top">
        <div>
          <b>${escapeHtml(displayName)}</b>
          <div class="meta">
            <span class="chip info">Start: <span class="mono">${escapeHtml(start)}</span></span>
            <span class="chip">End: <span class="mono">${escapeHtml(end)}</span></span>
          </div>
        </div>
        <div class="rowActions">
          <button class="btn sm" data-a="edit"><svg width="14" height="14"><use href="#i-edit"/></svg> Edit</button>
          <button class="btn sm danger" data-a="del"><svg width="14" height="14"><use href="#i-trash"/></svg> Delete</button>
        </div>
      </div>
      <div class="prices">${pills.join("") || `<span class="muted small">No tiers active yet.</span>`}</div>
    `;

    const editBtn = node.querySelector('[data-a="edit"]');
    const delBtn = node.querySelector('[data-a="del"]');
    lockIfReadOnly(editBtn);
    lockIfReadOnly(delBtn);

    editBtn.addEventListener("click", ()=> waveModal(ev.id, w.id));
    delBtn.addEventListener("click", ()=> deleteWaveModal(ev.id, w.id));
    tl.appendChild(node);
  });

  if(waves.length===0){
    tl.innerHTML = `<div class="tItem"><b>No waves yet</b><div class="meta">Add your first wave to enable ticket sales.</div></div>`;
  }
}

function waveModal(eventId, waveId=null){
  const ev = data.events.find(e=>e.id===eventId);
  if(!ev) return;
  const editing = waveId ? ev.waves.find(w=>w.id===waveId) : null;
  const nextIndex = ev.waves.length + (editing ? 0 : 1);
  const defaultName = editing?.name || `Wave ${nextIndex}`;

  const sellableTiers = ev.tiers.filter(t=>!t.inviteOnly);
  const tierOptions = sellableTiers.map(t=>{
    const checked = editing?.tiersActive?.includes(t.id) ? "checked" : "";
    return `
      <label class="chip" style="cursor:pointer">
        <input type="checkbox" class="wTier" value="${t.id}" ${checked} style="accent-color: var(--brand)">
        ${escapeHtml(t.name)}
      </label>`;
  }).join(" ");
  const tierOptionsFallback = ev.tiers.length
    ? `<span class="muted small">All tiers are invitation-only.</span>`
    : `<span class="muted small">Create tiers first.</span>`;

  // pricing rows placeholder (rendered after modal opens)
  openModal({
    title: editing ? "Edit Wave" : "Add Wave",
    desc: "Define start/end dates, active tiers, prices, and quantities for this wave.",
    bodyHtml: `
      <div class="grid cols2">
        <div class="field">
          <label>Wave name</label>
          <div class="input"><input id="mWaveName" value="${escapeHtml(defaultName)}" placeholder="Wave 1"></div>
        </div>
        <div class="field">
          <label>Wave ID (optional)</label>
          <div class="input"><input id="mWaveId" value="${escapeHtml(editing?.id||"")}" placeholder="e.g., W1"></div>
        </div>
        <div class="field">
          <label>Start date-time</label>
          <div class="input"><input id="mWaveStart" type="datetime-local" value="${escapeHtml(editing?.start||"")}"></div>
        </div>
        <div class="field">
          <label>End date-time</label>
          <div class="input"><input id="mWaveEnd" type="datetime-local" value="${escapeHtml(editing?.end||"")}"></div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label>Active tiers in this wave</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${tierOptions || tierOptionsFallback}</div>
        </div>
      </div>

      <div class="hr"></div>
      <b style="font-size:12px">Wave pricing + quantities (per tier)</b>
      <div class="muted small" style="margin-top:6px">You can set a different price and quantity for each tier in this wave.</div>
      <div style="height:10px"></div>
      <div class="tableWrap" style="max-height:260px;overflow:auto">
        <table>
          <thead>
            <tr><th>Tier</th><th>Price</th><th>Quantity</th><th>Sold (auto)</th></tr>
          </thead>
          <tbody id="waveTierRows"></tbody>
        </table>
      </div>
    `,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label: editing ? "Save changes" : "Add wave", kind:"primary", onClick: ()=>{
        const name = $("#mWaveName").value.trim() || "Wave";
        const idInput = $("#mWaveId").value.trim();
        const start = $("#mWaveStart").value;
        const end = $("#mWaveEnd").value;

        const tierIds = $$(".wTier").filter(x=>x.checked).map(x=>x.value);
        const pricing = {};
        const qty = {};
        const sold = (editing?.sold ? {...editing.sold} : {});

        for(const tid of tierIds){
          const tBase = ev.tiers.find(x=>x.id===tid)?.baseCap ?? 0;

          const p = Number($(`#wPrice_${tid}`)?.value || 0);
          const qRaw = Number($(`#wQty_${tid}`)?.value || 0);
          const remaining = remainingForTier(tid);
          const cap = (tBase>0) ? remaining : qRaw;
          const q = (tBase>0 && qRaw>cap) ? cap : qRaw;
          if(tBase>0 && qRaw>cap){
            toast("Quantity adjusted", `Wave quantity was capped at remaining capacity (${cap}).`);
          }
          pricing[tid] = p;
          qty[tid] = q;
          if(!(tid in sold)) sold[tid] = 0;
        }
        // prune sold for removed tiers
        for(const k of Object.keys(sold)){
          if(!tierIds.includes(k)) delete sold[k];
        }

        const wave = {
          id: idInput || (editing?.id || uid("W")),
          name,
          start,
          end,
          tiersActive: tierIds,
          pricing,
          qty,
          sold
        };

        if(editing){
          Object.assign(editing, wave);
          addActivity(ev, "Ticketing updated", `Wave edited — ${name}`, "info");
        }else{
          // ensure unique id
          if(ev.waves.some(w=>w.id===wave.id)){
            toast("Wave ID already used", "Please choose a unique wave ID.");
            return;
          }
          ev.waves.push(wave);
          addActivity(ev, "Ticketing updated", `Wave added — ${name}`, "info");
        }

        saveData();
        schedulePublicSync(ev, "ticketing");
        closeModal();
        renderEventWorkspace();
      }}
    ]
  });

  // Fill tier rows
  const tbody = $("#waveTierRows");
  tbody.innerHTML = "";
  const tierSales = tierSalesMap(ev);
  const waveSales = waveSalesMap(ev);
  const remainingForTier = (tid)=>{
    const base = ev.tiers.find(x=>x.id===tid)?.baseCap ?? 0;
    if(base <= 0) return null;
    const usedByWaves = (ev.waves || []).reduce((sum, w)=>{
      if(editing && w.id === editing.id) return sum;
      return sum + (Number(w.qty?.[tid]) || 0);
    }, 0);
    return Math.max(base - usedByWaves, 0);
  };
  for(const t of ev.tiers){
    if(t.inviteOnly) continue;
    const active = editing?.tiersActive?.includes(t.id) || false;
    const priceVal = editing?.pricing?.[t.id] ?? 0;
    const qtyVal = editing?.qty?.[t.id] ?? 0;
    const soldVal = (editing ? (waveSales[editing.id]?.[t.id] || 0) : 0);
    const maxQty = remainingForTier(t.id);
    const maxAttr = (maxQty === null) ? "" : `max="${maxQty}"`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(t.name)}</b><div class="muted2 small">${escapeHtml(t.desc)}</div></td>
      <td><div class="input" style="padding:8px 10px"><input id="wPrice_${t.id}" type="number" min="0" value="${priceVal}" ${active?"":"disabled"}></div></td>
      <td><div class="input" style="padding:8px 10px"><input id="wQty_${t.id}" type="number" min="0" ${maxAttr} value="${qtyVal}" ${active?"":"disabled"}></div></td>
      <td class="mono">${soldVal.toLocaleString('en-US')}</td>
    `;
    tbody.appendChild(tr);
  }

  // Enable/disable row fields based on tier checkbox
  $$(".wTier").forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const tid = cb.value;
      const en = cb.checked;
      const p = $(`#wPrice_${tid}`), q = $(`#wQty_${tid}`);
      if(p) p.disabled = !en;
      if(q) q.disabled = !en;
    });
  });
}

function deleteWaveModal(eventId, waveId){
  const ev = data.events.find(e=>e.id===eventId);
  const w = ev?.waves.find(x=>x.id===waveId);
  if(!ev || !w) return;

  confirmModal({
    title:"Delete Wave",
    desc:`Delete "${w.name}"? This removes the wave timeline entry and wave pricing/quantities.`,
    danger:true,
    actionLabel:"Delete wave",
    onConfirm: ()=>{
      ev.waves = ev.waves.filter(x=>x.id!==waveId);
      addActivity(ev, "Ticketing updated", `Wave deleted — ${w.name}`, "warn");
      saveData();
      schedulePublicSync(ev, "ticketing");
      renderEventWorkspace();
    }
  });
}

/* ---------- Orders ---------- */

function renderOrdersFilters(ev){
  const waveSel = $("#ordWave");
  const tierSel = $("#ordTier");
  if(waveSel.options.length===0){
    const inviteOption = (state.invitesByEvent?.[ev.id] || []).length ? `<option value="invite">Invite</option>` : "";
    waveSel.innerHTML = `<option value="">All</option>` + inviteOption + ev.waves.map(w=>`<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
  }
  if(tierSel.options.length===0){
    tierSel.innerHTML = `<option value="">All</option>` + ev.tiers.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  }
}

function renderOrdersTable(ev){
  const body = $("#ordersBody");
  body.innerHTML = "";

  const q = $("#globalSearch").value.trim().toLowerCase();
  const from = $("#ordFrom").value;
  const to = $("#ordTo").value;
  const wave = $("#ordWave").value;
  const tier = $("#ordTier").value;
  const status = $("#ordStatus").value;

  let list = [...(ev.orders||[])];

  if(from) list = list.filter(o=> (o.timestamp||"").slice(0,10) >= from);
  if(to) list = list.filter(o=> (o.timestamp||"").slice(0,10) <= to);
  if(wave) list = list.filter(o=>o.waveId===wave);
  if(status) list = list.filter(o=>o.status===status);
  if(tier) list = list.filter(o=> (o.tiers||[]).some(t=>t.tierId===tier));
  if(q){
    list = list.filter(o =>
      (o.id||"").toLowerCase().includes(q) ||
      (o.customer||"").toLowerCase().includes(q) ||
      (o.contact?.phone||"").toLowerCase().includes(q) ||
      (o.contact?.email||"").toLowerCase().includes(q)
    );
  }

  list.sort((a,b)=> (b.timestamp||"").localeCompare(a.timestamp||""));

  for(const o of list.slice(0,260)){
    const tierItems = (o.tiers && o.tiers.length)
      ? o.tiers
      : (o.tierId ? [{ tierName: o.tierName || o.tierId, qty: o.qty || 1 }] : []);
    const tiersText = tierItems.map(t=>`${t.tierName} ×${t.qty}`).join(", ");
    const chipClass = o.status==="Paid" ? "good" : (o.status==="Refunded" ? "warn" : "danger");
    const dt = new Date(o.timestamp);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono"><b>${escapeHtml(o.id)}</b></td>
      <td>${escapeHtml(o.customer || "—")}</td>
      <td class="muted">
        <div>${escapeHtml(o.contact?.phone || "—")}</div>
        <div class="muted2 small">${escapeHtml(o.contact?.email || "—")}</div>
      </td>
      <td>${escapeHtml(o.waveName || o.waveId || "—")}</td>
      <td>${escapeHtml(tiersText || "—")}</td>
      <td class="mono">${Number(o.qty||0).toLocaleString('en-US')}</td>
      <td><b>${fmtEGP(o.amount||0)}</b></td>
      <td><span class="chip ${chipClass}">${escapeHtml(o.status)}</span></td>
      <td class="muted2">${escapeHtml(fmtTime(dt))}</td>
      <td>
        <button class="btn sm" data-open="1">Open</button>
      </td>
    `;
    tr.querySelector('[data-open="1"]').addEventListener("click", ()=> openOrderDrawer(ev, o));
    body.appendChild(tr);
  }

  if(list.length===0){
    body.innerHTML = `<tr><td colspan="10">
      <div class="hint"><b>No orders found</b> for these filters.</div>
    </td></tr>`;
  }
}

function openOrderDrawer(ev, o){
  const tiers = (o.tiers||[]).map(t=>`<div class="chip">${escapeHtml(t.tierName)} × <b class="mono">${t.qty}</b></div>`).join("");
  const contact = `<div class="kv">
    <div><b>Customer</b><span>${escapeHtml(o.customer)}</span></div>
    <div><b>Contact</b><span>${escapeHtml(o.contact?.phone||"—")}<br><span class="muted2">${escapeHtml(o.contact?.email||"—")}</span></span></div>
    <div><b>Wave</b><span>${escapeHtml(o.waveName||o.waveId||"—")}</span></div>
    <div><b>Status</b><span class="chip ${o.status==="Paid"?"good":(o.status==="Refunded"?"warn":"danger")}">${escapeHtml(o.status)}</span></div>
    <div><b>Qty</b><span class="mono">${Number(o.qty||0).toLocaleString('en-US')}</span></div>
    <div><b>Amount</b><span><b>${fmtEGP(o.amount||0)}</b></span></div>
  </div>`;

  const dt = new Date(o.timestamp);
  const body = `
    <div class="hint"><b>Order details</b> — This is a read-friendly view for quick support actions.</div>
    ${contact}
    <div class="hr"></div>
    <b style="font-size:12px">Items</b>
    <div style="height:8px"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${tiers || `<span class="muted small">—</span>`}</div>
    <div class="hr"></div>
    <div class="kv">
      <div><b>Order ID</b><span class="mono">${escapeHtml(o.id)}</span></div>
      <div><b>Timestamp</b><span>${escapeHtml(fmtTime(dt))}</span></div>
    </div>
  `;
  openDrawer(`Order ${o.id}`, `${ev.name}`, body);
}

/* ---------- Customers / Attendees ---------- */

function generateInviteToken(){
  if(crypto?.randomUUID){
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function inviteRedeemUrl(inviteToken){
  return `https://luma-tickets-2-0.vercel.app/redeem/${inviteToken}`;
}

function openInviteGuestModal(ev){
  if(!ev) return;
  if(!ev.tiers?.length){
    toast("Add tiers first", "Create at least one ticket tier before inviting guests.");
    return;
  }
  const tierOptions = ev.tiers.map(t=>`<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("");
  const bodyHtml = `
    <div class="grid cols2">
      <div class="field">
        <label>Tier</label>
        <div class="input">
          <select id="inviteTier">
            <option value="">Select a tier</option>
            ${tierOptions}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Expires (optional)</label>
        <div class="input">
          <input id="inviteExpires" type="date">
        </div>
      </div>
      <div class="field">
        <label>Recipient name (optional)</label>
        <div class="input">
          <input id="inviteName" placeholder="Guest name">
        </div>
      </div>
      <div class="field">
        <label>Recipient phone (optional)</label>
        <div class="input">
          <input id="invitePhone" placeholder="010...">
        </div>
      </div>
      <div class="field">
        <label>Recipient email (optional)</label>
        <div class="input">
          <input id="inviteEmail" type="email" placeholder="guest@email.com">
        </div>
      </div>
    </div>
    <div class="hint">We’ll generate a redeem URL after saving the invite.</div>
  `;
  openModal({
    title: "Invite a guest",
    desc: "Choose a tier and share the redeem link with your guest.",
    bodyHtml,
    footButtons: [
      { label: "Cancel", kind: "ghost", onClick: closeModal },
      {
        label: "Create invite",
        kind: "primary",
        onClick: async ()=>{
          if(isReadOnly()) return;
          const tierId = $("#inviteTier")?.value || "";
          if(!tierId){
            toast("Missing tier", "Select a tier for this invite.");
            return;
          }
          if(!window.__firebaseReady || !db || !setDoc){
            toast("Offline", "Firebase is not ready yet.");
            return;
          }
          const inviteToken = generateInviteToken();
          const expiresRaw = $("#inviteExpires")?.value || "";
          const expiresAt = expiresRaw
            ? (Timestamp?.fromDate ? Timestamp.fromDate(new Date(`${expiresRaw}T23:59:59`)) : new Date(`${expiresRaw}T23:59:59`))
            : null;
          const payload = {
            eventId: ev.id,
            tierId,
            status: "pending",
            inviteToken,
            recipient: {
              name: $("#inviteName")?.value?.trim() || "",
              phone: $("#invitePhone")?.value?.trim() || "",
              email: $("#inviteEmail")?.value?.trim() || ""
            },
            createdBy: auth?.currentUser?.uid || "",
            redeemedBy: "",
            expiresAt,
            createdAt: serverTimestamp()
          };
          try{
            await setDoc(doc(publicEventInvitesCol(ev.id), inviteToken), payload, { merge: true });
            const url = inviteRedeemUrl(inviteToken);
            const tierName = ev.tiers.find(t=>t.id===tierId)?.name || tierId;
            openModal({
              title: "Invite created",
              desc: "Share this link with your guest.",
              bodyHtml: `
                <div class="field">
                  <label>Redeem URL</label>
                  <div class="input">
                    <input id="inviteLink" value="${escapeHtml(url)}" readonly>
                  </div>
                </div>
                <div class="rowActions" style="margin-top:12px">
                  <button class="btn sm" id="copyInviteLink"><svg width="16" height="16"><use href="#i-copy"/></svg> Copy link</button>
                  <a class="btn sm ghost" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open link</a>
                </div>
              `,
              footButtons: [
                { label: "Done", kind: "primary", onClick: closeModal }
              ]
            });
            $("#copyInviteLink")?.addEventListener("click", ()=> copyText(url, "Invite link copied"));
            addActivity(ev, "Invite created", `Tier: ${tierName}`, "info");
          }catch(err){
            console.error(err);
            toast("Invite failed", "Could not create an invite.");
          }
        }
      }
    ]
  });
}

function renderAttendeeFilters(ev){
  const waveSel = $("#attWave");
  const tierSel = $("#attTier");

  if(waveSel.options.length===0){
    waveSel.innerHTML = `<option value="">All</option>` + ev.waves.map(w=>`<option value="${w.id}">${escapeHtml(w.name)}</option>`).join("");
  }
  if((state.invitesByEvent?.[ev.id] || []).length){
    const hasInvite = Array.from(waveSel.options).some(opt=>opt.value === "invite");
    if(!hasInvite){
      const opt = document.createElement("option");
      opt.value = "invite";
      opt.textContent = "Invite";
      waveSel.appendChild(opt);
    }
  }
  if(tierSel.options.length===0){
    tierSel.innerHTML = `<option value="">All</option>` + ev.tiers.map(t=>`<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  }
}

function renderAttendeesTable(ev){
  const body = $("#attBody");
  body.innerHTML = "";

  const q = ($("#attSearch").value || $("#globalSearch").value || "").trim().toLowerCase();
  const st = $("#attStatus").value;
  const wave = $("#attWave").value;
  const tier = $("#attTier").value;

  let list = [...(ev.attendees||[])];

  if(st) list = list.filter(a=>a.status===st);
  if(wave) list = list.filter(a=>a.waveId===wave);
  if(tier) list = list.filter(a=>a.tierId===tier);
  if(q){
    list = list.filter(a =>
      (a.name||"").toLowerCase().includes(q) ||
      (a.contact?.phone||"").toLowerCase().includes(q) ||
      (a.contact?.email||"").toLowerCase().includes(q)
    );
  }

  // prioritize not checked-in near top
  list.sort((a,b)=>{
    if(a.status!==b.status) return a.status==="Not checked-in" ? -1 : 1;
    return (a.name||"").localeCompare(b.name||"");
  });

  for(const a of list.slice(0,320)){
    const chip = a.status==="Checked-in" ? "good" : "warn";
    const dt = a.checkinTime ? fmtTime(new Date(a.checkinTime)) : "—";
    const gate = a.gateName || "—";

    const canCheckIn = !isReadOnly();
    const actionBtn = (a.status==="Not checked-in")
      ? `<button class="btn sm good" data-ci="1" ${canCheckIn? "":"disabled"}>Mark checked-in</button>`
      : `<button class="btn sm ghost" data-ci="0" disabled>Checked</button>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(a.name)}</b></td>
      <td class="muted">
        <div>${escapeHtml(a.contact?.phone || "—")}</div>
        <div class="muted2 small">${escapeHtml(a.contact?.email || "—")}</div>
      </td>
      <td class="mono">1</td>
      <td>${escapeHtml(a.waveName||a.waveId||"—")}</td>
      <td>${escapeHtml(a.tierName||a.tierId||"—")}</td>
      <td><span class="chip ${chip}">${escapeHtml(a.status)}</span></td>
      <td class="muted2">${escapeHtml(dt)}</td>
      <td class="muted2">${escapeHtml(gate)}</td>
      <td>${actionBtn}</td>
    `;
    const btn = tr.querySelector('[data-ci="1"]');
    if(btn){
      btn.addEventListener("click", ()=> markCheckin(ev, a.id));
    }
    body.appendChild(tr);
  }

  if(list.length===0){
    body.innerHTML = `<tr><td colspan="9">
      <div class="hint"><b>No attendees found</b> for your search/filters.</div>
    </td></tr>`;
  }
}

function renderInviteTierKpis(ev){
  const wrap = $("#inviteTierKpis");
  if(!wrap) return;
  const invites = state.invitesByEvent?.[ev.id] || [];
  const counts = new Map();
  for(const t of (ev.tiers || [])){
    counts.set(t.id, 0);
  }
  for(const inv of invites){
    if(!inv.tierId) continue;
    counts.set(inv.tierId, (counts.get(inv.tierId) || 0) + 1);
  }
  const total = invites.length;
  const cards = (ev.tiers || []).map(t=>{
    const count = counts.get(t.id) || 0;
    return `
      <div class="kpi">
        <div class="label">${escapeHtml(t.name)}</div>
        <div class="value">${count.toLocaleString("en-US")}</div>
        <div class="sub">Invites</div>
      </div>
    `;
  }).join("") || `<div class="muted small">No tiers yet.</div>`;

  wrap.innerHTML = `
    <div class="card" style="box-shadow:none">
      <div class="cardHead" style="padding-bottom:0">
        <div>
          <h3 style="font-size:13px;margin:0">Invites by tier</h3>
          <p class="muted small" style="margin-top:6px">Total invites: ${total.toLocaleString("en-US")}</p>
        </div>
      </div>
      <div class="cardBody">
        <div class="kpiGrid">${cards}</div>
      </div>
    </div>
  `;
}

function markCheckin(ev, attendeeId){
  const a = ev.attendees.find(x=>x.id===attendeeId);
  if(!a || a.status==="Checked-in") return;
  const gate = ev.gates[Math.floor(Math.random()*ev.gates.length)];
  a.status = "Checked-in";
  a.checkinTime = new Date().toISOString();
  a.gateId = gate?.id || "";
  a.gateName = gate?.name || "";

  addActivity(ev, `${a.name} checked in`, `${a.gateName || "Gate"} — ${fmtTime(new Date())}`, "ok");

  saveData();
  schedulePublicSync(ev, "checkin");
  if(window.__firebaseReady && updateDoc && a.inviteToken){
    const inviteRef = doc(db, "events", ev.id, "invites", a.inviteToken);
    updateDoc(inviteRef, {
      status: "redeemed",
      checkedInAt: serverTimestamp(),
      checkedInGate: a.gateName || "",
      checkedInBy: auth?.currentUser?.uid || "",
      checkedInByUsername: state.user?.name || state.user?.email || ""
    }).catch(()=>{});
  }else if(window.__firebaseReady && updateDoc && a.orderId){
    const order = (ev.orders || []).find(o=>o.id===a.orderId || o.orderId===a.orderId);
    const orderQty = order?.qty || order?.tiers?.reduce?.((s,it)=>s+(Number(it.qty)||0),0) || 1;
    const singleTicket = orderQty <= 1;
    const ref = doc(db, "events", ev.id, "orders", a.orderId);
    updateDoc(ref, {
      ...(singleTicket ? { checkedIn: true } : {}),
      checkedInTicketId: a.id || "",
      checkedInAt: serverTimestamp(),
      checkedInGate: a.gateName || "",
      checkedInBy: auth?.currentUser?.uid || "",
      checkedInByUsername: state.user?.name || state.user?.email || ""
    }).catch(()=>{});
  }
  // immediate UI refresh
  renderEventWorkspace();
}

/* ---------- Staff & Gates ---------- */

function renderGates(ev){
  const body = $("#gatesBody");
  body.innerHTML = "";
  for(const g of ev.gates){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(g.name)}</b></td>
      <td class="muted">${escapeHtml(g.notes||"—")}</td>
      <td>
        <div class="rowActions">
          <button class="btn sm" data-a="edit"><svg width="14" height="14"><use href="#i-edit"/></svg> Edit</button>
          <button class="btn sm danger" data-a="del"><svg width="14" height="14"><use href="#i-trash"/></svg> Delete</button>
        </div>
      </td>
    `;
    const editBtn = tr.querySelector('[data-a="edit"]');
    const delBtn = tr.querySelector('[data-a="del"]');
    lockIfReadOnly(editBtn);
    lockIfReadOnly(delBtn);

    editBtn.addEventListener("click", ()=> gateModal(ev.id, g.id));
    delBtn.addEventListener("click", ()=> deleteGateModal(ev.id, g.id));
    body.appendChild(tr);
  }
}

function gateModal(eventId, gateId=null){
  const ev = data.events.find(e=>e.id===eventId);
  const editing = gateId ? ev.gates.find(g=>g.id===gateId) : null;

  openModal({
    title: editing ? "Edit Gate" : "Add Gate",
    desc: "Create gates like Gate A, Gate B, VIP Gate.",
    bodyHtml: `
      <div class="grid cols2">
        <div class="field">
          <label>Gate name</label>
          <div class="input"><input id="mGateName" value="${escapeHtml(editing?.name||"")}" placeholder="Gate A"></div>
        </div>
        <div class="field">
          <label>Gate ID (optional)</label>
          <div class="input"><input id="mGateId" value="${escapeHtml(editing?.id||"")}" placeholder="e.g., G-A"></div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label>Notes</label>
          <div class="input"><input id="mGateNotes" value="${escapeHtml(editing?.notes||"")}" placeholder="Optional notes"></div>
        </div>
      </div>
    `,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label: editing ? "Save changes" : "Add gate", kind:"primary", onClick: ()=>{
        const name = $("#mGateName").value.trim();
        const id = $("#mGateId").value.trim();
        const notes = $("#mGateNotes").value.trim();
        if(!name){ toast("Missing name","Please enter a gate name."); return; }

        if(editing){
          editing.name = name;
          editing.notes = notes;
          addIncident(ev, name, "system", "—", "Staff/Gate updated", "Gate edited");
        }else{
          const newId = id || uid("G-");
          if(ev.gates.some(g=>g.id===newId)){
            toast("Gate ID already used","Choose a different gate ID.");
            return;
          }
          ev.gates.push({id:newId, name, notes});
          addIncident(ev, name, "system", "—", "Staff/Gate updated", "Gate added");
        }
        saveData();
        schedulePublicSync(ev, "gates");
        closeModal();
        renderEventWorkspace();
      }}
    ]
  });
}

function deleteGateModal(eventId, gateId){
  const ev = data.events.find(e=>e.id===eventId);
  const g = ev?.gates.find(x=>x.id===gateId);
  if(!ev || !g) return;

  confirmModal({
    title:"Delete Gate",
    desc:`Delete "${g.name}"? Any ushers assigned to this gate will be unassigned.`,
    danger:true,
    actionLabel:"Delete gate",
    onConfirm: ()=>{
      ev.gates = ev.gates.filter(x=>x.id!==gateId);
      // unassign staff
      for(const s of ev.staff){
        if(s.gate===gateId) s.gate="";
      }
      addIncident(ev, g.name, "system", "—", "Staff/Gate updated", "Gate deleted");
      saveData();
      schedulePublicSync(ev, "gates");
      syncStaffToFirestore(ev).catch(console.warn);
      renderEventWorkspace();
    }
  });
}

function renderStaff(ev){
  const body = $("#staffBody");
  body.innerHTML = "";

  for(const s of ev.staff){
    const gateName = s.gate ? (ev.gates.find(g=>g.id===s.gate)?.name || "—") : "—";
    const stChip = s.disabled ? `<span class="chip danger">Disabled</span>` : `<span class="chip good">Active</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(s.full)}</b></td>
      <td class="mono">${escapeHtml(s.username)}</td>
      <td><span class="chip ${s.role==="Viewer"?"warn":"info"}">${escapeHtml(s.role)}</span></td>
      <td class="muted2">${escapeHtml(gateName)}</td>
      <td>${stChip}</td>
      <td>
        <div class="rowActions">
          <button class="btn sm" data-a="manage"><svg width="14" height="14"><use href="#i-edit"/></svg> Manage</button>
        </div>
      </td>
    `;

    const manageBtn = tr.querySelector('[data-a="manage"]');
    lockIfReadOnly(manageBtn);
    manageBtn.addEventListener("click", ()=> staffActionsModal(ev.id, s.id));

    body.appendChild(tr);
  }

  if(ev.staff.length===0){
    body.innerHTML = `<tr><td colspan="6">
      <div class="hint"><b>No staff yet</b>. Add ushers, manual desk, finance, design, or viewers.</div>
    </td></tr>`;
  }
}

function staffActionsModal(eventId, staffId){
  const ev = data.events.find(e=>e.id===eventId);
  const s = ev?.staff.find(x=>x.id===staffId);
  if(!ev || !s) return;
  const gateName = s.gate ? (ev.gates.find(g=>g.id===s.gate)?.name || "—") : "—";

  openModal({
    title: `${s.full}`,
    desc: `Manage staff access for ${s.username}.`,
    bodyHtml: `
      <div class="kvList">
        <div class="kv"><span>Role</span><b>${escapeHtml(s.role)}</b></div>
        <div class="kv"><span>Username</span><b class="mono">${escapeHtml(s.username)}</b></div>
        <div class="kv"><span>Gate</span><b>${escapeHtml(gateName)}</b></div>
        <div class="kv"><span>Status</span><b>${s.disabled ? "Disabled" : "Active"}</b></div>
      </div>
      <div class="hr"></div>
      <div class="rowActions">
        <button class="btn sm" id="staffEdit"><svg width="14" height="14"><use href="#i-edit"/></svg> Edit</button>
        <button class="btn sm" id="staffPin"><svg width="14" height="14"><use href="#i-lock"/></svg> Reset PIN</button>
        <button class="btn sm" id="staffDisable">${s.disabled ? "Enable" : "Disable"}</button>
        <button class="btn sm" id="staffGate">Reassign gate</button>
        <button class="btn sm danger" id="staffDelete"><svg width="14" height="14"><use href="#i-trash"/></svg> Delete</button>
      </div>
    `,
    footButtons: [
      {label:"Close", kind:"ghost", onClick: closeModal}
    ]
  });

  const editBtn = $("#staffEdit");
  const pinBtn = $("#staffPin");
  const disBtn = $("#staffDisable");
  const gateBtn = $("#staffGate");
  const delBtn = $("#staffDelete");
  [editBtn,pinBtn,disBtn,gateBtn,delBtn].forEach(lockIfReadOnly);

  editBtn?.addEventListener("click", ()=>{ closeModal(); staffModal(ev.id, s.id); });
  pinBtn?.addEventListener("click", ()=>{ closeModal(); resetPinModal(ev.id, s.id); });
  disBtn?.addEventListener("click", ()=>{ closeModal(); toggleStaffModal(ev.id, s.id); });
  gateBtn?.addEventListener("click", ()=>{ closeModal(); reassignGateModal(ev.id, s.id); });
  delBtn?.addEventListener("click", ()=>{ closeModal(); deleteStaffModal(ev.id, s.id); });
}

function staffModal(eventId, staffId=null){
  const ev = data.events.find(e=>e.id===eventId);
  const editing = staffId ? ev.staff.find(s=>s.id===staffId) : null;

  const gateOptions = [`<option value="">No gate</option>`].concat(ev.gates.map(g=>{
    return `<option value="${g.id}" ${editing?.gate===g.id ? "selected":""}>${escapeHtml(g.name)}</option>`;
  })).join("");

  // multi-event access (for this dashboard, staff can access multiple events)
  const eventChips = data.events.map(e=>{
    const checked = (editing?.events || []).includes(e.id) ? "checked" : "";
    return `<label class="chip" style="cursor:pointer">
      <input type="checkbox" class="sEvent" value="${e.id}" ${checked} style="accent-color: var(--brand)">
      ${escapeHtml(e.name)}
    </label>`;
  }).join(" ");

  const roleOptions = ROLES.map(r=>`<option ${editing?.role===r?"selected":""}>${escapeHtml(r)}</option>`).join("");

  openModal({
    title: editing ? "Edit Staff" : "Add Staff",
    desc: "Create username + PIN for staff login. Viewer role is read-only.",
    bodyHtml: `
      <div class="grid cols2">
        <div class="field">
          <label>Full name</label>
          <div class="input"><input id="mSFull" value="${escapeHtml(editing?.full||"")}" placeholder="Full name"></div>
        </div>
        <div class="field">
          <label>Role</label>
          <div class="input">
            <select id="mSRole">${roleOptions}</select>
          </div>
        </div>
        <div class="field">
          <label>Username</label>
          <div class="input"><input id="mSUser" value="${escapeHtml(editing?.username||"")}" placeholder="username"></div>
        </div>
        <div class="field">
          <label>PIN</label>
          <div class="input"><input id="mSPin" value="${escapeHtml(editing?.pin||"")}" placeholder="4 digits" maxlength="6"></div>
        </div>
        <div class="field">
          <label>Gate assignment (ushers only)</label>
          <div class="input">
            <select id="mSGate">${gateOptions}</select>
          </div>
        </div>
        <div class="field">
          <label>Status</label>
          <div class="input">
            <select id="mSDisabled">
              <option value="0" ${editing?.disabled ? "" : "selected"}>Active</option>
              <option value="1" ${editing?.disabled ? "selected" : ""}>Disabled</option>
            </select>
          </div>
        </div>
        <div class="field" style="grid-column:1/-1">
          <label>Event access (select events)</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${eventChips}</div>
        </div>
      </div>

      <div class="hr"></div>
      <div class="hint">
        <b>Role note:</b> Viewer is read-only. Ushers can be assigned to a gate for check-in tracking.
      </div>
    `,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label: editing ? "Save changes" : "Add staff", kind:"primary", onClick: ()=>{
        const full = $("#mSFull").value.trim();
        const role = $("#mSRole").value;
        const username = $("#mSUser").value.trim();
        const pin = $("#mSPin").value.trim();
        const gate = $("#mSGate").value;
        const disabled = $("#mSDisabled").value==="1";
        const eventsSel = $$(".sEvent").filter(x=>x.checked).map(x=>x.value);

        if(!full || !username || !pin){
          toast("Missing details","Full name, username, and PIN are required.");
          return;
        }
        // usher-only gate enforcement
        const gateFinal = role==="Usher" ? gate : "";

        if(editing){
          editing.full = full;
          editing.role = role;
          editing.username = username;
          editing.pin = pin;
          editing.gate = gateFinal;
          editing.disabled = disabled;
          editing.events = eventsSel.length ? eventsSel : [ev.id];
          addIncident(ev, gateNameFromId(ev, gateFinal), username, "—", "Staff updated", `Staff edited (${role})`);
        }else{
          if(ev.staff.some(s=>s.username===username)){
            toast("Username already used","Choose a different username.");
            return;
          }
          const id = uid("S");
          ev.staff.push({
            id, full, username, pin, role,
            events: eventsSel.length ? eventsSel : [ev.id],
            gate: gateFinal,
            disabled
          });
          addIncident(ev, gateNameFromId(ev, gateFinal), username, "—", "Staff updated", `Staff added (${role})`);
        }

        saveData();
        schedulePublicSync(ev, "staff");
        syncStaffToFirestore(ev).catch(console.warn);
        closeModal();
        renderEventWorkspace();
      }}
    ]
  });

  // gate enable only for usher
  const roleEl = $("#mSRole");
  const gateEl = $("#mSGate");
  const toggleGate = ()=>{
    const isUsher = roleEl.value==="Usher";
    gateEl.disabled = !isUsher;
    if(!isUsher) gateEl.value = "";
  };
  roleEl.addEventListener("change", toggleGate);
  toggleGate();
}

function gateNameFromId(ev, gateId){
  return gateId ? (ev.gates.find(g=>g.id===gateId)?.name || "—") : "—";
}

function resetPinModal(eventId, staffId){
  const ev = data.events.find(e=>e.id===eventId);
  const s = ev?.staff.find(x=>x.id===staffId);
  if(!ev || !s) return;

  openModal({
    title:"Reset PIN",
    desc:`Reset PIN for ${s.full}.`,
    bodyHtml: `
      <div class="hint">
        <b>New PIN:</b> Enter a new PIN below.
      </div>
      <div style="height:10px"></div>
      <div class="field">
        <label>New PIN</label>
        <div class="input"><input id="mNewPin" placeholder="4 digits" maxlength="6"></div>
      </div>
    `,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label:"Reset PIN", kind:"primary", onClick: ()=>{
        const np = $("#mNewPin").value.trim();
        if(!np){ toast("Missing PIN","Enter a new PIN."); return; }
        s.pin = np;
        addIncident(ev, gateNameFromId(ev, s.gate), s.username, "—", "Staff updated", "PIN reset");
        saveData();
        schedulePublicSync(ev, "staff");
        syncStaffToFirestore(ev).catch(console.warn);
        closeModal();
        renderEventWorkspace();
        toast("PIN reset","Staff PIN updated successfully.");
      }}
    ]
  });
}

function toggleStaffModal(eventId, staffId){
  const ev = data.events.find(e=>e.id===eventId);
  const s = ev?.staff.find(x=>x.id===staffId);
  if(!ev || !s) return;

  const next = !s.disabled;
  confirmModal({
    title: next ? "Disable staff" : "Enable staff",
    desc: next ? `Disable ${s.full}? They won’t be able to log in.` : `Enable ${s.full}? They can log in again.`,
    danger: next,
    actionLabel: next ? "Disable" : "Enable",
    onConfirm: ()=>{
      s.disabled = next;
      addIncident(ev, gateNameFromId(ev, s.gate), s.username, "—", "Staff updated", next ? "Staff disabled" : "Staff enabled");
      saveData();
      schedulePublicSync(ev, "staff");
      syncStaffToFirestore(ev).catch(console.warn);
      renderEventWorkspace();
      toast(next ? "Staff disabled" : "Staff enabled", s.full);
    }
  });
}

function reassignGateModal(eventId, staffId){
  const ev = data.events.find(e=>e.id===eventId);
  const s = ev?.staff.find(x=>x.id===staffId);
  if(!ev || !s) return;

  const options = [`<option value="">No gate</option>`].concat(ev.gates.map(g=>`<option value="${g.id}" ${s.gate===g.id?"selected":""}>${escapeHtml(g.name)}</option>`)).join("");

  openModal({
    title:"Reassign Gate",
    desc:`Assign a gate for ${s.full}.`,
    bodyHtml: `
      <div class="hint"><b>Note:</b> Only ushers should have a gate assignment.</div>
      <div style="height:10px"></div>
      <div class="field">
        <label>Gate</label>
        <div class="input">
          <select id="mReGate">${options}</select>
        </div>
      </div>
    `,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label:"Save", kind:"primary", onClick: ()=>{
        const gateId = $("#mReGate").value;
        if(s.role!=="Usher" && gateId){
          toast("Role mismatch","Only ushers should be assigned to gates.");
          return;
        }
        s.gate = gateId;
        addIncident(ev, gateNameFromId(ev, gateId), s.username, "—", "Staff updated", "Gate reassigned");
        saveData();
        schedulePublicSync(ev, "staff");
        syncStaffToFirestore(ev).catch(console.warn);
        closeModal();
        renderEventWorkspace();
      }}
    ]
  });
}

function deleteStaffModal(eventId, staffId){
  const ev = data.events.find(e=>e.id===eventId);
  const s = ev?.staff.find(x=>x.id===staffId);
  if(!ev || !s) return;

  confirmModal({
    title:"Delete staff",
    desc:`Delete ${s.full}? This removes their access immediately.`,
    danger:true,
    actionLabel:"Delete staff",
    onConfirm: ()=>{
      ev.staff = ev.staff.filter(x=>x.id!==staffId);
      addIncident(ev, "—", "system", "—", "Staff updated", `Staff deleted (${s.username})`);
      saveData();
      schedulePublicSync(ev, "staff");
      syncStaffToFirestore(ev).catch(console.warn);
      renderEventWorkspace();
      toast("Staff deleted", s.full);
    }
  });
}

/* ---------- Incidents ---------- */

function addIncident(ev, gateName, staffUser, customer, outcome, notes){
  ev.incidents = ev.incidents || [];
  ev.incidents.unshift({
    id: uid("INC-"),
    time: new Date().toISOString(),
    gate: gateName || "—",
    staff: staffUser || "—",
    customer: customer || "—",
    outcome: outcome || "—",
    notes: notes || "",
    source: "manual"
  });
  // also activity
  addActivity(ev, "Audit log updated", `${outcome} — ${gateName || "—"}`, outcome.toLowerCase().includes("denied") ? "warn" : "info");
}

function renderIncidents(ev){
  const body = $("#incBody");
  body.innerHTML = "";

  const feed = getIncidentFeed(ev);
  for(const i of feed.slice(0,400)){
    const dt = new Date(i.time);
    const out = (i.outcome||"").toLowerCase();
    const cls = out.includes("denied") ? "danger" : (out.includes("blocked") ? "warn" : "info");
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="muted2">${escapeHtml(fmtTime(dt))}</td>
      <td>${escapeHtml(i.gate||"—")}</td>
      <td class="mono">${escapeHtml(i.staff||"—")}</td>
      <td>${escapeHtml(i.customer||"—")}</td>
      <td><span class="chip ${cls}">${escapeHtml(i.outcome||"—")}</span></td>
      <td class="muted">${escapeHtml(i.notes||"")}</td>
    `;
    body.appendChild(tr);
  }

  if(feed.length===0){
    body.innerHTML = `<tr><td colspan="6">
      <div class="hint"><b>No incidents yet</b>. Operational incidents will appear here automatically.</div>
    </td></tr>`;
  }
}

/* ---------- Links ---------- */

function renderLinks(ev){
  if(!ev) return;
  const base = location.origin && location.origin.startsWith("http") ? location.origin : "https://luma.tickets";
  $("#linkUsher").value = `${base}/usher?event=${encodeURIComponent(ev.id)}`;
  $("#linkTeam").value = `${base}/team?event=${encodeURIComponent(ev.id)}`;
  $("#linkDesk").value = `${base}/manual-desk?event=${encodeURIComponent(ev.id)}`;
}

function renderEventSettings(ev){
  if(!ev) return;
  $("#setEventDesc").value = ev.desc || ev.description || "";
  $("#setLocationText").value = ev.locationText || "";
  $("#setLocationUrl").value = ev.locationUrl || "";

  const url = ev.ownerLogoUrl || ev.ownerLogoDataUrl || ev.design?.ownerLogoDataUrl || "";
  const img = $("#ownerLogoPreview");
  const fb = $("#ownerLogoFallback");
  if(img){
    if(url){
      img.src = url;
      img.style.display = "block";
      if(fb) fb.style.display = "none";
    }else{
      img.removeAttribute("src");
      img.style.display = "none";
      if(fb) fb.style.display = "block";
    }
  }
}

/* ---------- Automation ---------- */

function renderAutomation(ev){
  $("#webhookUrl").value = ev.webhookUrl || "";
}

/* ---------- Design Studio ---------- */

function renderDesignStudio(ev){
  if(!ev) return;
  const d = ev.design || {};
  // set builder input values only if empty (avoid resetting user typing mid-edit)
  if($("#dsHeadline").value === "") $("#dsHeadline").value = d.headline || "Your ticket is ready";
  if($("#dsEmailText").value === "") $("#dsEmailText").value = d.emailText || "";
  $("#dsPrimary").value = d.primary || "#2563eb";
  $("#dsAccent").value = d.accent || "#16a34a";
  if($("#dsFontFamily")) $("#dsFontFamily").value = d.fontFamily || "Montserrat";
  if($("#dsTextColor")) $("#dsTextColor").value = d.textColor || "#0f172a";

  // hook inputs
  const updatePreview = ()=>{
    const snapshot = getDesignDraft(ev);
    // Persist draft into the event object so it can be saved + published
    ev.design = ev.design || {};
    ev.design.primary = snapshot.primary;
    ev.design.accent = snapshot.accent;
    ev.design.fontFamily = snapshot.fontFamily;
    ev.design.textColor = snapshot.textColor;
    ev.design.headline = snapshot.headline;
    ev.design.emailText = snapshot.emailText;
    ev.design.updatedAt = nowISO();
    saveData();
    buildPreview(snapshot);
  };
  ["dsPrimary","dsAccent","dsFontFamily","dsTextColor","dsHeadline","dsEmailText"].forEach(id=>{
    const el = $("#"+id);
    if(!el) return;
    if(!el._wired){
      el.addEventListener("input", updatePreview);
      el._wired = true;
    }
  });

  // file upload previews
  wireFileInput("#dsBanner", (dataUrl)=>{ ev.design.bannerDataUrl = dataUrl; ev.bannerDataUrl = dataUrl; saveData(); schedulePublicSync(ev, "design"); updatePreview(); toast("Banner updated","Preview updated."); });
  wireFileInput("#dsLogo", (dataUrl)=>{ ev.design.logoDataUrl = dataUrl; ev.logoDataUrl = dataUrl; saveData(); schedulePublicSync(ev, "design"); updatePreview(); toast("Logo updated","Preview updated."); });
  wireFileInput("#dsOwnerLogo", (dataUrl)=>{ ev.design.ownerLogoDataUrl = dataUrl; ev.ownerLogoDataUrl = dataUrl; saveData(); schedulePublicSync(ev, "design"); updatePreview(); toast("Owner logo updated","Preview updated."); });
  wireFileInput("#dsBg", (dataUrl)=>{ ev.design.bgDataUrl = dataUrl; saveData(); schedulePublicSync(ev, "design"); updatePreview(); toast("Background updated","Preview updated."); });

  // preview mode buttons
  const __pm = $("#previewMode");
  if(__pm && !__pm._wired){
$$("#previewMode button").forEach(b=>{
      b.addEventListener("click", ()=>{
        $$("#previewMode button").forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        state.designPreview.mode = b.dataset.pv;
        buildPreview(getDesignDraft(ev));
      });
    });
    __pm._wired = true;
  }

  // buttons
  lockIfReadOnly($("#btnSaveDesign") || null);
  lockIfReadOnly($("#btnPublishDesign") || null);

  const __btnSave = $("#btnSaveDesign");
  if(__btnSave && !__btnSave._wired){
    on("#btnSaveDesign","click", ()=>{
      if(isReadOnly()) return;
      const draft = getDesignDraft(ev);
      Object.assign(ev.design, draft, { updatedAt: nowISO() });
      saveData();
      schedulePublicSync(ev, "design");
      addActivity(ev, "Design saved", "Draft saved in Design Studio", "info");
      toast("Draft saved", "Your design draft was saved.");
      renderEventWorkspace();
    });
    __btnSave._wired = true;
  }
  const __btnPub = $("#btnPublishDesign");
  if(__btnPub && !__btnPub._wired){
    on("#btnPublishDesign","click", ()=>{
      if(isReadOnly()) return;
      const draft = getDesignDraft(ev);
      Object.assign(ev.design, draft, { updatedAt: nowISO(), published:true });
      saveData();
      schedulePublicSync(ev, "design");
      addActivity(ev, "Design published", "Ticket + QR + email styling published", "ok");
      toast("Design published", "Your design is now published for this event.");
      renderEventWorkspace();
    });
    __btnPub._wired = true;
  }

  // initial preview
  buildPreview(getDesignDraft(ev));
}

function getDesignDraft(ev){
  const d = ev.design || {};
  return {
    bannerDataUrl: d.bannerDataUrl || "",
    logoDataUrl: d.logoDataUrl || "",
    bgDataUrl: d.bgDataUrl || "",
    primary: $("#dsPrimary").value || d.primary || "#2563eb",
    accent: $("#dsAccent").value || d.accent || "#16a34a",
    fontFamily: ($("#dsFontFamily")?.value) || d.fontFamily || "Montserrat",
    textColor: ($("#dsTextColor")?.value) || d.textColor || "#0f172a",
    headline: $("#dsHeadline").value.trim() || d.headline || "Your ticket is ready",
    emailText: $("#dsEmailText").value.trim() || d.emailText || "",
    published: !!d.published,
    updatedAt: d.updatedAt || nowISO()
  };
}

function wireFileInput(sel, onDataUrl){
  const input = $(sel);
  if(!input || input._wired) return;
  input.addEventListener("change", async ()=>{
    const file = input.files?.[0];
    if(!file) return;
    const dataUrl = await fileToDataUrl(file);
    onDataUrl?.(dataUrl);
    input.value = "";
  });
  input._wired = true;
}
function readFileDataUrl(file){
  return new Promise((res, rej)=>{
    const r = new FileReader();
    r.onload = ()=> res(String(r.result||""));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function loadImage(dataUrl){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=> res(img);
    img.onerror = rej;
    img.src = dataUrl;
  });
}
async function fileToDataUrl(file, opts={}){
  const { maxSize = 1400, quality = 0.82 } = opts;
  const dataUrl = await readFileDataUrl(file);
  if(!file.type?.startsWith("image/")) return dataUrl;

  try{
    const img = await loadImage(dataUrl);
    const maxDim = Math.max(img.width, img.height);
    const shouldResize = maxDim > maxSize || file.size > 600 * 1024;
    if(!shouldResize) return dataUrl;

    const scale = Math.min(1, maxSize / maxDim);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if(!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const preferWebp = file.type === "image/png" || file.type === "image/webp";
    const mime = preferWebp ? "image/webp" : "image/jpeg";
    return canvas.toDataURL(mime, quality);
  }catch(_e){
    return dataUrl;
  }
}

function buildPreview(design){
  const pv = state.designPreview.mode || "mobile";
  const pb = $("#previewBody");
  pb.innerHTML = "";
  pb.style.fontFamily = `${design.fontFamily||"Montserrat"}, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  pb.style.color = design.textColor || "#f8fafc";

  // inject a small style for the preview colors
  const style = document.createElement("style");
  style.textContent = `
    .pvPrimary{color:${design.primary}}
    .pvAccent{color:${design.accent}}
    .pvBtn{
      border:1px solid rgba(255,255,255,.12);
      background: linear-gradient(135deg, ${design.primary}33, rgba(255,255,255,.04));
      color: rgba(248,250,252,.92);
      padding:10px 12px;border-radius:14px;font-weight:800;font-size:12px;
      display:inline-flex;align-items:center;gap:10px
    }
  `;
  pb.appendChild(style);

  if(pv==="mobile"){
    pb.appendChild(renderMobilePreview(design));
  }else if(pv==="ticket"){
    pb.appendChild(renderTicketPreview(design));
  }else{
    pb.appendChild(renderEmailPreview(design));
  }
}

function renderMobilePreview(d){
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="phone">
      <div class="phoneTop">Customer App • Ticket Screen</div>
      <div class="ticketMock" style="${d.bgDataUrl ? `background-image:url('${d.bgDataUrl}');background-size:cover;background-position:center;` : ""}">
        <div class="ticketCard">
          <div class="ticketBanner" style="background:${d.primary}22">
            ${d.bannerDataUrl ? `<img alt="" src="${d.bannerDataUrl}">` : ``}
          </div>
          <div class="ticketInfo">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
              <b>${escapeHtml(d.headline || "Your ticket is ready")}</b>
              <span class="chip info" style="border-color:${d.accent}55;background:${d.accent}18">Paid</span>
            </div>
            <div class="line"><span>Event</span><span><b>Sample Event</b></span></div>
            <div class="line"><span>Tier</span><span>VIP</span></div>
            <div class="line"><span>Seat</span><span>General Admission</span></div>

            <div class="qrFrame" style="border-color:${d.primary}55">
              <div class="muted small">Branded QR screen</div>
              <div class="qrBox" style="border-color:${d.accent}55">
                <div class="qrInner"></div>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%">
                <span class="chip" style="border-color:${d.primary}55;background:${d.primary}12">Scan at gate</span>
                <span class="chip" style="border-color:${d.accent}55;background:${d.accent}12">Valid</span>
              </div>
            </div>

            <div style="height:10px"></div>
            <button class="pvBtn"><svg width="16" height="16"><use href="#i-ticket"/></svg> View Receipt</button>
          </div>
        </div>
      </div>
    </div>
  `;
  return wrap.firstElementChild;
}

function renderTicketPreview(d){
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="ticketCard">
      <div class="ticketBanner" style="height:180px;background:${d.primary}22;position:relative">
        ${d.bannerDataUrl ? `<img alt="" src="${d.bannerDataUrl}">` : ``}
        <div style="position:absolute;left:14px;bottom:14px;display:flex;align-items:center;gap:10px">
          <div style="width:54px;height:54px;border-radius:18px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.22);display:grid;place-items:center;overflow:hidden">
            ${d.logoDataUrl ? `<img alt="" src="${d.logoDataUrl}" style="width:100%;height:100%;object-fit:cover">`
              : `<b style="letter-spacing:.4px">L</b>`
            }
          </div>
          <div>
            <b style="font-size:14px">${escapeHtml(d.headline || "Your ticket is ready")}</b><br>
            <span class="muted small">Ticket preview • branding + layout</span>
          </div>
        </div>
      </div>
      <div class="ticketInfo" style="padding:14px">
        <div class="grid cols2">
          <div class="kpi" style="min-height:auto">
            <div class="label">Event</div>
            <div class="value" style="font-size:16px">Sample Event</div>
            <div class="sub">Date • Venue</div>
          </div>
          <div class="kpi" style="min-height:auto">
            <div class="label">Tier</div>
            <div class="value" style="font-size:16px">VIP</div>
            <div class="sub">Wave 2</div>
          </div>
        </div>
        <div style="height:12px"></div>
        <div class="qrFrame" style="border-color:${d.primary}55;background:${d.primary}10">
          <b style="font-size:12px">QR Screen Frame</b>
          <div class="muted small">Branding around QR, ready for scanning</div>
          <div class="qrBox" style="border-color:${d.accent}55;background:${d.accent}10">
            <div class="qrInner"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  return wrap.firstElementChild;
}

function renderEmailPreview(d){
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="emailMock">
      <div class="emailHead" style="background:${d.primary}18">
        <div style="width:42px;height:42px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(0,0,0,.18);display:grid;place-items:center;overflow:hidden">
          ${d.logoDataUrl ? `<img alt="" src="${d.logoDataUrl}" style="width:100%;height:100%;object-fit:cover">`
            : `<svg width="18" height="18" style="color:rgba(248,250,252,.90)"><use href="#i-luma"/></svg>`
          }
        </div>
        <div>
          <b style="font-size:13px">Receipt Email Preview</b><br>
          <span class="muted small">Header/logo + colors + text blocks</span>
        </div>
      </div>
      <div class="emailBody">
        <div class="chip info" style="border-color:${d.accent}55;background:${d.accent}18;width:max-content">Payment confirmed</div>
        <div class="emailBlock wide"></div>
        <div class="emailBlock mid"></div>
        <div class="emailBlock small"></div>

        <div class="hint" style="border-color:${d.primary}55;background:${d.primary}10">
          <b>${escapeHtml(d.headline || "Your ticket is ready")}</b><br>
          <span class="muted small">${escapeHtml(d.emailText || "Thanks for joining us. Show this QR code at the gate to check in.")}</span>
        </div>

        <div class="qrFrame" style="border-color:${d.accent}55;background:${d.accent}08">
          <div class="muted small">QR code</div>
          <div class="qrBox" style="border-color:${d.primary}55">
            <div class="qrInner"></div>
          </div>
          <div class="muted2 small">Powered by Luma</div>
        </div>

        <div class="emailBlock wide"></div>
        <div class="emailBlock mid"></div>
      </div>
    </div>
  `;
  return wrap.firstElementChild;
}

/* ---------- Analytics charts (lightweight canvas) ---------- */

function spark(canvas, seriesA, seriesB=null){
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * devicePixelRatio;
  const h = canvas.height = canvas.getAttribute("height") ? (Number(canvas.getAttribute("height"))*devicePixelRatio) : (180*devicePixelRatio);

  ctx.clearRect(0,0,w,h);

  // grid
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(255,255,255,.10)";
  ctx.lineWidth = 1*devicePixelRatio;
  for(let i=1;i<=4;i++){
    const y = (h/5)*i;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const drawLine = (series, stroke)=>{
    const max = Math.max(...series, 1);
    const min = Math.min(...series, 0);
    const range = Math.max(max - min, 1);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2.2*devicePixelRatio;
    ctx.beginPath();
    series.forEach((v,i)=>{
      const x = (w/(series.length-1))*i;
      const y = h - ((v-min)/range)*(h*0.78) - h*0.12;
      if(i===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    });
    ctx.stroke();
  };

  drawLine(seriesA, "rgba(37,99,235,.95)");
  if(seriesB) drawLine(seriesB, "rgba(22,163,74,.90)");

  // last value badge
  const last = seriesA[seriesA.length-1] ?? 0;
  ctx.fillStyle = "rgba(15,23,42,.10)";
  ctx.strokeStyle = "rgba(15,23,42,.18)";
  ctx.lineWidth = 1*devicePixelRatio;
  const label = String(Math.round(last));
  ctx.font = `${12*devicePixelRatio}px Montserrat, sans-serif`;
  const tw = ctx.measureText(label).width + 18*devicePixelRatio;
  const th = 26*devicePixelRatio;
  const x = w - tw - 12*devicePixelRatio;
  const y = 10*devicePixelRatio;
  roundRect(ctx, x, y, tw, th, 10*devicePixelRatio);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0f172a";
  ctx.fillText(label, x + 9*devicePixelRatio, y + 17*devicePixelRatio);
}
function roundRect(ctx, x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function renderEventAnalytics(ev){
  if(!ev) return;

  // series derived from orders + attendees (placeholder-like but stable)
  const points = 14;
  const sold = eventSold(ev);
  const checkins = eventCheckins(ev);
  const fraud = eventFraud(ev);

  const seriesSales = Array.from({length:points}, (_,i)=> Math.max(0, sold*0.15 + i*(sold*0.06) + Math.sin(i/2)*sold*0.02));
  const seriesCheck = Array.from({length:points}, (_,i)=> Math.max(0, checkins*0.10 + i*(checkins*0.05) + Math.cos(i/2.2)*checkins*0.02));
  const seriesFraud = Array.from({length:points}, (_,i)=> Math.max(0, fraud*0.8 + (i%5===0? 2:0) + Math.sin(i)*1.2));

  spark($("#chartSales"), seriesSales);
  spark($("#chartCheckins"), seriesCheck);
  spark($("#chartFraud"), seriesFraud);

  // finance breakdown
  const gross = eventGross(ev);
  const refunds = eventRefunds(ev);
  const net = gross - refunds;
  $("#faGross").textContent = fmtEGP(gross);
  $("#faRefunds").textContent = fmtEGP(refunds);
  $("#faNet").textContent = fmtEGP(net);

  const attend = eventSold(ev) ? Math.round((eventCheckins(ev)/eventSold(ev))*100) : 0;
  $("#faAttend").textContent = `${attend}%`;

  // by wave
  const waveAgg = {};
  for(const o of ev.orders){
    if(!waveAgg[o.waveId]) waveAgg[o.waveId] = { name:o.waveName || o.waveId, gross:0, refunds:0, net:0, qty:0 };
    const w = waveAgg[o.waveId];
    if(o.status==="Paid" || o.status==="Refunded"){
      w.gross += o.amount;
      w.qty += o.qty;
    }
    if(o.status==="Refunded") w.refunds += o.amount;
    w.net = w.gross - w.refunds;
  }
  $("#byWave").innerHTML = Object.values(waveAgg).sort((a,b)=>b.net-a.net).map(w=>{
    return `<div class="tItem" style="margin-bottom:10px">
      <div class="top"><b>${escapeHtml(w.name)}</b><span class="chip info">${fmtEGP(w.net)}</span></div>
      <div class="meta">
        <span class="chip">Gross ${fmtEGP(w.gross)}</span>
        <span class="chip warn">Refunds ${fmtEGP(w.refunds)}</span>
        <span class="chip">Qty <span class="mono">${w.qty}</span></span>
      </div>
    </div>`;
  }).join("") || `<div class="muted small">No data yet.</div>`;

  // by tier
  const tierAgg = {};
  for(const o of ev.orders){
    for(const it of (o.tiers||[])){
      const k = it.tierId;
      if(!tierAgg[k]) tierAgg[k] = { name: it.tierName || k, qty:0, revenue:0, refunds:0, net:0 };
      tierAgg[k].qty += it.qty;
      if(o.status==="Paid" || o.status==="Refunded") tierAgg[k].revenue += it.qty * (o.amount/o.qty);
      if(o.status==="Refunded") tierAgg[k].refunds += it.qty * (o.amount/o.qty);
      tierAgg[k].net = tierAgg[k].revenue - tierAgg[k].refunds;
    }
  }
  $("#byTier").innerHTML = Object.values(tierAgg).sort((a,b)=>b.net-a.net).map(t=>{
    return `<div class="tItem" style="margin-bottom:10px">
      <div class="top"><b>${escapeHtml(t.name)}</b><span class="chip info">${fmtEGP(t.net)}</span></div>
      <div class="meta">
        <span class="chip">Qty <span class="mono">${t.qty}</span></span>
        <span class="chip">Revenue ${fmtEGP(t.revenue)}</span>
        <span class="chip warn">Refunds ${fmtEGP(t.refunds)}</span>
      </div>
    </div>`;
  }).join("") || `<div class="muted small">No data yet.</div>`;
}

/* ---------- Global analytics across events ---------- */

function renderAllAnalytics(){
  data.events.forEach(ev=> refreshEventFromOrders(ev));
  const gross = data.events.reduce((s,e)=>s+eventGross(e),0);
  const refunds = data.events.reduce((s,e)=>s+eventRefunds(e),0);
  const net = gross - refunds;
  const sold = data.events.reduce((s,e)=>s+eventSold(e),0);
  const check = data.events.reduce((s,e)=>s+eventCheckins(e),0);
  const attend = sold ? Math.round((check/sold)*100) : 0;
  const active = data.events.filter(e=>e.status==="Live" || e.status==="On Sale").length;
  const avgPrice = sold ? Math.round(gross / sold) : 0;
  const refundRate = gross ? Math.round((refunds / gross) * 100) : 0;

  $("#allGross").textContent = fmtEGP(gross);
  $("#allRefunds").textContent = fmtEGP(refunds);
  $("#allNet").textContent = fmtEGP(net);
  $("#allAttend").textContent = `${attend}%`;
  $("#allSold").textContent = sold.toLocaleString('en-US');
  $("#allActive").textContent = active.toLocaleString('en-US');
  $("#allAvgPrice").textContent = fmtEGP(avgPrice);
  $("#allRefundRate").textContent = `${refundRate}%`;

  const points=14;
  const sA = Array.from({length:points}, (_,i)=> Math.max(0, net*0.12 + i*(net*0.05) + Math.sin(i/2)*net*0.02));
  const sB = Array.from({length:points}, (_,i)=> Math.max(0, check*0.18 + i*(check*0.06) + Math.cos(i/2.2)*check*0.02));
  spark($("#chartAllSales"), sA);
  spark($("#chartAllCheckins"), sB);

  const topEvents = [...data.events]
    .map(ev=>({
      id: ev.id,
      name: ev.name,
      net: eventNet(ev),
      sold: eventSold(ev),
      attend: eventSold(ev) ? Math.round((eventCheckins(ev)/eventSold(ev))*100) : 0
    }))
    .sort((a,b)=>b.net-a.net)
    .slice(0,5);

  $("#allTopEvents").innerHTML = topEvents.map(ev=>{
    return `<div class="tItem">
      <div class="top">
        <b>${escapeHtml(ev.name || "Untitled event")}</b>
        <span class="chip info">${fmtEGP(ev.net)}</span>
      </div>
      <div class="meta">
        <span class="chip">Sold <span class="mono">${ev.sold.toLocaleString('en-US')}</span></span>
        <span class="chip">Attendance <span class="mono">${ev.attend}%</span></span>
      </div>
    </div>`;
  }).join("") || `<div class="muted small">No events yet.</div>`;

  const tierAgg = {};
  for(const ev of data.events){
    const sales = tierSalesMap(ev);
    for(const t of (ev.tiers || [])){
      const soldQty = sales[t.id] || 0;
      const cap = Number(t.baseCap || t.capacity || 0);
      const key = t.name || t.id;
      if(!tierAgg[key]) tierAgg[key] = { name: key, sold:0, cap:0 };
      tierAgg[key].sold += soldQty;
      tierAgg[key].cap += cap;
    }
  }

  const tierRows = Object.values(tierAgg)
    .filter(t=>t.cap>0 || t.sold>0)
    .map(t=>{
      const pct = t.cap ? Math.round((t.sold / t.cap) * 100) : 0;
      return {...t, pct};
    })
    .sort((a,b)=>b.pct-a.pct)
    .slice(0,6);

  $("#allTierFlow").innerHTML = tierRows.map(t=>{
    return `<div class="tItem">
      <div class="top">
        <b>${escapeHtml(t.name)}</b>
        <span class="chip">${t.pct}%</span>
      </div>
      <div class="meta">
        <span class="chip">Sold <span class="mono">${t.sold.toLocaleString('en-US')}</span></span>
        <span class="chip">Capacity <span class="mono">${t.cap.toLocaleString('en-US')}</span></span>
      </div>
    </div>`;
  }).join("") || `<div class="muted small">No tier data yet.</div>`;
}

/* ---------- Attention page ---------- */

function renderAttentionPage(){
  // Build feed from all events + local state
  const feed = $("#attFeed");
  feed.innerHTML = "";
  const items = [];

  data.events.forEach(ev=> refreshEventFromOrders(ev));

  for(const ev of data.events){
    const denied = eventDenied(ev);
    const fraud = eventFraud(ev);
    if(denied >= 4){
      items.push({ title:`Denied entries at ${ev.name}`, meta:`${denied} denied entries • Open workspace to check gates`, type:"warn" });
    }
    if(fraud >= 2){
      items.push({ title:`Fraud attempts blocked`, meta:`${fraud} blocked duplicates • ${ev.name}`, type:"warn" });
    }
    // sold out highlights
    for(const w of ev.waves){
      for(const tid of w.tiersActive){
        const sold = w.sold?.[tid] || 0;
        const qty = w.qty?.[tid] || 0;
        if(qty>0 && sold>=qty){
          const tName = ev.tiers.find(x=>x.id===tid)?.name || tid;
          items.push({ title:`Sold out`, meta:`${ev.name} — ${w.name} — ${tName}`, type:"info" });
        }
      }
    }
  }

  // also include live attentionFeed items
  items.unshift(...state.attentionFeed.slice(0,6));

  if(items.length===0){
    items.push({ title:"All clear", meta:"No urgent items right now.", type:"info" });
  }

  $("#attCount").textContent = items.length;
  $("#attOpen").textContent = items.filter(i=>i.type==="warn").length.toLocaleString('en-US');
  $("#attLiveCount").textContent = data.events.filter(e=>e.status==="Live" || e.status==="On Sale").length.toLocaleString('en-US');
  $("#attRefunds").textContent = fmtEGP(data.events.reduce((s,e)=>s+eventRefunds(e),0));

  for(const it of items.slice(0,14)){
    const node = document.createElement("div");
    node.className = "tItem";
    node.innerHTML = `
      <div class="top">
        <b>${escapeHtml(it.title)}</b>
        <span class="chip ${it.type==="warn"?"warn":"info"}">${it.type==="warn"?"Needs review":"Update"}</span>
      </div>
      <div class="meta">${escapeHtml(it.meta)}</div>
    `;
    feed.appendChild(node);
  }

  // totals
  $("#sumSold").textContent = data.events.reduce((s,e)=>s+eventSold(e),0).toLocaleString('en-US');
  $("#sumCheckins").textContent = data.events.reduce((s,e)=>s+eventCheckins(e),0).toLocaleString('en-US');
  $("#sumNet").textContent = fmtEGP(data.events.reduce((s,e)=>s+eventNet(e),0));
}

/* ---------- Exports ---------- */

function downloadText(filename, text){
  const blob = new Blob([text], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
}
function toCSV(rows){
  const esc = v => {
    const s = String(v ?? "");
    const needs = /[",\n]/.test(s);
    const out = s.replace(/"/g,'""');
    return needs ? `"${out}"` : out;
  };
  return rows.map(r=> r.map(esc).join(",")).join("\n");
}

function resolveTierNameForEvent(ev, tierId, tierName){
  if(tierName) return tierName;
  if(!tierId) return "";
  return ev.tiers.find(t=>t.id===tierId)?.name || tierId;
}

function resolveWaveNameForEvent(ev, waveId, waveName){
  if(waveName) return waveName;
  if(!waveId) return "";
  return ev.waves.find(w=>w.id===waveId)?.name || waveId;
}

function exportOrders(ev){
  const rows = [["Order ID","Customer Name","Phone","Email","Event","Wave","Tier(s)","Qty","Amount","Status","Timestamp"]];
  for(const o of ev.orders){
    const waveName = resolveWaveNameForEvent(ev, o.waveId, o.waveName);
    const tiersText = (o.tiers||[]).map(t=>{
      const tName = resolveTierNameForEvent(ev, t.tierId, t.tierName);
      return `${tName} x${t.qty}`;
    }).join(" | ");
    rows.push([
      o.id, o.customer,
      o.contact?.phone||"",
      o.contact?.email||"",
      ev.name,
      waveName,
      tiersText,
      o.qty, o.amount, o.status, o.timestamp
    ]);
  }
  downloadText(`${ev.id}-orders.csv`, toCSV(rows));
  toast("Export ready", "Orders CSV downloaded.");
}

function exportAttendees(ev, onlyCheckins=false){
  const rows = [["Name","Phone","Email","Ticket Code","Event","Wave","Tier","Status","Check-in Time","Gate","Order ID"]];
  for(const a of ev.attendees){
    if(onlyCheckins && a.status!=="Checked-in") continue;
    const waveName = resolveWaveNameForEvent(ev, a.waveId, a.waveName);
    const tierName = resolveTierNameForEvent(ev, a.tierId, a.tierName);
    rows.push([
      a.name,
      a.contact?.phone||"",
      a.contact?.email||"",
      a.inviteToken ? "" : a.id,
      ev.name,
      waveName || "",
      tierName || "",
      a.status,
      a.checkinTime,
      a.gateName,
      a.orderId
    ]);
  }
  downloadText(`${ev.id}-${onlyCheckins?"checkins":"attendees"}.csv`, toCSV(rows));
  toast("Export ready", `${onlyCheckins?"Check-ins":"Attendees"} CSV downloaded.`);
}

function exportIncidents(ev){
  const rows = [["Time","Gate","Staff Username","Customer Name","Outcome","Notes","Event"]];
  const feed = getIncidentFeed(ev);
  for(const i of feed){
    rows.push([i.time, i.gate, i.staff, i.customer, i.outcome, i.notes, ev.name]);
  }
  downloadText(`${ev.id}-incidents.csv`, toCSV(rows));
  toast("Export ready", "Incidents CSV downloaded.");
}

function exportFinance(ev){
  // finance summary by wave and tier
  const rows = [["Event","Gross","Refunds","Net","Tickets Sold","Check-ins","Attendance %"]];
  const gross = eventGross(ev);
  const refunds = eventRefunds(ev);
  const net = gross-refunds;
  const sold = eventSold(ev);
  const check = eventCheckins(ev);
  const att = sold ? Math.round((check/sold)*100) : 0;
  rows.push([ev.name, gross, refunds, net, sold, check, att]);

  rows.push([]);
  rows.push(["Breakdown by wave","Wave","Gross","Refunds","Net","Qty"]);
  const waveAgg = {};
  for(const o of ev.orders){
    if(!waveAgg[o.waveId]) waveAgg[o.waveId] = {name:o.waveName||o.waveId, gross:0, refunds:0, net:0, qty:0};
    const w = waveAgg[o.waveId];
    if(o.status==="Paid" || o.status==="Refunded"){
      w.gross += o.amount; w.qty += o.qty;
    }
    if(o.status==="Refunded") w.refunds += o.amount;
    w.net = w.gross - w.refunds;
  }
  for(const w of Object.values(waveAgg)){
    rows.push([ev.name, w.name, w.gross, w.refunds, w.net, w.qty]);
  }

  rows.push([]);
  rows.push(["Breakdown by tier","Tier","Qty"]);
  const tierAgg = {};
  for(const a of ev.attendees){
    tierAgg[a.tierName||a.tierId] = (tierAgg[a.tierName||a.tierId]||0) + 1;
  }
  for(const [k,v] of Object.entries(tierAgg)){
    rows.push([ev.name, k, v]);
  }

  downloadText(`${ev.id}-finance-summary.csv`, toCSV(rows));
  toast("Export ready", "Finance summary CSV downloaded.");
}

function exportAllFinance(){
  const rows = [["Event ID","Event","Status","Date","Venue","Gross","Refunds","Net","Sold","Check-ins","Attendance %"]];
  for(const ev of data.events){
    const gross = eventGross(ev);
    const refunds = eventRefunds(ev);
    const net = gross - refunds;
    const sold = eventSold(ev);
    const check = eventCheckins(ev);
    const att = sold ? Math.round((check/sold)*100) : 0;
    rows.push([ev.id, ev.name, ev.status||"", ev.date||"", ev.venue||"", gross, refunds, net, sold, check, att]);
  }
  downloadText(`all-events-finance-summary.csv`, toCSV(rows));
  toast("Export ready", "All-events finance summary CSV downloaded.");
}

function createEventModal(){
  const p = "new";
  openModal({
    title:"Create Event",
    desc:"Create a new event workspace. Status starts as Draft.",
    bodyHtml: `
      <div class="grid cols2">
        <div class="field" style="grid-column:1/-1">
          <label>Event name</label>
          <div class="input"><input id="mEvName_${p}" placeholder="AFCON Nights — Quarter Finals"></div>
        </div>

        <div class="field">
          <label>Date</label>
          <div class="input"><input id="mEvDate_${p}" type="date"></div>
        </div>

        <div class="field">
          <label>Start time</label>
          <div class="input"><input id="mEvTime_${p}" type="time" value="19:00"></div>
        </div>

        <div class="field" style="grid-column:1/-1">
          <label>Venue</label>
          <div class="input"><input id="mEvVenue_${p}" placeholder="Cairo International Stadium"></div>
        </div>

        <div class="field" style="grid-column:1/-1">
          <label>Location (address / landmark)</label>
          <div class="input"><input id="mEvLocation_${p}" placeholder="Street, area, city..."></div>
          <div class="hint">This will be shown to customers. Clicking it opens Maps.</div>
        </div>

        <div class="field" style="grid-column:1/-1">
          <label>Location URL (Google Maps / website)</label>
          <div class="input"><input id="mEvLocationUrl_${p}" placeholder="https://..."></div>
          <div class="hint">If provided, customer app will open this exact link instead of auto-generated Maps search.</div>
        </div>
      </div>
      <div class="hr"></div>
      <div class="hint"><b>Event ID:</b> generated automatically from name + venue + date.</div>
    `,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label:"Create event", kind:"primary", onClick: ()=>{
        const name = ($("#mEvName_"+p)?.value || "").trim();
        const date = ($("#mEvDate_"+p)?.value || "").trim();
        const time = ($("#mEvTime_"+p)?.value || "").trim();
        const venue = ($("#mEvVenue_"+p)?.value || "").trim();
        const locationText = ($("#mEvLocation_"+p)?.value || "").trim();
        const locationUrl = ($("#mEvLocationUrl_"+p)?.value || "").trim();

        if(!name) return toast("Missing info","Event name is required.","warn");
        if(!date) return toast("Missing info","Event date is required.","warn");
        if(!venue) return toast("Missing info","Venue is required.","warn");

        const evId = slugId(`${name}-${venue}-${date}`).slice(0,60) || uid8();
        const ev = {
          id: evId,
          ownerUid: auth?.currentUser?.uid || "",
          name,
          date,
          time,
          venue,
          locationText,
          locationUrl,
          status: "Draft",
          capacity: 0,
          currency: "EGP",
          createdAt: nowISO(),
          updatedAt: nowISO(),
          tiers: [],
          waves: [],
          gates: [{id:"G-A", name:"Gate A", notes:"Main entrance"}],
          staff: [],
          orders: [],
          attendees: [],
          incidents: [],
          activity: [],
          design: {
            bannerDataUrl:"", logoDataUrl:"", bgDataUrl:"",
            primary:"#2563eb", accent:"#16a34a",
            fontFamily:"Montserrat", textColor:"#0f172a",
            headline:"Your ticket is ready",
            emailText:"Thanks for joining us. Show this QR code at the gate to check in.",
            published:false, updatedAt: nowISO()
          },
          webhookUrl:""
        };

        addActivity(ev, "Event created", `Draft • ${name}`, "ok");
        data.events.unshift(ev);
        saveData();
        closeModal();
        toast("Event created", "Open the workspace to continue setup.");
        renderAll();
      }}
    ]
  });
}
function editEventModal(eventId){
  const ev = data.events.find(e=>e.id===eventId);
  if(!ev) return;

  const p = "edit";
  openModal({
    title:"Edit Event",
    desc:"Update basic event details.",
    bodyHtml: `
      <div class="grid cols2">
        <div class="field" style="grid-column:1/-1">
          <label>Event name</label>
          <div class="input"><input id="mEvName_${p}" value="${escapeHtml(ev.name)}"></div>
        </div>

        <div class="field">
          <label>Date</label>
          <div class="input"><input id="mEvDate_${p}" type="date" value="${escapeHtml(ev.date)}"></div>
        </div>

        <div class="field">
          <label>Start time</label>
          <div class="input"><input id="mEvTime_${p}" type="time" value="${escapeHtml(ev.time||"")}"></div>
        </div>

        <div class="field" style="grid-column:1/-1">
          <label>Venue</label>
          <div class="input"><input id="mEvVenue_${p}" value="${escapeHtml(ev.venue)}"></div>
        </div>

        <div class="field" style="grid-column:1/-1">
          <label>Location (address / landmark)</label>
          <div class="input"><input id="mEvLocation_${p}" value="${escapeHtml(ev.locationText||"")}"></div>
          <div class="hint">Shown to customers. Clicking it opens Maps.</div>
        </div>

        <div class="field" style="grid-column:1/-1">
          <label>Location URL (Google Maps / website)</label>
          <div class="input"><input id="mEvLocationUrl_${p}" value="${escapeHtml(ev.locationUrl||"")}" placeholder="https://..."></div>
          <div class="hint">If provided, customer app will open this exact link.</div>
        </div>
      </div>
      <div class="hr"></div>
      <div class="hint"><b>Status</b> is controlled from the Overview tab (Draft → On Sale → Live → Ended).</div>
    `,
    footButtons: [
      {label:"Cancel", kind:"ghost", onClick: closeModal},
      {label:"Save changes", kind:"primary", onClick: ()=>{
        const before = { name: ev.name, date: ev.date, time: ev.time||"", venue: ev.venue, locationText: ev.locationText||"" };

        const name = ($("#mEvName_"+p)?.value || "").trim();
        const date = ($("#mEvDate_"+p)?.value || "").trim();
        const time = ($("#mEvTime_"+p)?.value || "").trim();
        const venue = ($("#mEvVenue_"+p)?.value || "").trim();
        const locationText = ($("#mEvLocation_"+p)?.value || "").trim();
        const locationUrl = ($("#mEvLocationUrl_"+p)?.value || "").trim();

        if(!name) return toast("Missing info","Event name is required.","warn");
        if(!date) return toast("Missing info","Event date is required.","warn");
        if(!venue) return toast("Missing info","Venue is required.","warn");

        ev.name = name;
        ev.date = date;
        ev.time = time;
        ev.venue = venue;
        ev.locationText = locationText;
        ev.locationUrl = locationUrl;

        const changes = [];
        if(before.name!==name) changes.push(`Name: ${before.name} → ${name}`);
        if(before.date!==date) changes.push(`Date: ${before.date} → ${date}`);
        if(before.time!==time) changes.push(`Time: ${before.time||"—"} → ${time||"—"}`);
        if(before.venue!==venue) changes.push(`Venue: ${before.venue} → ${venue}`);
        if(before.locationText!==locationText) changes.push(`Location updated`);

        const meta = (changes.join(" • ").slice(0,120)) || "Details updated";
        addActivity(ev, "Event updated", meta, "info");

        saveData();
        schedulePublicSync(ev, "edit-basic");
        closeModal();
        toast("Event updated", "Changes saved.");
        renderAll();
      }}
    ]
  });
}
function deleteEventModal(eventId){
  const ev = data.events.find(e=>e.id===eventId);
  if(!ev) return;

  confirmModal({
    title:"Delete Event",
    desc:`Delete "${ev.name}"? This removes the entire workspace and its data.`,
    danger:true,
    actionLabel:"Delete event",
    onConfirm: async ()=>{
      await deleteEventFromFirebase(ev);
      data.events = data.events.filter(e=>e.id!==eventId);
      saveData();
      toast("Event deleted", ev.name);
      if(state.activeEventId===eventId){
        state.activeEventId = null;
        setRoute("hub");
      }
      renderAll();
    }
  });
}

async function deleteEventFromFirebase(ev){
  if(!window.__firebaseReady || !db || !deleteDoc || !getDocs) return;

  const collections = [
    publicEventStaffCol(ev.id),
    publicEventInvitesCol(ev.id),
    publicEventOrdersCol(ev.id),
    publicEventScanLogsCol(ev.id)
  ];

  const deletions = [];

  for(const colRef of collections){
    try{
      const snap = await getDocs(colRef);
      snap.forEach((docSnap)=> deletions.push(deleteDoc(docSnap.ref)));
    }catch(err){
      console.warn("Failed to delete subcollection documents", err);
    }
  }

  deletions.push(deleteDoc(publicEventRef(ev.id)));

  await Promise.allSettled(deletions);
}

function duplicateEvent(eventId){
  const ev = data.events.find(e=>e.id===eventId);
  if(!ev) return;

  const copy = JSON.parse(JSON.stringify(ev));
  copy.id = uid("EVT-");
  copy.name = `${ev.name} (Copy)`;
  copy.status = "Draft";
  copy.activity = [];
  copy.incidents = [];
  addActivity(copy, "Event duplicated", `From ${ev.id}`, "info");
  data.events.unshift(copy);
  saveData();
  toast("Event duplicated", "A draft copy was created.");
  renderAll();
}

/* ---------- Header/Sidebar wiring ---------- */


// Status dropdown handler (Top + Overview)
async function onOverviewStatusChange(e){
  const sel = e?.target;
  const ev = currentEvent();
  if(!sel || !ev) return;

  // Viewer mode: block change and revert UI
  if(isReadOnly()){
    sel.value = ev.status || "Draft";
    return;
  }

  const newStatus = sel.value;
  const oldStatus = ev.status || "Draft";

  try{
    // Confirm end
    if(newStatus === "Ended"){
      const ok = confirm("Are you sure you want to end this event? This usually stops ticket sales and check-ins.");
      if(!ok){ sel.value = oldStatus; return; }
    }

    // Guard: Live only on/after event date
    if(newStatus === "Live"){
      const today = (()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
      if(ev.date && ev.date > today){
        toast("Too early","Live is available on (or after) the event date.");
        sel.value = oldStatus;
        return;
      }
      if(oldStatus === "Ended"){
        toast("Ended","This event already ended.");
        sel.value = oldStatus;
        return;
      }
    }

    // Update local
    ev.status = newStatus;

    // Keep both status dropdowns in sync (and styled)
    [$("#ovStatusSelectTop"), $("#ovStatusSelectOverview")].filter(Boolean).forEach(s=>{
      s.value = newStatus;
      s.disabled = isReadOnly();
      s.classList.remove("status-draft","status-on-sale","status-live","status-ended");
      s.classList.add(
        newStatus==="Live" ? "status-live" :
        newStatus==="On Sale" ? "status-on-sale" :
        newStatus==="Ended" ? "status-ended" : "status-draft"
      );
    });

    // Publish to customer marketplace store (best-effort)
    try{ await syncEventToPublic(ev); }catch(err){ console.error(err); }

    addActivity(ev, "Status Changed", `Manually changed from ${oldStatus} to ${newStatus}`, "info");
    saveData();

    // Persist (optional)
    if(window.__firebaseReady && db){
      const eventRef = doc(db, "events", ev.id);
      await updateDoc(eventRef, { status: newStatus });
    }

    toast("Status Updated", `Event is now ${newStatus}`);
    renderEventWorkspace();
    renderHub();
  }catch(err){
    console.error("Update failed", err);
    toast("Error", "Failed to update status.");
    ev.status = oldStatus;
    sel.value = oldStatus;
    saveData();
  }
}


function wireDashboardUI(){
  // Click logo -> Home (Events Hub)
  on("#brandHome","click", ()=> goRoute("hub"));

  // Sidebar toggle
    on("#btnTopEventSettings","click", ()=>{ const ev=currentEvent(); if(!ev) return; switchTab("settings"); renderEventWorkspace(); });

on("#btnToggleSide","click", ()=>{
    document.getElementById("sidebar")?.classList.toggle("collapsed");
  });

  // Status dropdown(s) (wire ONCE)
  const statusSelects = [document.getElementById("ovStatusSelectTop"), document.getElementById("ovStatusSelectOverview")].filter(Boolean);
  statusSelects.forEach(sel=>{
    if(sel.__wiredChange) return;
    sel.__wiredChange = true;
    sel.addEventListener("change", onOverviewStatusChange);
  });

  // nav
  document.querySelectorAll(".navItem").forEach(item=>{
    item.addEventListener("click", ()=>{
      const r = item.dataset.route;
      if(!r) return;
      if(r==="workspace") setRoute("workspace");
      else if(r==="hub") setRoute("hub");
      else if(r==="notifications") setRoute("notifications");
      else if(r==="analytics") setRoute("analytics");
      else if(r==="settings") setRoute("settings");
      else setRoute("hub");
    });
  });
  on("#btnOpenSettings","click", ()=>{
    setRoute("settings");
    document.getElementById("menuPanel")?.classList.remove("open");
  });
  on("#btnSettingsSignout","click", appSignOut);

  // create event
  on("#btnCreateEvent","click", ()=> !isReadOnly() ? createEventModal() : toast("Read-only mode","Switch to Owner to create events."));
  on("#btnCreateEvent2","click", ()=> !isReadOnly() ? createEventModal() : toast("Read-only mode","Switch to Owner to create events."));

  // hub filters
  ["hubStatus","hubVenue","hubDateFrom","hubDateTo"].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("input", renderHub);
    el.addEventListener("change", renderHub);
  });
  on("#hubClear","click", ()=>{
    const a = document.getElementById("hubStatus"); if(a) a.value="";
    const b = document.getElementById("hubVenue"); if(b) b.value="";
    const c = document.getElementById("hubDateFrom"); if(c) c.value="";
    const d = document.getElementById("hubDateTo"); if(d) d.value="";
    renderHub();
  });

  // workspace picker
  on("#btnOpenWS","click", ()=>{
    const sel = document.getElementById("wsSelect");
    const id = sel?.value;
    if(id) openEventWorkspace(id);
  });

  // menu
  on("#avatarBtn","click", ()=>{
    document.getElementById("menuPanel")?.classList.toggle("open");
  });
  document.addEventListener("click", (e)=>{
    if(!e.target.closest(".menu")) document.getElementById("menuPanel")?.classList.remove("open");
  });

  
  
  on("#viewAs","change", ()=>{
    state.viewAs = document.getElementById("viewAs")?.value || "Owner";
    saveAuth();
    renderTopIdentity();
    renderAll();
    toast("View mode changed", state.viewAs==="Viewer" ? "Viewer mode is read-only." : "Owner mode enabled.");
  });

  
  // Settings (Event Settings tab)
  on("#btnSaveSettings","click", async ()=>{
    const ev = currentEvent();
    if(!ev || isReadOnly()) return;
    const before = { desc: ev.desc||"", locationText: ev.locationText||"", locationUrl: ev.locationUrl||"" };
    ev.desc = $("#setEventDesc")?.value?.trim() || "";
    ev.locationText = $("#setLocationText")?.value?.trim() || "";
    ev.locationUrl = $("#setLocationUrl")?.value?.trim() || "";

    const changes = [];
    if(before.desc!==ev.desc) changes.push("Description updated");
    if(before.locationText!==ev.locationText) changes.push("Location updated");
    if(before.locationUrl!==ev.locationUrl) changes.push("Location URL updated");

    if(changes.length){
      addActivity(ev, "Event updated", changes.join(" • ").slice(0,120), "info");
      saveData();
      schedulePublicSync(ev, "edit-settings");
      renderEventWorkspace();
      toast("Saved", "Event settings updated.");
    }else{
      toast("No changes", "Nothing to save.");
    }
  });

  // exports
  on("#btnExportOrders","click", ()=>{ const ev=currentEvent(); if(ev) exportOrders(ev); });
  on("#btnExportAtt","click", ()=>{ const ev=currentEvent(); if(ev) exportAttendees(ev, false); });
  on("#btnExportCheckins","click", ()=>{ const ev=currentEvent(); if(ev) exportAttendees(ev, true); });
  on("#btnExportFinance","click", ()=>{ const ev=currentEvent(); if(ev) exportFinance(ev); });
  on("#btnExportFinance2","click", ()=>{ const ev=currentEvent(); if(ev) exportFinance(ev); });
  on("#btnExportIncidents","click", ()=>{ const ev=currentEvent(); if(ev) exportIncidents(ev); });
  on("#btnExportAllFinance","click", ()=> exportAllFinance());




// global search
  on("#globalSearch","input", ()=>{
    if(state.route==="hub") renderSearchResults();
    if(state.route==="event"){
      const ev = currentEvent();
      if(!ev) return;
      if(state.activeTab==="orders") renderOrdersTable(ev);
      if(state.activeTab==="customers") renderAttendeesTable(ev);
    }
  });

  // drawer & modal close
  on("#drawerClose","click", closeDrawer);
  on("#drawerOverlay","click", (e)=>{ if(e.target.id==="drawerOverlay") closeDrawer(); });
  on("#modalClose","click", closeModal);
  on("#modalOverlay","click", (e)=>{ if(e.target.id==="modalOverlay") closeModal(); });

  // event workspace controls
  on("#btnBackHub","click", ()=> setRoute("hub"));
  on("#btnEditEvent","click", ()=> {
    const ev = currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    editEventModal(ev.id);
  });
  on("#btnDuplicateEvent","click", ()=> {
    const ev = currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    duplicateEvent(ev.id);
  });
  on("#btnDeleteEvent","click", ()=> {
    const ev = currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    deleteEventModal(ev.id);
  });

  // status controls (Overview buttons)
  on("#btnSetOnSale","click", async ()=>{
    const ev = currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    if(ev.status!=="Draft"){ toast("Not allowed","Only Draft events can be set On Sale."); return; }

    ev.status = "On Sale";
    addActivity(ev, "Status changed", "Draft → On Sale", "info");
    saveData();

    try{ await syncEventToPublic(ev); }catch(err){ console.error(err); }

    renderEventWorkspace();
    renderHub();
    toast("On Sale", "Event is now On Sale.");
  });

  on("#btnGoLive","click", async ()=>{
    const ev = currentEvent(); if(!ev) return;
    if(isReadOnly()) return;

    const today = (()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })();
    if(ev.date && ev.date > today){ toast("Too early","Live is available on (or after) the event date."); return; }
    if(ev.status==="Ended"){ toast("Ended","This event already ended."); return; }

    ev.status = "Live";
    addActivity(ev, "Status changed", `${statusText("On Sale")} → Live`, "ok");
    saveData();

    try{ await syncEventToPublic(ev); }catch(err){ console.error(err); }

    renderEventWorkspace();
    renderHub();
    toast("Live", "Event is now Live.");
  });

  on("#btnEndEvent","click", async ()=>{
    const ev = currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    if(ev.status==="Ended"){ toast("Already ended",""); return; }

    const prev = ev.status || "Draft";
    ev.status = "Ended";
    addActivity(ev, "Status changed", `${statusText(prev)} → Ended`, "warn");
    saveData();

    try{ await syncEventToPublic(ev); }catch(err){ console.error(err); }

    renderEventWorkspace();
    renderHub();
    toast("Ended", "Event marked as ended.");
  });

  // subtabs
  document.querySelectorAll("#subTabs .subTab").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll("#subTabs .subTab").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      switchTab(b.dataset.tab);
      renderEventWorkspace();
      if(b.dataset.tab==="automation"){
        const ev = currentEvent(); if(ev) renderAutomation(ev);
      }
    });
  });

  // ticketing add buttons
  on("#btnAddTier","click", ()=> {
    const ev = currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    tierModal(ev.id, null);
  });
  on("#btnAddWave","click", ()=> {
    const ev = currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    if(ev.tiers.length===0){ toast("Add tiers first","Create tiers before adding waves."); return; }
    waveModal(ev.id, null);
  });

  // orders filters
  ["ordFrom","ordTo","ordWave","ordTier","ordStatus"].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("change", ()=>{
      const ev = currentEvent(); if(!ev) return;
      renderOrdersTable(ev);
    });
  });
  on("#ordClear","click", ()=>{
    ["ordFrom","ordTo","ordWave","ordTier","ordStatus"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.value="";
    });
    const ev = currentEvent(); if(ev) renderOrdersTable(ev);
  });

  // customer filters
  ["attSearch","attStatus","attWave","attTier"].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("input", ()=>{ const ev=currentEvent(); if(ev) renderAttendeesTable(ev); });
    el.addEventListener("change", ()=>{ const ev=currentEvent(); if(ev) renderAttendeesTable(ev); });
  });
  on("#attClear","click", ()=>{
    ["attSearch","attStatus","attWave","attTier"].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.value="";
    });
    const ev=currentEvent(); if(ev) renderAttendeesTable(ev);
  });
  on("#btnInviteGuest","click", ()=>{
    const ev = currentEvent();
    if(!ev) return;
    openInviteGuestModal(ev);
  });

  // gates / staff add
  on("#btnAddGate","click", ()=> {
    const ev=currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    gateModal(ev.id, null);
  });
  on("#btnAddStaff","click", ()=> {
    const ev=currentEvent(); if(!ev) return;
    if(isReadOnly()) return;
    staffModal(ev.id, null);
  });

  // links copy
  on("#copyUsher","click", ()=> copyText(document.getElementById("linkUsher")?.value || "", "Usher link copied"));
  on("#copyTeam","click", ()=> copyText(document.getElementById("linkTeam")?.value || "", "Team link copied"));
  on("#copyDesk","click", ()=> copyText(document.getElementById("linkDesk")?.value || "", "Manual Desk link copied"));

  // attention page clear
  on("#btnClearAttention","click", ()=>{
    state.attentionFeed = [];
    renderAttentionPage();
    toast("Feed cleared","Attention feed cleared.");
  });

}

async function copyText(text, okMsg){
  try{
    await navigator.clipboard.writeText(text);
    toast(okMsg, text);
  }catch(e){
    downloadText("copied-link.txt", text);
    toast(okMsg, "Clipboard unavailable — downloaded as a text file.");
  }
}

/* ---------- Live simulation ---------- */

function simulateTick(){
  if(!state.simulateOn) return;

  // pick a random event (prefer Live or On Sale)
  const candidates = data.events.filter(e=>e.status==="Live" || e.status==="On Sale");
  const ev = (candidates.length ? candidates : data.events)[Math.floor(Math.random()*data.events.length)];
  if(!ev) return;

  const r = Math.random();

  if(r < 0.45){
    // simulate check-in
    const notIn = ev.attendees.filter(a=>a.status==="Not checked-in");
    if(notIn.length===0) return;
    const a = notIn[Math.floor(Math.random()*notIn.length)];
    const gate = ev.gates[Math.floor(Math.random()*ev.gates.length)];
    a.status = "Checked-in";
    a.checkinTime = new Date().toISOString();
    a.gateId = gate?.id || "";
    a.gateName = gate?.name || "";
    addActivity(ev, `${a.name} checked in`, `${a.gateName} — ${fmtTime(new Date())}`, "ok");
  }else if(r < 0.70){
    // simulate denied scan at a random gate
    const gate = ev.gates[Math.floor(Math.random()*ev.gates.length)];
    addIncident(ev, gate?.name || "Gate", ev.staff?.[0]?.username || "usher", "—", "Denied entry", "Invalid or already-used ticket.");
    state.attentionFeed.unshift({ title:`Denied entries at ${gate?.name||"Gate"}`, meta:`${ev.name} — review gate flow`, type:"warn" });
  }else{
    // simulate fraud blocked
    const gate = ev.gates[Math.floor(Math.random()*ev.gates.length)];
    addIncident(ev, gate?.name || "Gate", ev.staff?.[0]?.username || "usher", "—", "Blocked duplicate attempt", "Duplicate scan attempt blocked.");
    state.attentionFeed.unshift({ title:`Fraud attempt blocked`, meta:`${ev.name} — ${gate?.name||"Gate"}`, type:"warn" });
  }

  // keep lists from growing too much
  ev.activity = (ev.activity||[]).slice(0,80);
  ev.incidents = (ev.incidents||[]).slice(0,220);
  state.attentionFeed = state.attentionFeed.slice(0,30);

  saveData();

  // refresh current views
  if(state.route==="event" && state.activeEventId===ev.id){
    renderEventWorkspace();
  }
  if(state.route==="notifications") renderAttentionPage();
  if(state.route==="hub") renderHub();
  if(state.route==="analytics") renderAllAnalytics();
}







/* ---------- Boot ---------- */


async function bootDashboard({ force = false } = {}){
  if(state.__booted && !force) return;
  state.__booted = true;
  state.__bootedUid = auth?.currentUser?.uid || null;
  // Defensive: the DOM might not contain these sections in some deployments
  document.getElementById("auth")?.classList.add("hidden");
  document.getElementById("dash")?.classList.remove("hidden");
  // sync user labels
  const name = state.user?.name || "Owner";
  const email = state.user?.email || "—";
  if($("#avaName")) $("#avaName").textContent = name;
  if($("#menuName")) $("#menuName").textContent = name;
  if($("#pfMini")) $("#pfMini").textContent = name;
  if($("#avaEmail")) $("#avaEmail").textContent = email;
  if($("#menuEmail")) $("#menuEmail").textContent = email;
  const initials = (name.split(/\s+/).slice(0,2).map(x=>x[0]).join("")||"LU").toUpperCase();
  if($("#avaInitials")) $("#avaInitials").textContent = initials;
  if($("#avaInitials2")) $("#avaInitials2").textContent = initials;

  // Load data (Firestore if signed-in; local fallback)
  try{
    data = ensureDataShape(await loadData());
    await hydrateAllOrders();
  }catch(err){
    console.error(err);
    toast("Load failed", "Could not load your data. Using local fallback.");
    data = ensureDataShape(defaultData());
  }

  const uid = auth?.currentUser?.uid;
  if(uid){
    data.events = (data.events || []).filter(ev=>!ev.ownerUid || ev.ownerUid === uid);
  }

  // Restore last route (hash takes priority)
  const savedNav = loadNavState(auth?.currentUser?.uid);
  if(location.hash){
    __applyHash();
  }else if(savedNav?.route){
    state.route = savedNav.route;
    state.activeEventId = savedNav.activeEventId || null;
    state.activeTab = savedNav.activeTab || "overview";
    setRoute(state.route, { noHash:true });
  }else{
    state.route = "hub";
    state.activeEventId = null;
    state.activeTab = "overview";
    setRoute("hub", { noHash:true });
  }

  // Wire UI handlers once
  if(!state.uiWired){
    try{ wireDashboardUI(); }catch(e){ console.error(e); }
    state.uiWired = true;
  }
  if(!state.__hashWired){
    window.addEventListener("hashchange", __applyHash);
    state.__hashWired = true;
  }
  render();
}


async function start(){
  authInit();
  loadAuth();
  // Defensive: if sections are missing (or replaced by another index shell), avoid crashing.
  document.getElementById("auth")?.classList.add("hidden");
  document.getElementById("dash")?.classList.add("hidden");
  await initFirebase();
  const authUser = await waitForAuthReady();
  await ensureAuthListener();
  if(authUser){
    state.user = {
      name: authUser.displayName || state.user?.name || "Owner",
      email: authUser.email || state.user?.email || ""
    };
    if(!state.viewAs) state.viewAs = "Owner";
    saveAuth();
    await bootDashboard({ force: true });
    document.getElementById("auth")?.classList.add("hidden");
    document.getElementById("dash")?.classList.remove("hidden");
  }else{
    document.getElementById("auth")?.classList.remove("hidden");
    setAuthTab("signin");
  }
}

function handleGlobalError(){
  if(auth?.currentUser || state.user){
    toast("Something went wrong", "We hit a temporary error. Please refresh if something looks off.");
    return;
  }
  document.getElementById("auth")?.classList.remove("hidden");
  document.getElementById("dash")?.classList.add("hidden");
}
window.addEventListener("error", handleGlobalError);
window.addEventListener("unhandledrejection", handleGlobalError);
/* ---------- Misc buttons for hub/workspace ---------- */

$("#btnCreateEvent2")?.addEventListener?.("click", ()=>{});

/* ---------- Misc page hooks ---------- */

$("#btnClearAttention")?.addEventListener?.("click", ()=>{});

/* ---------- Event buttons on event page ---------- */

$("#btnBackHub")?.addEventListener?.("click", ()=>{});

/* ---------- Tab switch helper ---------- */

function wireEventButtons(){
  // already wired in wireDashboardUI()
}

/* ---------- Orders/customers rerender on tab changes ---------- */

function renderOrdersTableSafe(){
  const ev = currentEvent(); if(ev) renderOrdersTable(ev);
}
function renderAttendeesTableSafe(){
  const ev = currentEvent(); if(ev) renderAttendeesTable(ev);
}

/* ---------- Links & exports & buttons ---------- */

function wireCopyButtons(){
  // already wired
}

/* ---------- Orders/Attendees initial filter option refresh when event changes ---------- */
function resetEventFilterSelects(){
  // Clear select options so they can refill per event
  ["ordWave","ordTier","attWave","attTier"].forEach(id=>{
    const el = $("#"+id);
    if(el) el.innerHTML = "";
  });
}

/* ---------- Event switching support (when opening different events) ---------- */
function onEventChanged(){
  resetEventFilterSelects();
}

/* ---------- Hook into openEventWorkspace ---------- */
const _openEventWorkspace = openEventWorkspace;
openEventWorkspace = function(eventId){
  state.activeEventId = eventId;
  onEventChanged();
  _openEventWorkspace(eventId);
};

/* ---------- Orders filters reset button ---------- */

$("#ordClear")?.addEventListener?.("click", ()=>{});

/* ---------- Start ---------- */
window.addEventListener('DOMContentLoaded', start);
