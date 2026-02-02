/* =========================================================
   ATS Payroll (Admin UI) — v2.1
   ✅ Reads token from sessionStorage OR localStorage (Option A bookmark safe)
========================================================= */

(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbxZdZi2eojV04LBbXikTIrg60WKvX21BGijgpqLdBdwjPiJquC_GzBudMvXgcu0oMGd/exec";

  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  const AUTH_STORAGE  = "ats_admin_auth_v1";
  const TOKEN_STORAGE = "ats_admin_token_v1";
  const TOKEN_LOCAL   = "ats_admin_token_local_v1";

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
  const btnAddOverride = document.getElementById("btnAddOverride");
  const btnPayouts = document.getElementById("btnPayouts");

  const summaryHint = document.getElementById("summaryHint");
  const summaryBody = document.getElementById("summaryBody");

  const payoutCard = document.getElementById("payoutCard");
  const payoutHint = document.getElementById("payoutHint");
  const payoutBody = document.getElementById("payoutBody");
  const payoutTotals = document.getElementById("payoutTotals");

  let currentPeriodId = "";

  function setStatus(msg, kind) {
    if (!statusBox) return;
    statusBox.classList.remove("ok", "err");
    if (kind === "ok") statusBox.classList.add("ok");
    if (kind === "err") statusBox.classList.add("err");
    statusBox.textContent = msg || "";
  }
  function setDebug(msg) { if (debugEl) debugEl.textContent = msg || ""; }

  function getDeviceKey() {
    let key = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!key) {
      key = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  }

  function getToken() {
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

  function loadSessionAuth() {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (obj && obj.ok && obj.employeeId && obj.role) return obj;
    } catch (e) {}
    return null;
  }

  function requireAdmin(authObj) {
    return !!(authObj && authObj.ok && String(authObj.role||"").toLowerCase() === "admin");
  }

  function setWho(authObj) {
    if (!pillWho) return;
    pillWho.textContent = `${authObj.employeeId} • ${authObj.employeeName || authObj.employeeId}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

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

  function secureUrl(action, extraQs = "") {
    const t = getToken();
    const d = getDeviceKey();
    const base = `${API_URL}?action=${encodeURIComponent(action)}&t=${encodeURIComponent(t)}&d=${encodeURIComponent(d)}`;
    return extraQs ? (base + "&" + extraQs) : base;
  }

  async function ping() { return jsonp(`${API_URL}?action=ping`); }
  async function payrollCurrent() { return jsonp(secureUrl("payroll_current")); }
  async function payrollSummary(periodId) { return jsonp(secureUrl("payroll_summary", `period_id=${encodeURIComponent(periodId)}`)); }
  async function payrollGenerate(periodId){ return jsonp(secureUrl("payroll_generate", `period_id=${encodeURIComponent(periodId)}`)); }
  async function payrollLock(periodId){ return jsonp(secureUrl("payroll_lock", `period_id=${encodeURIComponent(periodId)}`)); }
  async function payrollPayouts(periodId){ return jsonp(secureUrl("payroll_payouts", `period_id=${encodeURIComponent(periodId)}`)); }

  function renderPeriod(p) {
    currentPeriodId = p?.periodId || "";
    if (periodIdEl) periodIdEl.textContent = p?.periodId || "—";
    if (periodStartEl) periodStartEl.textContent = p?.startDate || "—";
    if (periodEndEl) periodEndEl.textContent = p?.endDate || "—";
    if (periodPaydayEl) periodPaydayEl.textContent = p?.payday || "—";
    if (periodStatusEl) periodStatusEl.textContent = p?.status || "—";
    if (summaryHint) summaryHint.textContent = currentPeriodId ? `Showing summary for ${currentPeriodId}` : "—";
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

  function renderPayouts(payouts) {
    if (!payoutCard || !payoutBody || !payoutHint || !payoutTotals) return;

    const employees = payouts?.employees || [];
    const grandTotal = Number(payouts?.grandTotal || 0).toFixed(2);

    if (!employees.length) {
      payoutBody.innerHTML = `<tr><td colspan="4" style="color:#6b7280">No job lines found for this period.</td></tr>`;
      payoutHint.textContent = currentPeriodId ? `Job lines for ${currentPeriodId}` : "—";
      payoutTotals.textContent = `Grand Total: $${grandTotal}`;
      payoutCard.classList.remove("hidden");
      return;
    }

    const rows = [];
    employees.forEach(emp => {
      (emp.jobs || []).forEach(j => {
        rows.push({
          employee: emp.employeeName || emp.employeeId,
          date: j.date || "",
          job: j.jobName || "",
          pay: Number(j.jobPay || 0).toFixed(2)
        });
      });
    });

    payoutBody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.employee)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.job)}</td>
        <td class="right">$${escapeHtml(r.pay)}</td>
      </tr>
    `).join("");

    payoutHint.textContent = currentPeriodId ? `Job lines for ${currentPeriodId}` : "—";
    payoutTotals.textContent = `Grand Total: $${grandTotal}`;
    payoutCard.classList.remove("hidden");
    payoutCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refreshAll() {
    setStatus("Loading current pay period…");
    const cur = await payrollCurrent();
    if (!cur || !cur.ok) throw new Error(cur?.error || "payroll_current failed");
    renderPeriod(cur.period);

    setStatus("Loading summary…");
    const sum = await payrollSummary(currentPeriodId);
    if (!sum || !sum.ok) throw new Error(sum?.error || "payroll_summary failed");

    renderSummary(sum.rows);
    setStatus("Ready ✅", "ok");
  }

  async function addOneOffJob() {
    try {
      const employeeId = prompt("Employee ID (e.g., E04):");
      if (!employeeId) return;

      const date = prompt("Date (YYYY-MM-DD):");
      if (!date) return;

      const jobName = prompt("Job Name:");
      if (!jobName) return;

      const jobPay = prompt("Job Pay (number):", "");
      const startTime = prompt("Start Time (HH:MM, optional):", "");
      const endTime = prompt("End Time (HH:MM, optional):", "");
      const address = prompt("Address (optional):", "");
      const notes = prompt("Notes (optional):", "");

      const t = getToken();
      const d = getDeviceKey();

      setStatus("Adding one-off job to Overrides…");

      await fetch(`${API_URL}?action=schedule_override_add&t=${encodeURIComponent(t)}&d=${encodeURIComponent(d)}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ employeeId, date, jobName, jobPay, startTime, endTime, address, notes })
      });

      setStatus("One-off job added ✅", "ok");
      alert("Added. This will appear in Today/This Week once the schedule page reads Overrides.");
    } catch (err) {
      setStatus(String(err?.message || err), "err");
    }
  }

  async function boot() {
    setDebug(`API_URL: ${API_URL}`);

    // If token missing, send back to Admin panel sign-in
    const token = getToken();
    if (!token) {
      setStatus("Denied: missing token.\n\nOpen /admin/ and sign in.", "err");
      if (pillWho) pillWho.textContent = "Denied";
      return;
    }

    const authObj = loadSessionAuth();
    // If auth object missing (new tab, refresh, etc.), still allow—backend enforces admin + device binding.
    if (requireAdmin(authObj)) setWho(authObj);
    else if (pillWho) pillWho.textContent = "Admin";

    setStatus("Checking secure API…");
    const p = await ping();
    if (!p || !p.ok) throw new Error("Ping did not return ok");

    await refreshAll();

    if (btnRefresh) btnRefresh.onclick = () => refreshAll().catch(err => setStatus(String(err?.message || err), "err"));

    if (btnGenerate) btnGenerate.onclick = async () => {
      try {
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
        const ok = confirm(`Lock payroll period ${currentPeriodId}?`);
        if (!ok) return;
        setStatus("Locking period…");
        const res = await payrollLock(currentPeriodId);
        if (!res || !res.ok) throw new Error(res?.error || "payroll_lock failed");
        await refreshAll();
      } catch (err) {
        setStatus(String(err?.message || err), "err");
      }
    };

    if (btnAddOverride) btnAddOverride.onclick = () => addOneOffJob();

    if (btnPayouts) btnPayouts.onclick = async () => {
      try {
        setStatus("Loading job breakdown…");
        const res = await payrollPayouts(currentPeriodId);
        if (!res || !res.ok) throw new Error(res?.error || "payroll_payouts failed");
        renderPayouts(res.payouts);
        setStatus("Ready ✅", "ok");
      } catch (err) {
        setStatus(String(err?.message || err), "err");
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(err => setStatus(String(err?.message || err), "err")));
  } else {
    boot().catch(err => setStatus(String(err?.message || err), "err"));
  }
})();
