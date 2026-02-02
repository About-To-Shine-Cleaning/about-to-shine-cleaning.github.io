/* =========================================================
   ATS Admin Panel (NFC Protected) — v1.6
   ✅ JSONP ping/auth to Apps Script (iPhone-safe)
   ✅ Device binding via localStorage device key
   ✅ Removes token from URL after successful auth
   ✅ Stores token for other admin pages (payroll/estimator)
   ✅ Passes token to payroll/estimator links as fallback (iPhone safe)
   ✅ Shows Estimator card only for E01 + E04
========================================================= */

(() => {
  // ✅ Unified Apps Script URL (admin/estimator/payroll backend)
  const API_URL = "https://script.google.com/macros/s/AKfycbzJKyZ7MVor41kVnpdM1dizHNFi42IwH_L5J_3liLc3E8UXnNo8B0Z2Q0AQOIWSizBp/exec";

  // ✅ Estimator allowed admins (for now)
  const ESTIMATOR_ALLOWED = ["E01", "E04"];

  // Storage keys
  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  const AUTH_STORAGE = "ats_admin_auth_v1";       // sessionStorage (who/role)
  const TOKEN_STORAGE = "ats_admin_token_v1";     // sessionStorage (token for other admin pages)

  // Elements
  const statusEl = document.getElementById("status");
  const whoEl = document.getElementById("who");
  const cardsEl = document.getElementById("cards");
  const debugEl = document.getElementById("debug");

  const clockBtn = document.getElementById("clockBtn");
  const estimatorCard = document.getElementById("estimatorCard");
  const estimatorBtn = document.getElementById("estimatorBtn");
  const payrollBtn = document.getElementById("payrollBtn");

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || "";
  }
  function setDebug(msg) {
    if (debugEl) debugEl.textContent = msg || "";
  }

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

  // JSONP helper
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
        try { resolve(data); }
        finally { cleanup(); }
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

  function saveSessionToken(token) {
    try { sessionStorage.setItem(TOKEN_STORAGE, token); } catch (e) {}
  }

  // ✅ fallback: if sessionStorage is blocked (some iOS cases), we still pass ?t=TOKEN in links
  function getStoredTokenOr(tokenFromUrl) {
    try {
      const t = sessionStorage.getItem(TOKEN_STORAGE);
      if (t) return t;
    } catch (e) {}
    return tokenFromUrl || "";
  }

  function showCards(employeeId, employeeName, tokenForLinks) {
    if (whoEl) whoEl.textContent = `${employeeId} • ${employeeName}`;

    // Clock link
    if (clockBtn) clockBtn.href = `/clock.html?emp=${encodeURIComponent(employeeId)}`;

    // Estimator card only for allowed list
    if (estimatorCard) {
      if (ESTIMATOR_ALLOWED.includes(employeeId)) estimatorCard.classList.remove("hidden");
      else estimatorCard.classList.add("hidden");
    }

    // ✅ Add token fallback to estimator/payroll links
    const tParam = tokenForLinks ? `?t=${encodeURIComponent(tokenForLinks)}` : "";

    if (estimatorBtn) estimatorBtn.href = `/admin/estimator/${tParam}`;
    if (payrollBtn) payrollBtn.href = `/admin/payroll/${tParam}`;

    if (cardsEl) cardsEl.classList.remove("hidden");
  }

  async function boot() {
    const url = new URL(window.location.href);
    const tokenFromUrl = (url.searchParams.get("t") || "").trim();
    const deviceKey = getDeviceKey();

    setDebug(`API_URL: ${API_URL}`);

    if (!tokenFromUrl) {
      setStatus(
        "Denied: missing token.\n\n" +
        "Use NFC link that includes:\n" +
        "https://abouttoshinecleaning.com/admin/?t=YOURTOKEN"
      );
      return;
    }

    try {
      setStatus("Checking secure API (ping)…");
      const p = await ping();

      // ✅ better debug if ping returns something unexpected
      if (!p || p.ok !== true) {
        setStatus(
          "Error: ping failed.\n\n" +
          "This means your Apps Script web app did NOT respond with {ok:true}.\n\n" +
          `Ping response:\n${JSON.stringify(p || {}, null, 2)}\n\n` +
          `API_URL:\n${API_URL}`
        );
        return;
      }

      setStatus("Checking access…");
      const res = await auth(tokenFromUrl, deviceKey);

      if (!res || !res.ok) {
        setStatus(
          `Denied: ${res && res.error ? res.error : "unauthorized"}\n\n` +
          `${JSON.stringify(res || {}, null, 2)}`
        );
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
      saveSessionToken(tokenFromUrl);

      const tokenForLinks = getStoredTokenOr(tokenFromUrl);
      showCards(res.employeeId, res.employeeName, tokenForLinks);

      setStatus("Access granted ✅");
      removeTokenFromUrl();
      setDebug("Device binding active. Token saved. Token removed from address bar.");
    } catch (err) {
      setStatus(
        "Error: Could not reach secure API.\n\n" +
        `Page: ${window.location.href}\n` +
        `API_URL: ${API_URL}\n` +
        `Ping/Auth failed: ${String(err && err.message ? err.message : err)}`
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
