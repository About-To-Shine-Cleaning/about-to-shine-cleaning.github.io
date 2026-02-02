
/* =========================================================
   ATS Payroll (Admin UI) — v2 (front-end)
   - Requires you to be authenticated via /admin/ (v1.5)
   - Reads sessionStorage set by admin panel:
     - ats_admin_auth_v1  (employeeId, employeeName, role)
     - ats_admin_token_v1 (the NFC token used)
     - ats_device_key_v1  (device binding key)
   - Calls Apps Script via JSONP:
     GET  ?action=payroll_current_period&t=...&d=...
     POST ?action=payroll_generate&t=...&d=...
     GET  ?action=payroll_summary&period_id=...&t=...&d=...
     POST ?action=payroll_lock&period_id=...&t=...&d=...
========================================================= */

(() => {
  // ✅ SET THIS to your PAYROLL Apps Script /exec URL
  // Example: https://script.google.com/macros/s/AKfy.../exec
  const PAYROLL_API_URL = "https://script.google.com/macros/s/AKfycbyCCv30Q3l0Gg2zGs2sHD6a9jHm678QQKV_mdTm_GFnjR-xsmaYdDonmlBugX3TeHPiJA/exec";

  // Storage keys (must match admin panel)
  const AUTH_STORAGE = "ats_admin_auth_v1";
  const TOKEN_STORAGE = "ats_admin_token_v1";
  const DEVICE_KEY_STORAGE = "ats_device_key_v1";

  // UI
  const pillWho = document.getElementById("pillWho");
  const statusBox = document.getElementById("statusBox");
  const debugEl = document.getElementById("debug");

  const periodIdEl = document.getElementById("periodId");
  const periodStartEl = document.getElementById("periodStart");
  const periodEndEl = document.getElementById("periodEnd");
  const periodPaydayEl = document.getElementById("periodPayday");
  const periodStatusEl = document.getElementById("periodStatus");

  const summaryHint = document.getElementById("summaryHint");
  const summaryBody = document.getElementById("summaryBody");

  const btnGenerate = document.getElementById("btnGenerate");
  const btnRefresh = document.getElementById("btnRefresh");
  const btnLock = document.getElementById("btnLock");

  function setStatus(text, kind){
    statusBox.textContent = text || "";
    statusBox.classList.remove("ok","err");
    if (kind) statusBox.classList.add(kind);
  }

  function setDebug(text){
    debugEl.textContent = text || "";
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

  // POST helper (Apps Script returns "OK")
  async function post(action, payload, token, deviceKey, periodId=""){
    const url = new URL(PAYROLL_API_URL);
    url.searchParams.set("action", action);
    if (periodId) url.searchParams.set("period_id", periodId);
    url.searchParams.set("t", token);
    url.searchParams.set("d", deviceKey);

    const resp = await fetch(url.toString(), {
      method: "POST",
      headers: {"Content-Type":"text/plain;charset=utf-8"},
      body: JSON.stringify(payload || {})
    });
    const txt = await resp.text();
    return txt;
  }

  function money(n){
    const x = Number(n || 0);
    return "$" + x.toFixed(2);
  }

  function loadAuth(){
    let auth = null;
    try { auth = JSON.parse(sessionStorage.getItem(AUTH_STORAGE) || "null"); } catch(e){}
    const token = sessionStorage.getItem(TOKEN_STORAGE) || "";
    const deviceKey = localStorage.getItem(DEVICE_KEY_STORAGE) || "";
    return { auth, token, deviceKey };
  }

  function deny(msg){
    setStatus(
      "Denied.\n\n" +
      (msg || "You must enter Payroll from the Admin Panel after authenticating.") +
      "\n\nGo back to /admin/ and tap your NFC token again.",
      "err"
    );
  }

  function renderSummary(rows){
    if (!Array.isArray(rows) || rows.length === 0){
      summaryBody.innerHTML = `<tr><td colspan="5" style="color:#6b7280">No summary data for this period yet.</td></tr>`;
      return;
    }

    summaryBody.innerHTML = "";
    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${(r.employeeName || r.employeeId || "").toString()}</td>
        <td class="right">${Number(r.jobsCompleted || 0)}</td>
        <td class="right">${money(r.totalPay || 0)}</td>
        <td class="right">${Number(r.exceptionCount || 0)}</td>
        <td>${(r.lastUpdate || "").toString()}</td>
      `;
      summaryBody.appendChild(tr);
    });
  }

  async function apiCurrentPeriod(token, deviceKey){
    const url = new URL(PAYROLL_API_URL);
    url.searchParams.set("action","payroll_current_period");
    url.searchParams.set("t", token);
    url.searchParams.set("d", deviceKey);
    return jsonp(url.toString());
  }

  async function apiSummary(periodId, token, deviceKey){
    const url = new URL(PAYROLL_API_URL);
    url.searchParams.set("action","payroll_summary");
    url.searchParams.set("period_id", periodId);
    url.searchParams.set("t", token);
    url.searchParams.set("d", deviceKey);
    return jsonp(url.toString());
  }

  async function refreshAll(){
    const { auth, token, deviceKey } = loadAuth();

    if (!auth || !auth.ok || auth.role !== "admin") return deny("No active admin session.");
    if (!token || !deviceKey) return deny("Missing admin token/device key in storage.");

    pillWho.textContent = `${auth.employeeId} • ${auth.employeeName}`;

    if (!PAYROLL_API_URL || PAYROLL_API_URL.includes("PASTE_YOUR_")) {
      setStatus("Setup needed: set PAYROLL_API_URL in /admin/payroll/payroll.js", "err");
      setDebug("PAYROLL_API_URL is not set yet.");
      return;
    }

    setStatus("Loading current pay period…");
    setDebug(`PAYROLL_API_URL: ${PAYROLL_API_URL}`);

    const p = await apiCurrentPeriod(token, deviceKey);
    if (!p || !p.ok){
      setStatus("Failed to load current period:\n" + (p && p.error ? p.error : "unknown_error"), "err");
      return;
    }

    periodIdEl.textContent = p.periodId || "—";
    periodStartEl.textContent = p.startDate || "—";
    periodEndEl.textContent = p.endDate || "—";
    periodPaydayEl.textContent = p.payDate || "—";
    periodStatusEl.textContent = p.status || "—";

    summaryHint.textContent = `Summary for ${p.periodId} (Clock Out entries only)`;

    setStatus("Loading payroll summary…");
    const s = await apiSummary(p.periodId, token, deviceKey);
    if (!s || !s.ok){
      setStatus("Loaded period, but summary failed:\n" + (s && s.error ? s.error : "unknown_error"), "err");
      renderSummary([]);
      return;
    }

    renderSummary(s.rows || []);
    setStatus("Ready ✅", "ok");
  }

  async function generate(){
    const { auth, token, deviceKey } = loadAuth();
    if (!auth || !auth.ok || auth.role !== "admin") return deny("No active admin session.");
    if (!token || !deviceKey) return deny("Missing admin token/device key in storage.");

    const periodId = periodIdEl.textContent || "";
    setStatus("Generating payroll summary…");

    try{
      const txt = await post("payroll_generate", {}, token, deviceKey, periodId);
      // Apps Script replies "OK"
      setDebug("Generate response: " + txt);
      await refreshAll();
    }catch(err){
      setStatus("Generate failed:\n" + (err?.message || err), "err");
    }
  }

  async function lockPeriod(){
    const { auth, token, deviceKey } = loadAuth();
    if (!auth || !auth.ok || auth.role !== "admin") return deny("No active admin session.");
    if (!token || !deviceKey) return deny("Missing admin token/device key in storage.");

    const periodId = periodIdEl.textContent || "";
    if (!periodId) return;

    if (!confirm(`Lock pay period ${periodId}?\n\nThis should be done only after payout.`)) return;

    setStatus("Locking period…");
    try{
      const txt = await post("payroll_lock", {}, token, deviceKey, periodId);
      setDebug("Lock response: " + txt);
      await refreshAll();
    }catch(err){
      setStatus("Lock failed:\n" + (err?.message || err), "err");
    }
  }

  // Wire buttons
  btnGenerate?.addEventListener("click", generate);
  btnRefresh?.addEventListener("click", refreshAll);
  btnLock?.addEventListener("click", lockPeriod);

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshAll);
  } else {
    refreshAll();
  }
})();
