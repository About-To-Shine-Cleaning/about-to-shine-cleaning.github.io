/* =========================================================
   ATS Admin Panel (NFC Protected) — v1.5
   ✅ JSONP ping/auth to Apps Script (iPhone-safe)
   ✅ Device binding via localStorage device key
   ✅ Removes token from URL after successful auth
   ✅ Stores token for other admin pages (payroll/estimator)
   ✅ Shows Estimator card only for E01 + E04
========================================================= */

(() => {
  // ✅ NEW Apps Script URL (your message)
  const API_URL = "https://script.google.com/macros/s/AKfycbzJKyZ7MVor41kVnpdM1dizHNFi42IwH_L5J_3liLc3E8UXnNo8B0Z2Q0AQOIWSizBp/exec";

  // ✅ Estimator allowed admins (for now)
  const ESTIMATOR_ALLOWED = ["E01", "E04"];

  // Storage keys
  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  const AUTH_STORAGE = "ats_admin_auth_v1";       // sessionStorage (who/role)
  const TOKEN_STORAGE = "ats_admin_token_v1";     // sessionStorage (token for other admin pages)

  // Elements (safe if missing)
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

  // Remove token from URL (after auth)
  function removeTokenFromUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("t");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    } catch (e) {}
  }

  // JSONP helper (CORS-safe + iPhone safe)
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);

      const script = document.createElement("script");
      script.async = true;

      window[cb] = (data) => {
        try { resolve(data); }
        finally {
          try { delete window[cb]; } catch (e) {}
          try { script.remove(); } catch (e) {}
        }
      };

      script.onerror = () => {
        try { delete window[cb]; } catch (e) {}
        try { script.remove(); } catch (e) {}
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

  // ✅ Store token for other admin pages (payroll/estimator)
  function saveSessionToken(token) {
    try { sessionStorage.setItem(TOKEN_STORAGE, token); } catch (e) {}
  }

  function showCards(employeeId, employeeName) {
    if (whoEl) whoEl.textContent = `${employeeId} • ${employeeName}`;

    // Clock link (existing system)
    if (clockBtn) clockBtn.href = `/clock.html?emp=${encodeURIComponent(employeeId)}`;

    // Estimator card only for allowed list
    if (estimatorCard) {
      if (ESTIMATOR_ALLOWED.includes(employeeId)) estimatorCard.classList.remove("hidden");
      else estimatorCard.classList.add("hidden");
    }
    if (estimatorBtn) estimatorBtn.href = "/admin/estimator/";

    // Payroll link (v2 UI page — you’ll build /admin/payroll/ next)
    if (payrollBtn) payrollBtn.href = "/admin/payroll/";

    if (cardsEl) cardsEl.classList.remove("hidden");
  }

  async function boot() {
    const url = new URL(window.location.href);
    const token = (url.searchParams.get("t") || "").trim();
    const deviceKey = getDeviceKey();

    // Helpful debug info
    setDebug(`API_URL: ${API_URL}`);

    if (!token) {
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
      if (!p || !p.ok) throw new Error("Ping did not return ok");

      setStatus("Checking access…");
      const res = await auth(token, deviceKey);

      if (!res || !res.ok) {
        setStatus(
          `Denied: ${res && res.error ? res.error : "unauthorized"}\n\n` +
          `${JSON.stringify(res || {}, null, 2)}`
        );
        return;
      }

      // ✅ authorized
      const authObj = {
        ok: true,
        employeeId: res.employeeId,
        employeeName: res.employeeName,
        role: res.role,
        authedAt: new Date().toISOString(),
      };

      saveSessionAuth(authObj);
      saveSessionToken(token); // ✅ key fix for payroll/other pages
      showCards(res.employeeId, res.employeeName);

      setStatus("Access granted ✅");
      removeTokenFromUrl();
      setDebug("Device binding active. Token saved for other admin pages. Token removed from address bar.");
    } catch (err) {
      setStatus(
        "Error: Could not reach secure API.\n\n" +
        `Page: ${window.location.href}\n` +
        `API_URL: ${API_URL}\n` +
        `Ping/Auth failed: ${String(err && err.message ? err.message : err)}`
      );
    }
  }

  // Run after DOM is ready (prevents blank page on iPhone)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
