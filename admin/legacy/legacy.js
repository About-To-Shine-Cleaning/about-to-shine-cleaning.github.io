/* =========================================================
   ATS Legacy Pricing (Admin GUI)
   ✅ Same look/feel as Admin Panel
   ✅ Requires Admin Panel auth (sessionStorage)
   ✅ Calculates locally for instant preview
   ✅ Can call Legacy Apps Script (JSONP) to:
      - write to sheet
      - generate Doc + PDF in Drive
========================================================= */

(() => {
  const AUTH_STORAGE  = "ats_admin_auth_v1";
  const TOKEN_STORAGE = "ats_admin_token_v1";
  const TOKEN_LOCAL   = "ats_admin_token_local_v1";
  const API_URL_STORAGE = "ats_legacy_api_url_v1";

  const statusEl = document.getElementById("status");
  const whoEl = document.getElementById("who");
  const debugEl = document.getElementById("debug");

  const el = (id) => document.getElementById(id);

  function setStatus(msg, state) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.remove("is-loading", "is-success", "is-error");
    if (state === "loading") statusEl.classList.add("is-loading");
    if (state === "success") statusEl.classList.add("is-success");
    if (state === "error") statusEl.classList.add("is-error");
  }

  function setDebug(msg) { if (debugEl) debugEl.textContent = msg || ""; }

  function loadAuth() {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj && obj.ok ? obj : null;
    } catch (e) {
      return null;
    }
  }

  function loadAnyToken() {
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

  function requireAuthOrRedirect() {
    const a = loadAuth();
    const t = loadAnyToken();
    if (!a || !t) {
      setStatus("Admin sign-in required. Redirecting…", "error");
      setTimeout(() => window.location.href = "/admin/", 800);
      return false;
    }
    if (whoEl) whoEl.textContent = `${a.employeeId} • ${a.employeeName || a.employeeId}`;
    return true;
  }

  function money(n) {
    const x = Number(n || 0);
    return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function calc(inputs) {
    const billing = inputs.billingMethod; // weekly|monthly
    const currentAmount = num(inputs.currentAmount);
    const weeks = Math.max(0.01, num(inputs.weeksPerMonth));
    const tax = Math.max(0, num(inputs.taxRate));
    const strategy = inputs.strategy;
    const addW = num(inputs.addPerWeek);
    const addM = num(inputs.addPerMonth);
    const share = Math.min(1, Math.max(0, num(inputs.clientTaxShare)));
    const netPct = Math.max(0, num(inputs.targetNetPct));

    const oldTotal = (billing === "weekly") ? (currentAmount * weeks) : currentAmount;
    const passThrough = (oldTotal * (1 + tax)) - oldTotal;

    let targetTotal = oldTotal;
    if (strategy === "absorb") {
      targetTotal = oldTotal;
    } else if (strategy === "add_week") {
      targetTotal = oldTotal + (addW * weeks);
    } else if (strategy === "add_month") {
      targetTotal = oldTotal + addM;
    } else if (strategy === "split_tax") {
      targetTotal = oldTotal + (passThrough * share);
    } else if (strategy === "target_net") {
      targetTotal = (oldTotal * netPct) * (1 + tax);
    }

    const newBase = targetTotal / (1 + tax);
    const taxLine = targetTotal - newBase;
    const weeklyTotal = targetTotal / weeks;

    const businessAbsorbs = Math.max(0, (oldTotal * (1 + tax)) - targetTotal);
    const clientAbsorbs = Math.max(0, targetTotal - oldTotal);

    return {
      oldTotal, passThrough, targetTotal, newBase, taxLine, weeklyTotal, businessAbsorbs, clientAbsorbs,
      inputs: {
        ...inputs,
        weeksPerMonth: weeks,
        taxRate: tax
      }
    };
  }

  function explain(calcObj) {
    const s = calcObj.inputs.strategy;
    const taxPct = (calcObj.inputs.taxRate * 100).toFixed(1) + "%";
    if (s === "absorb") return `Keeping the client total the same. Tax rate is ${taxPct} — business absorbs the tax impact.`;
    if (s === "add_week") return `Adding ${money(calcObj.inputs.addPerWeek)} per week. Tax rate is ${taxPct}.`;
    if (s === "add_month") return `Adding ${money(calcObj.inputs.addPerMonth)} per month. Tax rate is ${taxPct}.`;
    if (s === "split_tax") return `Splitting sales tax — client pays ${(calcObj.inputs.clientTaxShare*100).toFixed(0)}% of the pass‑through tax at ${taxPct}.`;
    if (s === "target_net") return `Targeting net revenue at ${(calcObj.inputs.targetNetPct*100).toFixed(0)}% (after tax). Tax rate is ${taxPct}.`;
    return "Adjusted totals calculated.";
  }

  function readInputs() {
    return {
      clientName: (el("clientName").value || "").trim(),
      billingMethod: el("billingMethod").value,
      currentAmount: el("currentAmount").value,
      weeksPerMonth: el("weeksPerMonth").value,
      taxRate: el("taxRate").value,
      strategy: el("strategy").value,
      addPerWeek: el("addPerWeek").value,
      addPerMonth: el("addPerMonth").value,
      clientTaxShare: el("clientTaxShare").value,
      targetNetPct: el("targetNetPct").value,
    };
  }

  function render(calcObj) {
    el("outBase").textContent = money(calcObj.newBase);
    el("outTax").textContent = money(calcObj.taxLine);
    el("outTotal").textContent = money(calcObj.targetTotal);
    el("outWeekly").textContent = money(calcObj.weeklyTotal);
    el("outOld").textContent = money(calcObj.oldTotal);
    el("outPass").textContent = money(calcObj.passThrough);
    el("outAbsorb").textContent = money(calcObj.businessAbsorbs);
    el("outClientAbsorb").textContent = money(calcObj.clientAbsorbs);
    el("explain").textContent = explain(calcObj);
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
        reject(new Error("JSONP failed to load"));
      };

      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.body.appendChild(script);
    });
  }

  function loadApiUrl() {
    try {
      const v = (localStorage.getItem(API_URL_STORAGE) || "").trim();
      return v;
    } catch (e) {
      return "";
    }
  }

  function saveApiUrl(v) {
    try { localStorage.setItem(API_URL_STORAGE, v); } catch (e) {}
  }

  async function saveAndGenerate(calcObj) {
    const apiUrl = (el("apiUrl").value || "").trim();
    if (!apiUrl) {
      throw new Error("Missing Legacy API URL. Paste your Apps Script /exec URL.");
    }
    saveApiUrl(apiUrl);

    // Keep payload small + deterministic
    const payload = {
      clientName: calcObj.inputs.clientName || "Legacy Client",
      billingMethod: calcObj.inputs.billingMethod === "weekly" ? "Weekly rate" : "Monthly total",
      currentAmount: Number(calcObj.inputs.currentAmount || 0),
      weeksPerMonth: Number(calcObj.inputs.weeksPerMonth || 0),
      taxRate: Number(calcObj.inputs.taxRate || 0),
      strategy: calcObj.inputs.strategy,
      addPerWeek: Number(calcObj.inputs.addPerWeek || 0),
      addPerMonth: Number(calcObj.inputs.addPerMonth || 0),
      clientTaxShare: Number(calcObj.inputs.clientTaxShare || 0),
      targetNetPct: Number(calcObj.inputs.targetNetPct || 0),
      // outputs (what gets stored / printed)
      out: {
        oldTotal: calcObj.oldTotal,
        newBase: calcObj.newBase,
        taxLine: calcObj.taxLine,
        newTotal: calcObj.targetTotal,
        weeklyTotal: calcObj.weeklyTotal,
        passThrough: calcObj.passThrough,
        clientAbsorbs: calcObj.clientAbsorbs,
        businessAbsorbs: calcObj.businessAbsorbs,
      }
    };

    const enc = encodeURIComponent(JSON.stringify(payload));
    // Expected backend route: route=legacy_export (JSONP)
    const url = `${apiUrl}?route=legacy_export&payload=${enc}`;
    const res = await jsonp(url);

    if (!res || !res.ok) {
      throw new Error((res && res.error) ? res.error : "Legacy export failed");
    }

    const pdfUrl = res.pdfUrl || res.pdf || "";
    const docUrl = res.docUrl || res.doc || "";
    let msg = "Saved ✅";
    if (pdfUrl) msg += `\nPDF: ${pdfUrl}`;
    if (docUrl) msg += `\nDoc: ${docUrl}`;

    el("saveResult").textContent = msg;
    setStatus("Saved + generated files ✅", "success");
  }

  function boot() {
    if (!requireAuthOrRedirect()) return;

    // load API URL if saved before
    const saved = loadApiUrl();
    if (saved) el("apiUrl").value = saved;

    // Defaults aligned with sheet defaults
    el("weeksPerMonth").value = "4";
    el("taxRate").value = "0.06";
    el("strategy").value = "split_tax";
    el("clientTaxShare").value = "0.25";
    el("targetNetPct").value = "1";

    // initial render
    const c = calc(readInputs());
    render(c);
    setStatus("Ready. Adjust pricing below.", "success");

    el("btnAdjust").onclick = () => {
      try {
        const calcObj = calc(readInputs());
        render(calcObj);
        el("saveResult").textContent = "";
        setStatus("Adjusted totals updated ✅", "success");
      } catch (e) {
        setStatus(String(e.message || e), "error");
      }
    };

    el("btnSavePdf").onclick = async () => {
      try {
        setStatus("Saving + generating Doc/PDF…", "loading");
        el("saveResult").textContent = "";
        const calcObj = calc(readInputs());
        render(calcObj);
        await saveAndGenerate(calcObj);
      } catch (e) {
        setStatus(String(e.message || e), "error");
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
