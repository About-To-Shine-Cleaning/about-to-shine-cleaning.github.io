/* =========================================================
   ATS Admin Panel — v1.7 (Option A: bookmark /admin/ without token)
   ✅ JSONP ping/auth to Apps Script
   ✅ Device binding via localStorage device key
   ✅ Desktop sign-in box when no token present
   ✅ Stores token in sessionStorage, optional localStorage ("remember")
   ✅ Links to payroll/estimator work without ?t= in URL
   ✅ Token removed from URL after sign-in
========================================================= */

(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbxZdZi2eojV04LBbXikTIrg60WKvX21BGijgpqLdBdwjPiJquC_GzBudMvXgcu0oMGd/exec";

  const ESTIMATOR_ALLOWED = ["E01", "E04"];

  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  const AUTH_STORAGE  = "ats_admin_auth_v1";    // sessionStorage
  const TOKEN_STORAGE = "ats_admin_token_v1";   // sessionStorage
  const TOKEN_LOCAL   = "ats_admin_token_local_v1"; // localStorage

  const statusEl = document.getElementById("status");
  const whoEl = document.getElementById("who");
  const cardsEl = document.getElementById("cards");
  const debugEl = document.getElementById("debug");

  const clockBtn = document.getElementById("clockBtn");
  const estimatorCard = document.getElementById("estimatorCard");
  const estimatorBtn = document.getElementById("estimatorBtn");
  const payrollBtn = document.getElementById("payrollBtn");

  // Desktop login UI
  const desktopLogin = document.getElementById("desktopLogin");
  const desktopToken = document.getElementById("desktopToken");
  const rememberDevice = document.getElementById("rememberDevice");
  const btnDesktopSignIn = document.getElementById("btnDesktopSignIn");
  const btnClearAccess = document.getElementById("btnClearAccess");

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ""; }
  function setDebug(msg) { if (debugEl) debugEl.textContent = msg || ""; }

  function getDeviceKey() {
    let key = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!key) {
      key = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  }

  function removeTokenFromUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("t");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    } catch (e) {}
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      script.async = true;

      const cleanup = () => {
        try { delete window[cb]; } catch (e) {}
        try { script.remove(); } catch (e) {}
      };

      window[cb] = (data) => {
        try { resolve(data); } finally { cleanup(); }
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP failed to load: " + url));
      };

      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.body.appendChild(script);
    });
  }

  async function ping() {
    return jsonp(`${API_URL}?action=ping`);
  }

  async function auth(token, deviceKey) {
    const url =
      `${API_URL}?action=auth` +
      `&t=${encodeURIComponent(token)}` +
      `&d=${encodeURIComponent(deviceKey)}`;
    return jsonp(url);
  }

  function saveSessionAuth(authObj) {
    try { sessionStorage.setItem(AUTH_STORAGE, JSON.stringify(authObj)); } catch (e) {}
  }

  function saveToken(token, remember) {
    try { sessionStorage.setItem(TOKEN_STORAGE, token); } catch (e) {}
    if (remember) {
      try { localStorage.setItem(TOKEN_LOCAL, token); } catch (e) {}
    }
  }

  function loadAnyTokenFromStorage() {
    try {
      const s = (sessionStorage.getItem(TOKEN_STORAGE) || "").trim();
      if (s) return s;
    } catch (e) {}
    try {
      const l = (localStorage.getItem(TOKEN_LOCAL) || "").trim();
      if (l) return l;
    } catch (e) {}
    return "";
  }

  function clearAccess() {
    try { sessionStorage.removeItem(TOKEN_STORAGE); } catch(e){}
    try { sessionStorage.removeItem(AUTH_STORAGE); } catch(e){}
    try { localStorage.removeItem(TOKEN_LOCAL); } catch(e){}
    setStatus("Access cleared. Reload to sign in again.");
    if (cardsEl) cardsEl.classList.add("hidden");
    if (desktopLogin) desktopLogin.classList.remove("hidden");
    if (whoEl) whoEl.textContent = "";
  }

  function showCards(employeeId, employeeName) {
    if (whoEl) whoEl.textContent = `${employeeId} • ${employeeName}`;

    if (clockBtn) clockBtn.href = `/clock.html?emp=${encodeURIComponent(employeeId)}`;

    if (estimatorCard) {
      if (ESTIMATOR_ALLOWED.includes(employeeId)) estimatorCard.classList.remove("hidden");
      else estimatorCard.classList.add("hidden");
    }

    // ✅ Option A: no token in links — pages read token from storage
    if (estimatorBtn) estimatorBtn.href = `/admin/estimator/`;
    if (payrollBtn) payrollBtn.href = `/admin/payroll/`;

    if (cardsEl) cardsEl.classList.remove("hidden");
    if (desktopLogin) desktopLogin.classList.add("hidden");
  }

  async function runAuthFlow(token, remember) {
    const deviceKey = getDeviceKey();

    setDebug(`API_URL: ${API_URL}`);
    setStatus("Checking secure API (ping)…");
    const p = await ping();
    if (!p || p.ok !== true) {
      setStatus("Error: ping failed.\n\n" + JSON.stringify(p || {}, null, 2));
      return;
    }

    setStatus("Checking access…");
    const res = await auth(token, deviceKey);
    if (!res || !res.ok) {
      setStatus(`Denied: ${res && res.error ? res.error : "unauthorized"}\n\n${JSON.stringify(res || {}, null, 2)}`);
      return;
    }

    const authObj = {
      ok: true,
      employeeId: res.employeeId,
      employeeName: res.employeeName,
      role: res.role,
      authedAt: new Date().toISOString(),
    };

    saveSessionAuth(authObj);
    saveToken(token, remember);

    showCards(res.employeeId, res.employeeName);
    setStatus("Access granted ✅");
    removeTokenFromUrl();
    setDebug("Device binding active. Token saved. Token removed from address bar.");
  }

  async function boot() {
    const url = new URL(window.location.href);
    const tokenFromUrl = (url.searchParams.get("t") || "").trim();

    // 1) token from URL (NFC) OR 2) saved token (desktop bookmark)
    const token = tokenFromUrl || loadAnyTokenFromStorage();

    // If no token anywhere -> show desktop sign-in box (Option A)
    if (!token) {
      setStatus("Desktop sign-in required.\n\n(Or open via NFC link that includes ?t=TOKEN)");
      if (desktopLogin) desktopLogin.classList.remove("hidden");

      if (btnDesktopSignIn) {
        btnDesktopSignIn.onclick = () => {
          const t = (desktopToken?.value || "").trim();
          if (!t) { alert("Enter your desktop token."); return; }
          runAuthFlow(t, !!rememberDevice?.checked).catch(err => setStatus(String(err?.message || err)));
        };
      }
      if (btnClearAccess) btnClearAccess.onclick = () => clearAccess();
      return;
    }

    // Token exists (URL or storage) -> auth it
    const remember = tokenFromUrl ? true : true; // default remember on device; you can flip if desired
    await runAuthFlow(token, remember);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(err => setStatus(String(err?.message || err))));
  } else {
    boot().catch(err => setStatus(String(err?.message || err)));
  }
})();
