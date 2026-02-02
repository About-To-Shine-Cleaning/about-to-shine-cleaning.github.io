/* =========================================================
   ATS Admin Panel (NFC Protected) — v1.6.1
   ✅ JSONP ping/auth to Apps Script (iPhone-safe)
   ✅ Device binding via localStorage device key
   ✅ Stores token for other admin pages (payroll/estimator)
   ✅ Fixes navigation “Denied: missing token” (rehydrate token)
   ✅ Bookmark-safe token support via hash: /admin/#t=TOKEN
   ✅ Optional keep mode via ?keep=1 (keeps token in URL)
========================================================= */

(() => {
  // ✅ Unified Apps Script URL (admin/estimator/payroll backend)
  const API_URL = "https://script.google.com/macros/s/AKfycbxZdZi2eojV04LBbXikTIrg60WKvX21BGijgpqLdBdwjPiJquC_GzBudMvXgcu0oMGd/exec";

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

  function getTokenFromSession() {
    try { return (sessionStorage.getItem(TOKEN_STORAGE) || "").trim(); } catch (e) { return ""; }
  }

  function getTokenFromUrlOrHash_() {
    try {
      const url = new URL(window.location.href);
      const t1 = (url.searchParams.get("t") || "").trim();
      if (t1) return t1;

      // Bookmark-safe: https://site/admin/#t=TOKEN
      const h = (url.hash || "").replace(/^#/, "");
      const params = new URLSearchParams(h);
      return (params.get("t") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function keepTokenInAddressBar_() {
    try {
      const url = new URL(window.location.href);
      // Keep if explicitly requested OR token came from hash
      if ((url.searchParams.get("keep") || "") === "1") return true;
      if ((url.hash || "").includes("t=")) return true;
    } catch (e) {}
    return false;
  }

  function removeTokenFromUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("t");
      // keep hash untouched (bookmark mode)
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + (url.hash || ""));
    } catch (e) {}
  }

  function removeTokenFromHash_() {
    // If you ever want to strip hash tokens too (we DON'T by default)
    try {
      const url = new URL(window.location.href);
      if (!url.hash) return;
      const h = (url.hash || "").replace(/^#/, "");
      const params = new URLSearchParams(h);
      params.delete("t");
      const newHash = params.toString();
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + (newHash ? ("#" + newHash) : ""));
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

      script.onerror = () => { cleanup(); reject(new Error("JSONP failed to load: " + url)); };

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

  function ensureToken_() {
    // Prefer session token, otherwise use URL/hash and store into session
    let t = getTokenFromSession();
    if (t) return t;

    t = getTokenFromUrlOrHash_();
    if (t) saveSessionToken(t);
    return t;
  }

  function showCards(employeeId, employeeName, token) {
    if (whoEl) whoEl.textContent = `${employeeId} • ${employeeName}`;

    // Clock link (employee clock has its own rules)
    if (clockBtn) clockBtn.href = `/clock.html?emp=${encodeURIComponent(employeeId)}`;

    // Estimator card only for allowed list
    if (estimatorCard) {
      if (ESTIMATOR_ALLOWED.includes(employeeId)) estimatorCard.classList.remove("hidden");
      else estimatorCard.classList.add("hidden");
    }

    // ✅ Navigation fix:
    // Use HASH token (bookmark-safe) so other pages can rehydrate even if sessionStorage is lost.
    // Example: /admin/payroll/#t=TOKEN
    const tHash = token ? `#t=${encodeURIComponent(token)}` : "";

    if (estimatorBtn) estimatorBtn.href = `/admin/estimator/${tHash}`;
    if (payrollBtn) payrollBtn.href = `/admin/payroll/${tHash}`;

    if (cardsEl) cardsEl.classList.remove("hidden");
  }

  async function boot() {
    const deviceKey = getDeviceKey();
    setDebug(`API_URL: ${API_URL}`);

    const token = ensureToken_();

    if (!token) {
      setStatus(
        "Denied: missing token.\n\n" +
        "Use NFC link that includes:\n" +
        "https://abouttoshinecleaning.com/admin/?t=YOURTOKEN\n\n" +
        "Or bookmark-safe:\n" +
        "https://abouttoshinecleaning.com/admin/#t=YOURTOKEN"
      );
      return;
    }

    try {
      setStatus("Checking secure API (ping)…");
      const p = await ping();

      if (!p || p.ok !== true) {
        setStatus(
          "Error: ping failed.\n\n" +
          `Ping response:\n${JSON.stringify(p || {}, null, 2)}\n\n` +
          `API_URL:\n${API_URL}`
        );
        return;
      }

      setStatus("Checking access…");
      const res = await auth(token, deviceKey);

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
      saveSessionToken(token);

      showCards(res.employeeId, res.employeeName, token);

      setStatus("Access granted ✅");

      // ✅ Only strip query token if not in keep mode and not using hash bookmark
      if (!keepTokenInAddressBar_()) {
        removeTokenFromUrl();
        // We intentionally do NOT remove the hash token because it’s your bookmark-safe mode.
      }

      setDebug(
        "Device binding active. Token saved.\n" +
        (keepTokenInAddressBar_()
          ? "Token kept for bookmark mode."
          : "Token removed from address bar (query string).") +
        "\nNavigation uses #t= token for reliability across pages."
      );
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
