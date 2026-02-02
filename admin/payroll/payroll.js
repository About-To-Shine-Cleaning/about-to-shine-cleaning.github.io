/* =========================================================
   ATS Payroll (Admin UI) — v2.1
   ✅ Uses unified Apps Script backend (JSONP)
   ✅ Reads token from sessionStorage OR ?t= in URL (fixes missing token)
   ✅ Payments table: one row per employee per period + PAID button
========================================================= */

(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbxZdZi2eojV04LBbXikTIrg60WKvX21BGijgpqLdBdwjPiJquC_GzBudMvXgcu0oMGd/exec";

  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  const AUTH_STORAGE  = "ats_admin_auth_v1";
  const TOKEN_STORAGE = "ats_admin_token_v1";

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

  // ✅ Payments UI
  const paymentsHint = document.getElementById("paymentsHint");
  const paymentsBody = document.getElementById("paymentsBody");
  const paymentsTotals = document.getElementById("paymentsTotals");

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

  function getTokenFromSession() {
    try { return (sessionStorage.getItem(TOKEN_STORAGE) || "").trim(); } catch (e) { return ""; }
  }
  function saveTokenToSession(token) {
    try { sessionStorage.setItem(TOKEN_STORAGE, token); } catch (e) {}
  }

  // ✅ If you land here with /admin/payroll/?t=TOKEN capture it once, then remove it
  function captureTokenFromUrl() {
    try {
      const url = new URL(window.location.href);
      const t = (url.searchParams.get("t") || "").trim();
      if (t) {
        saveTokenToSession(t);
        url.searchParams.delete("t");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    } catch (e) {}
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

  function secureUrl(action, extraQs = "") {
    const t = getTokenFromSession();
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

  // ✅ NEW
  async function payrollPayments(periodId){ return jsonp(secureUrl("payroll_payments", `period_id=${encodeURIComponent(periodId)}`)); }

  async function payrollMarkPaid(periodId, employeeId, paidMethod, reference, notes) {
    const t = getTokenFromSession();
    const d = getDeviceKey();

    return fetch(`${API_URL}?action=payroll_mark_paid&t=${encodeURIComponent(t)}&d=${encodeURIComponent(d)}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        periodId,
        employeeId,
        paid: true,
        paidMethod: paidMethod || "",
        reference: reference || "",
        notes: notes || ""
      })
    });
  }

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
          <td style="padding:10px 12px;">${escapeHtml(emp)}</td>
          <td class="right" style="padding:10px 12px;">${jobs}</td>
          <td class="right" style="padding:10px 12px;">$${pay}</td>
          <td class="right" style="padding:10px 12px;">${exc}</td>
          <td style="padding:10px 12px;">${escapeHtml(lu)}</td>
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
        <td style="padding:10px 12px;">${escapeHtml(r.employee)}</td>
        <td style="padding:10px 12px;">${escapeHtml(r.date)}</td>
        <td style="padding:10px 12px;">${escapeHtml(r.job)}</td>
        <td class="right" style="padding:10px 12px;">$${escapeHtml(r.pay)}</td>
      </tr>
    `).join("");

    payoutHint.textContent = currentPeriodId ? `Job lines for ${currentPeriodId}` : "—";
    payoutTotals.textContent = `Grand Total: $${grandTotal}`;
    payoutCard.classList.remove("hidden");
    payoutCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderPayments(rows, period) {
    if (!paymentsBody) return;

    const data = Array.isArray(rows) ? rows : [];
    const start = period?.startDate || (data[0]?.startDate || "");
    const end   = period?.endDate   || (data[0]?.endDate || "");

    if (paymentsHint) {
      paymentsHint.textContent = (start && end) ? `One line per employee • ${start} → ${end}` : "One line per employee for this period.";
    }

    if (!data.length) {
      paymentsBody.innerHTML = `<tr><td colspan="5" style="color:#6b7280">No payment rows yet.</td></tr>`;
      if (paymentsTotals) paymentsTotals.textContent = "";
      return;
    }

    const grand = data.reduce((sum, r) => sum + Number(r.totalPay || 0), 0);
    if (paymentsTotals) paymentsTotals.textContent = `Grand Total: $${grand.toFixed(2)}`;

    paymentsBody.innerHTML = data.map(r => {
      const empName = r.employeeName || r.employeeId || "—";
      const periodText = `${r.startDate || start} → ${r.endDate || end}`;
      const total = Number(r.totalPay || 0).toFixed(2);

      const status = r.paid
        ? `✔ PAID${r.paidAt ? " • " + escapeHtml(r.paidAt) : ""}`
        : "NOT PAID";

      const btn = r.paid
        ? `<button class="btn secondary" disabled style="width:auto; padding:10px 12px; border-radius:12px;">PAID</button>`
        : `<button class="btn" data-emp="${escapeHtml(r.employeeId)}" style="width:auto; padding:10px 12px; border-radius:12px;">Mark Paid</button>`;

      return `
        <tr>
          <td style="padding:10px 12px;">${escapeHtml(empName)}</td>
          <td style="padding:10px 12px;">${escapeHtml(periodText)}</td>
          <td class="right" style="padding:10px 12px;">$${escapeHtml(total)}</td>
          <td style="padding:10px 12px;">${status}</td>
          <td class="right" style="padding:10px 12px;">${btn}</td>
        </tr>
      `;
    }).join("");

    paymentsBody.querySelectorAll("button[data-emp]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const empId = btn.getAttribute("data-emp");
        if (!empId || !currentPeriodId) return;

        const ok = confirm(`Mark ${empId} as PAID for ${currentPeriodId}?`);
        if (!ok) return;

        const method = prompt("Paid method? (Check / ACH / Cash)", "Check") || "";
        const reference = prompt("Reference? (optional: check # / bank ref)", "") || "";
        const notes = prompt("Notes? (optional)", "") || "";

        try {
          setStatus("Marking as paid…");
          await payrollMarkPaid(currentPeriodId, empId, method, reference, notes);
          await refreshPaymentsOnly();
          setStatus("Paid saved ✅", "ok");
        } catch (err) {
          setStatus(String(err?.message || err), "err");
        }
      });
    });
  }

  async function refreshPaymentsOnly() {
    if (!currentPeriodId) return;
    const pay = await payrollPayments(currentPeriodId);
    if (!pay || !pay.ok) throw new Error(pay?.error || "payroll_payments failed");
    renderPayments(pay.rows, pay.period);
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

    setStatus("Loading payments…");
    await refreshPaymentsOnly();

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

      const t = getTokenFromSession();
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

    captureTokenFromUrl();

    const authObj = loadSessionAuth();
    if (!requireAdmin(authObj)) {
      setStatus("Denied: admin access required.\n\nOpen this from the Admin Panel.", "err");
      if (pillWho) pillWho.textContent = "Denied";
      return;
    }
    setWho(authObj);

    if (!getTokenFromSession()) {
      setStatus("Denied: missing token.\n\nOpen from Admin Panel or use a link with ?t=TOKEN once.", "err");
      return;
    }

    setStatus("Checking secure API…");
    const p = await ping();
    if (!p || !p.ok) throw new Error("Ping did not return ok");

    await refreshAll();

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
        if (!currentPeriodId) return;
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
