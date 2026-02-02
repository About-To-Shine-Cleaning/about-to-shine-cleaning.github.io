/* =========================================================
   ATS Payroll (Admin UI) — v2 (front-end)
   - Requires admin auth (sessionStorage from /admin)
   - Fallback: accepts ?t=TOKEN to auth directly (device bound)
   - Calls Apps Script via JSONP:
       GET  ?action=ping
       GET  ?action=auth&t=...&d=...
       GET  ?action=payroll_current
       GET  ?action=payroll_summary&period_id=...
       GET  ?action=payroll_generate&period_id=...
       GET  ?action=payroll_lock&period_id=...
========================================================= */

(() => {
  // ✅ IMPORTANT: set this to the SAME unified Apps Script /exec you want Payroll to use
  // (This should be the script that also supports admin auth.)
  const API_URL = "https://script.google.com/macros/s/AKfycbzJKyZ7MVor41kVnpdM1dizHNFi42IwH_L5J_3liLc3E8UXnNo8B0Z2Q0AQOIWSizBp/exec";

  // Must match admin.js
  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  const AUTH_STORAGE = "ats_admin_auth_v1"; // sessionStorage

  // Elements
  const pillWho = document.getElementById("pillWho");
  const statusBox = document.getElementById("statusBox");
  const debugEl = document.getElementById("debug");

  const periodIdEl = document.getElementById("periodId");
  const periodStartEl = document.getElementById("periodStart");
  const periodEndEl = document.getElementById("periodEnd");
  const periodPaydayEl = document.getElementById("periodPayday");
  const periodStatusEl = document.getElementById("periodStatus");

  const btnGenerate = document.getElementById("btnGenerate");
  const btnRefresh = document.getElementById("btnRefresh");
  const btnLock = document.getElementById("btnLock");

  const summaryHint = document.getElementById("summaryHint");
  const summaryBody = document.getElementById("summaryBody");

  let currentPeriodId = "";

  function setStatus(msg, kind /* "ok" | "err" | "" */) {
    if (!statusBox) return;
    statusBox.classList.remove("ok", "err");
    if (kind === "ok") statusBox.classList.add("ok");
    if (kind === "err") statusBox.classList.add("err");
    statusBox.textContent = msg || "";
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

  async function authWithToken(token) {
    const deviceKey = getDeviceKey();
    return jsonp(
      `${API_URL}?action=auth` +
      `&t=${encodeURIComponent(token)}` +
      `&d=${encodeURIComponent(deviceKey)}`
    );
  }

  function loadSessionAuth() {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj && obj.ok && obj.employeeId && obj.role) return obj;
    } catch (e) {}
    return null;
  }

  function saveSessionAuth(obj) {
    try { sessionStorage.setItem(AUTH_STORAGE, JSON.stringify(obj)); } catch (e) {}
  }

  function requireAdmin(authObj) {
    if (!authObj || !authObj.ok) return false;
    return String(authObj.role || "").toLowerCase() === "admin";
  }

  function setWho(authObj) {
    if (!pillWho) return;
    pillWho.textContent = `${authObj.employeeId} • ${authObj.employeeName || authObj.employeeId}`;
  }

  // ---------- Payroll API calls ----------
  async function payrollCurrent() {
    return jsonp(`${API_URL}?action=payroll_current`);
  }

  async function payrollSummary(periodId) {
    return jsonp(`${API_URL}?action=payroll_summary&period_id=${encodeURIComponent(periodId)}`);
  }

  async function payrollGenerate(periodId) {
    return jsonp(`${API_URL}?action=payroll_generate&period_id=${encodeURIComponent(periodId)}`);
  }

  async function payrollLock(periodId) {
    return jsonp(`${API_URL}?action=payroll_lock&period_id=${encodeURIComponent(periodId)}`);
  }

  function renderPeriod(p) {
    if (!p) return;
    currentPeriodId = p.periodId || "";

    if (periodIdEl) periodIdEl.textContent = p.periodId || "—";
    if (periodStartEl) periodStartEl.textContent = p.startDate || "—";
    if (periodEndEl) periodEndEl.textContent = p.endDate || "—";
    if (periodPaydayEl) periodPaydayEl.textContent = p.payday || "—";
    if (periodStatusEl) periodStatusEl.textContent = p.status || "—";

    if (summaryHint) {
      summaryHint.textContent = currentPeriodId
        ? `Showing summary for ${currentPeriodId}`
        : "—";
    }
  }

  function renderSummary(rows) {
    if (!summaryBody) return;

    const data = Array.isArray(rows) ? rows : [];
    if (!data.length) {
      summaryBody.innerHTML = `<tr><td colspan="5" style="color:#6b7280">No data yet.</td></tr>`;
      return;
    }

    summaryBody.innerHTML = data.map(r => {
      const emp = (r.employeeName || r.employeeId || "—");
      const jobs = Number(r.jobsCompleted || 0);
      const pay = Number(r.totalPay || 0).toFixed(2);
      const exc = Number(r.exceptionCount || 0);
      const lu = r.lastUpdate || "";
      return `
        <tr>
          <td>${escapeHtml(emp)}</td>
          <td class="right">${jobs}</td>
          <td class="right">$${pay}</td>
          <td class="right">${exc}</td>
          <td>${escapeHtml(lu)}</td>
        </tr>
      `;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function refreshAll() {
    setStatus("Loading current pay period…");
    const cur = await payrollCurrent();
    if (!cur || !cur.ok) throw new Error(cur?.error || "payroll_current failed");

    renderPeriod(cur.period);

    if (!currentPeriodId) {
      setStatus("No current period id returned.", "err");
      return;
    }

    setStatus("Loading summary…");
    const sum = await payrollSummary(currentPeriodId);
    if (!sum || !sum.ok) throw new Error(sum?.error || "payroll_summary failed");

    renderSummary(sum.rows);
    setStatus("Ready ✅", "ok");
  }

  // ---------- Boot ----------
  async function boot() {
    setDebug(`API_URL: ${API_URL}`);

    // 1) If we already have a session from /admin, use it
    let authObj = loadSessionAuth();

    // 2) If not, but URL has ?t=TOKEN, try to auth here too
    if (!authObj) {
      const url = new URL(window.location.href);
      const token = url.searchParams.get("t") || "";
      if (token) {
        setStatus("Authorizing…");
        const res = await authWithToken(token);

        if (!res || !res.ok) {
          setStatus(`Denied: ${res?.error || "unauthorized"}`, "err");
          return;
        }

        authObj = {
          ok: true,
          employeeId: res.employeeId,
          employeeName: res.employeeName,
          role: res.role,
          authedAt: new Date().toISOString(),
        };

        saveSessionAuth(authObj);
        removeTokenFromUrl();
      }
    }

    // 3) Must be admin
    if (!requireAdmin(authObj)) {
      setStatus(
        "Denied: admin access required.\n\n" +
        "Open this from the Admin Panel OR use an NFC token link.",
        "err"
      );
      if (pillWho) pillWho.textContent = "Denied";
      return;
    }

    setWho(authObj);

    // 4) Validate API is reachable
    setStatus("Checking secure API…");
    const p = await ping();
    if (!p || !p.ok) throw new Error("Ping did not return ok");

    // 5) Load payroll
    await refreshAll();

    // Buttons
    if (btnRefresh) btnRefresh.onclick = () => refreshAll().catch(err => setStatus(String(err?.message || err), "err"));

    if (btnGenerate) btnGenerate.onclick = async () => {
      try {
        if (!currentPeriodId) return;
        setStatus("Generating / rebuilding summary…");
        const res = await payrollGenerate(currentPeriodId);
        if (!res || !res.ok) throw new Error(res?.error || "payroll_generate failed");
        await refreshAll();
      } catch (err) {
        setStatus(String(err?.message || err), "err");
      }
    };

    if (btnLock) btnLock.onclick = async () => {
      try {
        if (!currentPeriodId) return;
        const ok = confirm(`Lock payroll period ${currentPeriodId}? This should prevent changes.`);
        if (!ok) return;
        setStatus("Locking period…");
        const res = await payrollLock(currentPeriodId);
        if (!res || !res.ok) throw new Error(res?.error || "payroll_lock failed");
        await refreshAll();
      } catch (err) {
        setStatus(String(err?.message || err), "err");
      }
    };
  }

  // Run after DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(err => setStatus(String(err?.message || err), "err")));
  } else {
    boot().catch(err => setStatus(String(err?.message || err), "err"));
  }
})();
