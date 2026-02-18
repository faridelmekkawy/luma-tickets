/******************************************************************
   * 1) FIREBASE IMPORTS
   ******************************************************************/
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
  import {
    getFirestore, doc, getDoc, collection, query, where, limit,
    getDocs, updateDoc, addDoc, serverTimestamp
  } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
  /******************************************************************
   * 2) CONFIG — PASTE YOUR FIREBASE CONFIG HERE
   ******************************************************************/
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

  /******************************************************************
   * 3) STATE
   ******************************************************************/
  const state = {
    eventId: null,
    event: null,
    staff: null,          // {id, username, gateName}
    scanning: false,
    verifying: false,
    lastScanAt: 0,
    scannedTicketId: null,
    scannedCodeDoc: null, // ticket-codes doc data
    scannedOrderDoc: null,// orders doc data
    digits: "",
    scanMode: "camera" // camera | hardware | wedge
  };

  const debugState = {
    enabled: false,
    lastRaw: "—",
    lastTicketId: "—",
    lastError: "—",
    cameraLabel: "—"
  };

  /******************************************************************
   * 4) HELPERS
   ******************************************************************/
  const $ = (id) => document.getElementById(id);
  const nowMs = () => Date.now();

  function getParam(name){
    const u = new URL(location.href);
    return u.searchParams.get(name);
  }

  function resolveScanMode(){
    const rawMode = (getParam("scan") || "").toLowerCase();
    if(rawMode === "camera") return "camera";
    if(rawMode === "wedge") return "wedge";
    if(["hardware", "native", "urovo", "intent"].includes(rawMode)) return "hardware";
    if(window.LumaNativeScanner?.startScan || window.NativeScanner?.startScan || window.UROVOScanner?.startScan){
      return "hardware";
    }
    return "camera";
  }

  function getNativeScanner(){
    return (
      window.LumaNativeScanner ||
      window.NativeScanner ||
      window.UROVOScanner ||
      window.Capacitor?.Plugins?.LumaNativeScanner ||
      null
    );
  }

  function fmtTime(d){
    try{
      return new Intl.DateTimeFormat(undefined, {dateStyle:"medium", timeStyle:"short"}).format(d);
    }catch{
      return d.toLocaleString();
    }
  }

  function setOnlineUI(){
    const online = navigator.onLine;
    $("netDot").classList.toggle("ok", online);
    $("netDot").classList.toggle("bad", !online);
    $("netText").textContent = online ? "Online" : "Offline";
  }

  function setDigitsUI(){
    const len = state.digits.length;
    const masked = (state.digits + "____").slice(0,4);
    // show digits but not phone-derived digits; this is what usher typed.
    $("digitsDisplay").textContent = masked.replaceAll("", "").split("").join("");
    $("btnVerify").disabled = !(state.scannedTicketId && len === 4 && !state.verifying);
  }

  function clearDigits(){
    state.digits = "";
    setDigitsUI();
  }

  function setVerifyCardVisible(show){
    $("verifyModal").classList.toggle("hidden", !show);
  }

  function setScanMeta({name, tier}){
    $("scanName").textContent = name || "—";
    $("scanTier").textContent = tier || "—";
  }

  function resolveTierName(tierId, tierName){
    if(tierName) return tierName;
    if(!tierId) return "—";
    const tiers = state.event?.tiers || [];
    return tiers.find(t => t.id === tierId)?.name || tierId;
  }

  function hardResetForNextScan(){
    state.scannedTicketId = null;
    state.scannedCodeDoc = null;
    state.scannedOrderDoc = null;
    clearDigits();
    setScanMeta({name:"—", tier:"—"});
    refreshScanHints();
    setVerifyCardVisible(false);
    setVerifying(false);
    $("btnVerify").disabled = true;
    const manualInput = $("manualTicketInput");
    if(manualInput) manualInput.value = "";
    focusWedgeInput();
  }

  function setHint(show){
    $("scanHint").classList.toggle("hidden", !show);
  }

  function setHardwareHint(show){
    $("hardwareHint").classList.toggle("hidden", !show);
  }

  function refreshScanHints(){
    const isCamera = state.scanMode === "camera";
    setHint(isCamera);
    setHardwareHint(!isCamera);
  }

  function focusWedgeInput(){
    if(state.scanMode === "camera") return;
    const wedgeInput = $("wedgeInput");
    if(!wedgeInput) return;
    wedgeInput.focus();
  }

  function setScanStatus(message, isError = false){
    const statusEl = $("scanStatus");
    if(!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
  }

  function submitManualEntry(){
    if(state.verifying) return;
    if(state.scannedTicketId) return;
    const input = $("manualTicketInput");
    if(!input) return;
    const value = input.value.trim();
    if(!value){
      setScanStatus("Enter a ticket code to continue.", true);
      input.focus();
      return;
    }
    handleDecodedText(value, "manual");
    input.value = "";
    if(state.scannedTicketId){
      setScanStatus("Code entered. Verify the last 4 digits.");
    }
  }

  function setDebugVisible(show){
    const panel = $("scanDebug");
    if(!panel) return;
    panel.classList.toggle("hidden", !show);
  }

  function setDebugValue(id, value){
    const el = $(id);
    if(!el) return;
    el.textContent = value || "—";
  }

  function updateDebugPanel(){
    if(!debugState.enabled) return;
    setDebugValue("dbgSecure", window.isSecureContext ? "yes" : "no");
    setDebugValue("dbgScanning", state.scanning ? "active" : "stopped");
    setDebugValue("dbgVerifying", state.verifying ? "yes" : "no");
    setDebugValue("dbgCamera", debugState.cameraLabel || "—");
    setDebugValue("dbgLastRaw", debugState.lastRaw || "—");
    setDebugValue("dbgTicketId", debugState.lastTicketId || "—");
    setDebugValue("dbgLastError", debugState.lastError || "—");
  }

  function setVerifying(value){
    state.verifying = value;
    updateDebugPanel();
  }

  function applyScanMode(){
    const isCamera = state.scanMode === "camera";
    const hardwareAvailable = Boolean(getNativeScanner()) || state.scanMode !== "camera";
    $("cameraControl").classList.toggle("hidden", !isCamera);
    $("restartControl").classList.toggle("hidden", !isCamera);
    $("hardwareControl").classList.toggle("hidden", !isCamera || !hardwareAvailable);
    refreshScanHints();

    if(!isCamera){
      stopScanner();
      $("scanStatus").textContent = "Hardware scanner ready.";
    }
  }

  function handleDecodedText(decodedText, source = "camera"){
    if(state.verifying) return;
    if(!decodedText) return;

    debugState.lastRaw = decodedText || "—";

    const t = nowMs();
    if(t - state.lastScanAt < 900) return;
    state.lastScanAt = t;

    const ticketId = parseTicketIdFromQR(decodedText);
    debugState.lastTicketId = ticketId || "—";
    debugState.lastError = ticketId ? "—" : "Could not parse ticketId";
    debugState.cameraLabel = source === "camera" ? (debugState.cameraLabel || "Camera") : source;
    updateDebugPanel();
    if(!ticketId) return;
    if(state.scannedTicketId) return;

    state.scannedTicketId = ticketId;
    setHint(false);
    setHardwareHint(false);
    setVerifyCardVisible(true);
    setDigitsUI();
    loadScanPreview(ticketId);
  }

  async function requestHardwareScan(){
    const scanner = getNativeScanner();
    if(scanner?.startScan){
      try{
        await scanner.startScan();
        return;
      }catch(e){
        setScanStatus(e?.message || "Unable to start hardware scan.", true);
        return;
      }
    }
    setScanStatus("Hardware scanner not available.", true);
  }

  function initNativeScanner(){
    const scanner = getNativeScanner();
    if(!scanner) return;
    if(scanner.addListener){
      scanner.addListener("scan", (payload) => {
        handleDecodedText(payload?.value || payload?.text || "", "hardware");
      });
    }
  }

  function showResult({ok, reason, customerName, tierId, tierName, waveId, gateName, when, usedWhereWhen}){
    const overlay = $("resultOverlay");
    overlay.style.display = "flex";

    $("resultCard").className = "resultCard";
    $("resultTop").className = "resultTop " + (ok ? "okBg" : "badBg");
    $("resultBig").textContent = ok ? "APPROVED" : "DENIED";
    $("resultSub").textContent = ok ? "Entry Locked" : (reason || "Not Allowed");

    $("rCustomer").textContent = customerName || "—";
    $("rTier").textContent = resolveTierName(tierId, tierName);
    $("rWave").textContent = waveId || "—";
    $("rGate").textContent = gateName || "—";
    $("rTime").textContent = when ? fmtTime(when) : "—";

    // If already used, we show where/when used
    if(!ok && usedWhereWhen){
      $("rGate").textContent = usedWhereWhen.gate || gateName || "—";
      $("rTime").textContent = usedWhereWhen.time ? fmtTime(usedWhereWhen.time) : $("rTime").textContent;
      $("rTier").textContent = resolveTierName(tierId, tierName);
      $("rWave").textContent = waveId || "—";
      $("rCustomer").textContent = customerName || "—";
      $("resultSub").textContent = `Already checked-in`;
    }
  }

  function closeResult(){
    $("resultOverlay").style.display = "none";
  }

  /******************************************************************
   * 5) FIRESTORE: STAFF LOGIN
   ******************************************************************/
  async function staffLogin(eventId, username, pin){
    // Expected path: events/{eventId}/staff
    // Staff doc fields: username, pin, gateName, active
    const staffCol = collection(db, "events", eventId, "staff");
    const qy = query(staffCol, where("username", "==", username), limit(1));
    const snap = await getDocs(qy);
    if(snap.empty) return {ok:false, reason:"Invalid credentials"};

    const docSnap = snap.docs[0];
    const data = docSnap.data() || {};

    if(data.active === false) return {ok:false, reason:"Staff account disabled"};
    // NOTE: Replace this with hashed PIN in production.
    if(String(data.pin || "") !== String(pin || "")) return {ok:false, reason:"Invalid credentials"};

    return {
      ok:true,
      staff: {
        id: docSnap.id,
        username: data.username,
        gateName: data.gateName || "Gate"
      }
    };
  }

  /******************************************************************
   * 6) FIRESTORE: VALIDATION & WRITES
   ******************************************************************/
  function parseTicketIdFromQR(text){
    if(!text) return null;
    const t = String(text).trim();
    // If JSON
    if((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))){
      try{
        const obj = JSON.parse(t);
        if(obj && typeof obj === "object"){
          return obj.ticketId || obj.ticketID || obj.tid || null;
        }
      }catch(_e){}
    }
    // If URL contains ticketId=
    try{
      if(t.startsWith("http")){
        const u = new URL(t);
        const tid = u.searchParams.get("ticketId") || u.searchParams.get("ticketID") || u.searchParams.get("tid");
        if(tid) return tid;
      }
    }catch(_e){}
    // Otherwise assume it's the ticketId itself
    return t;
  }

  function last4(phone){
    const digits = String(phone || "").replace(/\D/g,"");
    if(digits.length < 4) return digits;
    return digits.slice(-4);
  }

  function orderTicketCount(order){
    if(!order) return 1;
    const qtyRaw = Number(order?.qty ?? order?.quantity ?? order?.count ?? 0) || 0;
    const tickets = Array.isArray(order?.tickets) ? order.tickets : [];
    const tiers = Array.isArray(order?.tiers) ? order.tiers : [];
    const qtyFromTickets = tickets.reduce((s,t)=>s+(Number(t?.quantity ?? t?.qty ?? 0) || 0),0);
    const qtyFromTiers = tiers.reduce((s,t)=>s+(Number(t?.qty ?? t?.quantity ?? 0) || 0),0);
    return qtyRaw || qtyFromTickets || qtyFromTiers || 1;
  }

  async function writeScanLog({eventId, staff, gateName, ticketId, orderId, outcome, reason}){
    // Recommended log collection for both approvals and failures
    try{
      const logsCol = collection(db, "events", eventId, "scanLogs");
      await addDoc(logsCol, {
        createdAt: serverTimestamp(),
        outcome, // "approved" | "denied"
        reason: reason || "",
        gateName: gateName || "",
        staffId: staff?.id || "",
        staffUsername: staff?.username || "",
        ticketId: ticketId || "",
        orderId: orderId || ""
      });
    }catch(_e){
      // scanner must stay pressure-proof: ignore log failures
    }
  }

  async function verifyCurrentScan(){
    if(state.verifying) return;
    if(!state.scannedTicketId) return;
    if(state.digits.length !== 4) return;

    setVerifying(true);
    $("btnVerify").disabled = true;

    const eventId = state.eventId;
    const gateName = state.staff?.gateName || "Gate";
    const staff = state.staff;

    const ticketId = state.scannedTicketId;

    try{
      // 1) ticket-codes/{ticketId}
      const codeRef = doc(db, "ticket-codes", ticketId);
      const codeSnap = await getDoc(codeRef);

      if(!codeSnap.exists()){
        await writeScanLog({eventId, staff, gateName, ticketId, outcome:"denied", reason:"Ticket code not found"});
        showResult({ok:false, reason:"Ticket Not Found", gateName, when:new Date()});
        setVerifying(false);
        return;
      }

      const code = codeSnap.data() || {};
      const codeEventId = code.eventId || code.eventID;

      if(String(codeEventId) !== String(eventId)){
        await writeScanLog({eventId, staff, gateName, ticketId, outcome:"denied", reason:"Wrong event"});
        showResult({ok:false, reason:"Wrong Event", gateName, when:new Date()});
        setVerifying(false);
        return;
      }

      // Already redeemed?
      if(code.redeemedAt || code.checkedInAt || code.usedAt){
        const usedGate = code.redeemedGate || code.checkedInGate || code.usedGate || "Unknown gate";
        const usedTime = code.redeemedAt?.toDate?.() || code.checkedInAt?.toDate?.() || code.usedAt?.toDate?.();
        await writeScanLog({eventId, staff, gateName, ticketId, orderId: code.orderId, outcome:"denied", reason:"Already checked-in"});
        showResult({
          ok:false,
          reason:"Already checked-in",
          customerName: "", tierId: code.tierId, waveId: code.waveId,
          gateName,
          when:new Date(),
          usedWhereWhen: {gate: usedGate, time: usedTime || null}
        });
        setVerifying(false);
        return;
      }

      // Expired?
      const exp = code.expiresAt?.toDate?.() || null;
      if(exp && exp.getTime() < nowMs()){
        await writeScanLog({eventId, staff, gateName, ticketId, orderId: code.orderId, outcome:"denied", reason:"Expired QR"});
        showResult({ok:false, reason:"Expired QR", gateName, when:new Date()});
        setVerifying(false);
        return;
      }

      const orderId = code.orderId;
      const inviteToken = code.inviteToken || code.inviteId || code.invite?.token || "";
      if(!orderId && inviteToken){
        const inviteRef = doc(db, "events", eventId, "invites", inviteToken);
        const inviteSnap = await getDoc(inviteRef);
        if(!inviteSnap.exists()){
          await writeScanLog({eventId, staff, gateName, ticketId, outcome:"denied", reason:"Invite not found"});
          showResult({ok:false, reason:"Invite Not Found", gateName, when:new Date()});
          setVerifying(false);
          return;
        }

        const invite = inviteSnap.data() || {};
        const alreadyRedeemed = invite.redeemedAt || invite.checkedInAt;
        if(alreadyRedeemed){
          const usedGate = invite.redeemedGate || invite.checkedInGate || "Unknown gate";
          const usedTime = invite.redeemedAt?.toDate?.() || invite.checkedInAt?.toDate?.();
          await writeScanLog({eventId, staff, gateName, ticketId, outcome:"denied", reason:"Already checked-in"});
          showResult({
            ok:false,
            reason:"Already checked-in",
            customerName: invite?.recipient?.name || "",
            tierId: invite.tierId || code.tierId,
            waveId: code.waveId,
            gateName,
            when:new Date(),
            usedWhereWhen: {gate: usedGate, time: usedTime || null}
          });
          setVerifying(false);
          return;
        }

        const phone = invite?.recipient?.phone || "";
        const p4 = last4(phone);
        if(p4 && String(p4) !== String(state.digits)){
          await writeScanLog({eventId, staff, gateName, ticketId, outcome:"denied", reason:"Wrong digits"});
          showResult({
            ok:false,
            reason:"Wrong digits",
            customerName: invite?.recipient?.name || "",
            tierId: invite.tierId || code.tierId,
            waveId: code.waveId,
            gateName,
            when:new Date()
          });
          setVerifying(false);
          return;
        }

        const lockedAt = new Date();
        await updateDoc(codeRef, {
          redeemedAt: serverTimestamp(),
          redeemedGate: gateName,
          redeemedBy: staff?.id || "",
          redeemedByUsername: staff?.username || ""
        });
        await updateDoc(inviteRef, {
          status: "redeemed",
          redeemedAt: serverTimestamp(),
          redeemedGate: gateName,
          redeemedBy: staff?.id || "",
          redeemedByUsername: staff?.username || "",
          checkedInAt: serverTimestamp(),
          checkedInGate: gateName,
          checkedInBy: staff?.id || "",
          checkedInByUsername: staff?.username || ""
        });
        await writeScanLog({eventId, staff, gateName, ticketId, outcome:"approved", reason:"Invite redeemed"});

        showResult({
          ok:true,
          customerName: invite?.recipient?.name || "",
          tierId: invite.tierId || code.tierId || "—",
          tierName: "",
          waveId: code.waveId || "—",
          gateName,
          when: lockedAt
        });
        setVerifying(false);
        return;
      }

      if(!orderId){
        await writeScanLog({eventId, staff, gateName, ticketId, outcome:"denied", reason:"Order missing on code"});
        showResult({ok:false, reason:"Invalid Ticket Data", gateName, when:new Date()});
        setVerifying(false);
        return;
      }

      // 2) order doc
      const orderRef = doc(db, "events", eventId, "orders", orderId);
      const orderSnap = await getDoc(orderRef);

      if(!orderSnap.exists()){
        await writeScanLog({eventId, staff, gateName, ticketId, orderId, outcome:"denied", reason:"Order not found"});
        showResult({ok:false, reason:"Order Not Found", gateName, when:new Date()});
        setVerifying(false);
        return;
      }

      const order = orderSnap.data() || {};
      const orderQty = orderTicketCount(order);
      const checkedInTicketId = order.checkedInTicketId || order.ticketId || "";
      const isOrderTicketChecked = checkedInTicketId && checkedInTicketId === ticketId;

      // Must be paid
      if(String(order.status || "").toLowerCase() !== "paid"){
        await writeScanLog({eventId, staff, gateName, ticketId, orderId, outcome:"denied", reason:"Unpaid order"});
        showResult({ok:false, reason:"Not Paid", gateName, when:new Date(), customerName: order.Name || order.name || ""});
        setVerifying(false);
        return;
      }

      // If order already checked in (double defense)
      if(order.checkedIn === true || (order.checkedInAt && orderQty <= 1) || isOrderTicketChecked){
        const usedGate = order.checkedInGate || "Unknown gate";
        const usedTime = order.checkedInAt?.toDate?.() || null;
        await writeScanLog({eventId, staff, gateName, ticketId, orderId, outcome:"denied", reason:"Already checked-in"});
        showResult({
          ok:false,
          reason:"Already checked-in",
          customerName: order.Name || order.name || "",
          tierId: order.tierId || code.tierId,
          tierName: order.tierName || "",
          waveId: order.waveId || code.waveId,
          gateName,
          when:new Date(),
          usedWhereWhen: {gate: usedGate, time: usedTime}
        });
        setVerifying(false);
        return;
      }

      // Digits check
      const p4 = last4(order.phone);
      if(String(p4) !== String(state.digits)){
        await writeScanLog({eventId, staff, gateName, ticketId, orderId, outcome:"denied", reason:"Wrong digits"});
        showResult({
          ok:false,
          reason:"Wrong digits",
          customerName: order.Name || order.name || "",
          tierId: order.tierId || code.tierId,
          tierName: order.tierName || "",
          waveId: order.waveId || code.waveId,
          gateName,
          when:new Date()
        });
        setVerifying(false);
        return;
      }

      // 3) APPROVE — write to ticket-codes + orders
      const lockedAt = new Date();

      await updateDoc(codeRef, {
        redeemedAt: serverTimestamp(),
        redeemedGate: gateName,
        redeemedBy: staff?.id || "",
        redeemedByUsername: staff?.username || ""
      });

      await updateDoc(orderRef, {
        ...(orderQty <= 1 ? { checkedIn: true } : {}),
        checkedInTicketId: ticketId || "",
        checkedInAt: serverTimestamp(),
        checkedInGate: gateName,
        checkedInBy: staff?.id || "",
        checkedInByUsername: staff?.username || ""
      });

      await writeScanLog({eventId, staff, gateName, ticketId, orderId, outcome:"approved", reason:"OK"});

      showResult({
        ok:true,
        customerName: order.Name || order.name || "",
        tierId: order.tierId || code.tierId || "—",
        tierName: order.tierName || "",
        waveId: order.waveId || code.waveId || "—",
        gateName,
        when: lockedAt
      });

      setVerifying(false);

    }catch(e){
      await writeScanLog({eventId, staff, gateName, ticketId, orderId: state.scannedCodeDoc?.orderId, outcome:"denied", reason:"System error"});
      showResult({ok:false, reason:"System error", gateName, when:new Date()});
      setVerifying(false);
    }
  }

  /******************************************************************
   * 7) QR SCANNING (html5-qrcode)
   ******************************************************************/
  let html5QrCode = null;
  let activeCameraId = null;

  function calcQrbox(){
    const el = $("qrRegion");
    if(!el) return { width: 260, height: 260 };
    const size = Math.floor(Math.min(el.clientWidth || 320, el.clientHeight || 320) * 0.72);
    return { width: size, height: size };
  }

  async function startScanner(){
    if(state.scanMode !== "camera") return;
    if(html5QrCode) return;
    const regionEl = $("qrRegion");
    if(!regionEl){
      alert("Scanner region missing.");
      debugState.lastError = "Scanner region missing";
      updateDebugPanel();
      return;
    }

    if(!window.isSecureContext){
      setScanStatus("Camera access requires HTTPS. Open the secure link for scanning.", true);
      debugState.lastError = "Not in secure context (HTTPS required)";
      updateDebugPanel();
      return;
    }

    if(typeof Html5Qrcode === "undefined"){
      setScanStatus("Scanner library not loaded yet.", true);
      debugState.lastError = "html5-qrcode missing";
      updateDebugPanel();
      return;
    }

    html5QrCode = new Html5Qrcode("qrRegion");

    try{
      const cameras = await Html5Qrcode.getCameras();
      if(!cameras || !cameras.length){
        setScanStatus("No camera detected on this device.", true);
        debugState.lastError = "No camera detected";
        updateDebugPanel();
        await stopScanner();
        return;
      }

      const preferred = cameras.find((camera) => /back|rear|environment/i.test(camera.label || ""));
      const selectedById = activeCameraId
        ? cameras.find((camera) => camera.id === activeCameraId)
        : null;
      const activeCamera = selectedById || preferred || null;
      activeCameraId = activeCamera?.id || null;
      debugState.cameraLabel = activeCamera?.label || "Back Camera";
      await html5QrCode.start(
        activeCameraId ? { deviceId: { exact: activeCameraId } } : { facingMode: "environment" },
        {
          fps: 30,
          qrbox: calcQrbox(),
          experimentalFeatures: { useBarCodeDetectorIfSupported: true }
        },
        async (decodedText) => {
          handleDecodedText(decodedText, "camera");
        }
      );
      state.scanning = true;
      debugState.lastError = "—";
      setScanStatus("Scanning… hold the QR steady inside the frame.");
      await populateCameraSelect();
      updateDebugPanel();
    }catch(e){
      const message = e?.message || "Camera permission needed to scan.";
      setScanStatus(message, true);
      debugState.lastError = message;
      updateDebugPanel();
      await stopScanner();
    }
  }

  async function stopScanner(){
    try{
      if(html5QrCode){
        await html5QrCode.stop().catch(()=>{});
        await html5QrCode.clear().catch(()=>{});
      }
    }catch(_e){}
    html5QrCode = null;
    state.scanning = false;
    updateDebugPanel();
  }

  async function populateCameraSelect(){
    const selectEl = $("cameraSelect");
    if(!selectEl || !html5QrCode) return;

    try{
      const cameras = await Html5Qrcode.getCameras();
      if(!cameras.length){
        selectEl.innerHTML = `<option value="">No camera available</option>`;
        selectEl.disabled = true;
        debugState.cameraLabel = "No camera";
        updateDebugPanel();
        return;
      }

      selectEl.disabled = false;
      selectEl.innerHTML = cameras
        .map((camera, index) => {
          const label = camera.label || `Camera ${index + 1}`;
          return `<option value="${camera.id}">${label}</option>`;
        })
        .join("");

      const preferred = cameras.find((camera) => /back|rear|environment/i.test(camera.label || "")) || cameras[0];
      const selected = activeCameraId
        ? cameras.find((camera) => camera.id === activeCameraId)
        : null;
      const target = selected || preferred;
      if(target?.id){
        selectEl.value = target.id;
        activeCameraId = target.id;
        debugState.cameraLabel = target.label || `Camera ${cameras.indexOf(target) + 1}`;
      }
      updateDebugPanel();
    }catch(_e){
      selectEl.innerHTML = `<option value="">Camera list unavailable</option>`;
      selectEl.disabled = true;
      debugState.cameraLabel = "Unavailable";
      updateDebugPanel();
    }
  }

  async function loadScanPreview(ticketId){
    if(!ticketId) return;
    try{
      const codeRef = doc(db, "ticket-codes", ticketId);
      const codeSnap = await getDoc(codeRef);
      if(!codeSnap.exists()){
        showResult({ok:false, reason:"Ticket Not Found", gateName: state.staff?.gateName || "Gate", when:new Date()});
        hardResetForNextScan();
        return;
      }

      const code = codeSnap.data() || {};
      const orderId = code.orderId;
      if(!orderId){
        showResult({ok:false, reason:"Invalid Ticket Data", gateName: state.staff?.gateName || "Gate", when:new Date()});
        hardResetForNextScan();
        return;
      }

      const orderRef = doc(db, "events", state.eventId, "orders", orderId);
      const orderSnap = await getDoc(orderRef);
      if(!orderSnap.exists()){
        showResult({ok:false, reason:"Order Not Found", gateName: state.staff?.gateName || "Gate", when:new Date()});
        hardResetForNextScan();
        return;
      }

      const order = orderSnap.data() || {};
      state.scannedCodeDoc = code;
      state.scannedOrderDoc = order;
      setScanMeta({
        name: order.Name || order.name || "—",
        tier: resolveTierName(order.tierId || code.tierId, order.tierName)
      });
    }catch(_e){
      showResult({ok:false, reason:"System error", gateName: state.staff?.gateName || "Gate", when:new Date()});
      hardResetForNextScan();
    }
  }

  /******************************************************************
   * 8) BOOT: LOAD EVENT + SESSION
   ******************************************************************/
  async function loadEvent(eventId){
    const ref = doc(db, "events", eventId);
    const snap = await getDoc(ref);
    if(!snap.exists()) throw new Error("Event not found");
    return snap.data();
  }

  function showLogin(){
    $("viewLogin").classList.remove("hidden");
    $("viewScan").classList.add("hidden");
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

  function showScan(){
    $("viewLogin").classList.add("hidden");
    $("viewScan").classList.remove("hidden");
    focusWedgeInput();
  }

  function saveSession(){
    localStorage.setItem("luma_usher_session", JSON.stringify({
      eventId: state.eventId,
      staffId: state.staff?.id || "",
      username: state.staff?.username || "",
      gateName: state.staff?.gateName || ""
    }));
  }

  function clearSession(){
    localStorage.removeItem("luma_usher_session");
  }

  function loadSession(){
    try{
      const raw = localStorage.getItem("luma_usher_session");
      if(!raw) return null;
      return JSON.parse(raw);
    }catch{ return null; }
  }

  /******************************************************************
   * 9) UI WIRING
   ******************************************************************/
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
      // Load event first (fast fail if link wrong)
      state.event = await loadEvent(eventId);

      const res = await staffLogin(eventId, u, p);
      if(!res.ok){
        alert(res.reason || "Login failed");
        return;
      }

      state.staff = res.staff;

      // Populate header
      $("eventName").textContent = state.event.name || "Event";
      $("gateName").textContent = state.staff.gateName || "Gate";
      $("topTitle").textContent = state.event.name ? `Usher • ${state.event.name}` : "Usher Scanner";
      $("topSub").textContent = state.staff.gateName ? `Gate: ${state.staff.gateName}` : "Gate Terminal";
      setEventLogo(state.event);

      saveSession();
      showScan();

      applyScanMode();
      await startScanner();
      hardResetForNextScan();

    }catch(e){
      alert("Could not load event or login.");
    }finally{
      $("btnLogin").disabled = false;
      $("btnLogin").textContent = "Login";
    }
  });

  $("btnLogout").addEventListener("click", async ()=>{
    clearSession();
    state.staff = null;
    await stopScanner();
    showLogin();
    hardResetForNextScan();
  });

  $("keypad").addEventListener("click", (e)=>{
    const k = e.target?.dataset?.k;
    if(!k) return;

    if(k === "clear"){ clearDigits(); return; }
    if(k === "back"){ state.digits = state.digits.slice(0,-1); setDigitsUI(); return; }
    if(!/^\d$/.test(k)) return;

    if(state.digits.length >= 4) return;
    state.digits += k;
    setDigitsUI();
  });

  $("btnVerify").addEventListener("click", async ()=>{
    await verifyCurrentScan();
  });

  $("btnCloseResult").addEventListener("click", ()=>{
    closeResult();
  });

  $("btnScanNext").addEventListener("click", ()=>{
    closeResult();
    // allow new scan
    hardResetForNextScan();
  });

  $("btnManualTicket").addEventListener("click", ()=>{
    submitManualEntry();
    $("manualTicketInput")?.focus();
  });

  $("manualTicketInput").addEventListener("keydown", (e)=>{
    if(e.key !== "Enter") return;
    submitManualEntry();
    e.preventDefault();
  });

  $("btnRestartScanner").addEventListener("click", async ()=>{
    setScanStatus("Restarting scanner…");
    await stopScanner();
    await startScanner();
  });

  $("btnHardwareScan").addEventListener("click", async ()=>{
    await requestHardwareScan();
    focusWedgeInput();
  });

  $("btnHardwareMode").addEventListener("click", ()=>{
    state.scanMode = "hardware";
    applyScanMode();
    focusWedgeInput();
  });

  $("btnToggleDebug").addEventListener("click", ()=>{
    debugState.enabled = !debugState.enabled;
    setDebugVisible(debugState.enabled);
    $("btnToggleDebug").textContent = debugState.enabled ? "Hide Diagnostics" : "Show Diagnostics";
    updateDebugPanel();
  });

  $("wedgeInput").addEventListener("keydown", (e)=>{
    if(e.key !== "Enter") return;
    const value = e.target.value.trim();
    if(value){
      handleDecodedText(value, "wedge");
    }
    e.target.value = "";
    e.preventDefault();
  });

  $("wedgeInput").addEventListener("blur", ()=>{
    setTimeout(focusWedgeInput, 50);
  });

  $("cameraSelect").addEventListener("change", async (e)=>{
    if(!html5QrCode) return;
    const cameraId = e.target.value;
    if(!cameraId) return;
    try{
      activeCameraId = cameraId;
      await stopScanner();
      await startScanner();
      setScanStatus("Camera switched. Keep the QR steady.");
      debugState.cameraLabel = e.target.selectedOptions?.[0]?.textContent || "—";
      updateDebugPanel();
    }catch(_e){
      setScanStatus("Unable to switch camera.", true);
    }
  });

  // If overlay is open, prevent accidental back behavior
  $("resultOverlay").addEventListener("click", (e)=>{
    if(e.target === $("resultOverlay")) closeResult();
  });

  /******************************************************************
   * 10) INIT
   ******************************************************************/
  function initNet(){
    setOnlineUI();
    window.addEventListener("online", setOnlineUI);
    window.addEventListener("offline", setOnlineUI);
  }

  async function init(){
    initNet();
    initNativeScanner();

    state.eventId = getParam("event");
    $("eventIdInput").value = state.eventId || "(missing)";

    state.scanMode = resolveScanMode();
    applyScanMode();
    window.onHardwareScan = (decodedText) => {
      handleDecodedText(decodedText, "hardware");
      focusWedgeInput();
    };
    window.setScanMode = (mode) => {
      if(!mode) return;
      const normalized = String(mode).toLowerCase();
      if(["camera", "hardware", "wedge"].includes(normalized)){
        state.scanMode = normalized;
        applyScanMode();
        focusWedgeInput();
      }
    };

    if(!state.eventId){
      alert("Missing event parameter. Use: /usher?event=EVENT_ID");
      return;
    }

    // Auto session restore (same event only)
    const sess = loadSession();
    if(sess && sess.eventId === state.eventId && sess.staffId){
      try{
        state.event = await loadEvent(state.eventId);
        state.staff = {
          id: sess.staffId,
          username: sess.username || "",
          gateName: sess.gateName || "Gate"
        };

        $("eventName").textContent = state.event.name || "Event";
        $("gateName").textContent = state.staff.gateName || "Gate";
        $("topTitle").textContent = state.event.name ? `Usher • ${state.event.name}` : "Usher Scanner";
        $("topSub").textContent = state.staff.gateName ? `Gate: ${state.staff.gateName}` : "Gate Terminal";
        setEventLogo(state.event);

        showScan();
        applyScanMode();
        await startScanner();
        hardResetForNextScan();
      }catch(_e){
        // If restore fails, go login
        showLogin();
      }
    }else{
      showLogin();
    }

    // Better UX: focus username
    setTimeout(()=> $("username")?.focus(), 150);
  }

  init();
