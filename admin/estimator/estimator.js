/* =========================================================
   ATS Estimator (Website UI) -> Apps Script Backend (JSONP)
   - Loads tasks via:  GET ?action=estimate_tasks
   - Saves via:        POST ?action=estimate_save
   - Polls via:        GET ?action=estimate_status&estimate_id=...
   - v1.5: requires Admin session auth + allows E01/E04 only
========================================================= */

(() => {
  // ✅ SAME EXEC as admin panel
  const API_URL = "https://script.google.com/macros/s/AKfycbxZdZi2eojV04LBbXikTIrg60WKvX21BGijgpqLdBdwjPiJquC_GzBudMvXgcu0oMGd/exec"

  // ✅ v1.5 access
  const AUTH_STORAGE = "ats_admin_auth_v1"; // sessionStorage
  const ESTIMATOR_ALLOWED = ["E01", "E04"];

  const estimate_id = "RES-EST-" + Date.now();
  let tasks = [];
  let selections = {};
  let activeTask = null;

  function getSessionAuth(){
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE);
      return raw ? JSON.parse(raw) : null;
    } catch(e){
      return null;
    }
  }

  function showGateMessage(msg){
    setStatus("Error");
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `
        <div class="card">
          <div style="font-weight:900; margin-bottom:8px;">Estimator access required</div>
          <div style="white-space:pre-wrap; color:#111827;">${(msg || "").replace(/</g,"&lt;")}</div>
          <div style="margin-top:12px;">
            <a class="back" href="/admin/" style="color:#111827; font-weight:900; text-decoration:none;">← Back to Admin</a>
          </div>
        </div>
      `;
    } else {
      alert(msg);
      window.location.href = "/admin/";
    }
  }

  // ---------- JSONP helper ----------
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

  // ---------- UI helpers ----------
  function money(n){ return "$" + Number(n||0).toFixed(2); }

  function setStatus(text){
    const pill = document.getElementById("pillStatus");
    if (pill) pill.textContent = text || "";
  }

  function getClient(){
    return {
      name: (document.getElementById("clientName")?.value || "").trim(),
      phone: (document.getElementById("clientPhone")?.value || "").trim(),
      address: (document.getElementById("clientAddress")?.value || "").trim(),
      email: (document.getElementById("clientEmail")?.value || "").trim(),
      preferred_day: (document.getElementById("prefDay")?.value || "").trim(),
      preferred_time: (document.getElementById("prefTime")?.value || "").trim(),
      allergies: (document.getElementById("allergies")?.value || "").trim(),
      pets: (document.getElementById("pets")?.value || "").trim(),
      notes: (document.getElementById("notes")?.value || "").trim(),
    };
  }

  function validateRequiredFields(){
    const c = getClient();
    const missing = [];
    if (!c.name) missing.push("Client Name");
    if (!c.phone) missing.push("Phone");
    if (!c.address) missing.push("Address");
    if (!c.email) missing.push("Email");
    if (missing.length){
      alert("Please fill in: " + missing.join(", "));
      return false;
    }
    return true;
  }

  function render(){
    const bySection = {};
    tasks.forEach(t => (bySection[t.section] = bySection[t.section] || []).push(t));

    const container = document.getElementById("taskSections");
    if (!container) return;

    container.innerHTML = "";
    Object.keys(bySection).forEach(sec => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<h3>${sec}</h3>`;

      bySection[sec].forEach(t => {
        const sel = selections[t.task_id];
        const on = !!sel;
        const div = document.createElement("div");
        div.className = "task";
        const meta = on ? (t.requires_qty ? `Selected • Qty ${sel.qty}` : "Selected") : "Tap to select";
        div.innerHTML = `
          <div class="box ${on ? "on" : ""}">${on ? "✓" : ""}</div>
          <div style="flex:1;">
            <div class="name">${t.task_name}</div>
            <div class="meta">${meta}</div>
          </div>
        `;
        div.onclick = () => openModal(t);
        card.appendChild(div);
      });

      container.appendChild(card);
    });

    calcTotal();
  }

  function openModal(task){
    activeTask = task;
    document.getElementById("modalTitle").textContent = task.task_name;

    const qtySel = document.getElementById("qty");
    qtySel.innerHTML = "";
    for (let i=1;i<=50;i++){
      const opt = document.createElement("option");
      opt.value = i; opt.textContent = i;
      qtySel.appendChild(opt);
    }

    const existing = selections[task.task_id];
    document.getElementById("tier").value = existing?.tier || 1;
    qtySel.value = existing?.qty || 1;

    document.getElementById("tierRow").style.display = task.requires_tier ? "grid" : "none";
    document.getElementById("qtyWrap").style.display = task.requires_qty ? "block" : "none";

    document.getElementById("modal").classList.add("on");
  }

  function closeModal(){
    document.getElementById("modal").classList.remove("on");
    activeTask = null;
  }

  window.confirmModal = function(){
    const t = activeTask;
    if (!t) return;

    const tier = Number(document.getElementById("tier").value || 1);
    const qty = Number(document.getElementById("qty").value || 1);

    selections[t.task_id] = {
      task_id: t.task_id,
      task_name: t.task_name,
      section: t.section,
      tier: t.requires_tier ? tier : "",
      qty: t.requires_qty ? qty : 1,
      selected: true
    };

    closeModal();
    render();
  };

  window.toggleOff = function(){
    const t = activeTask;
    if (!t) return;
    delete selections[t.task_id];
    closeModal();
    render();
  };

  window.resetAll = function(){
    selections = {};
    setStatus("Draft");
    render();
  };

  function calcTotal(){
    let total = 0;
    Object.values(selections).forEach(s => {
      const tier = Number(s.tier || 1);
      const tierPrice = tier===1?10:(tier===2?20:30); // display only
      total += tierPrice * (Number(s.qty)||1);
    });
    const totalEl = document.getElementById("total");
    if (totalEl) totalEl.textContent = money(total);
  }

  async function saveFinal(){
    if (!validateRequiredFields()) return;

    const send_email = document.getElementById("sendEmail").checked;

    setStatus("Saving...");
    try {
      await fetch(API_URL + "?action=estimate_save", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          estimate_id,
          send_email,
          client: getClient(),
          selections: Object.values(selections)
        })
      });

      await pollStatus(send_email);
    } catch (err) {
      setStatus("Error");
      alert("Save failed: " + (err?.message || err));
    }
  }

  async function pollStatus(send_email){
    const started = Date.now();
    const timeoutMs = 90000;

    while (Date.now() - started < timeoutMs) {
      const st = await jsonp(API_URL + "?action=estimate_status&estimate_id=" + encodeURIComponent(estimate_id));
      if (st && st.ok && st.status === "done") {
        setStatus("Saved");
        if (send_email) {
          if (st.emailSent) alert("Saved and emailed to client.");
          else alert("Saved, but email did not send.\n\nReason: " + (st.emailError || "Unknown error"));
        } else {
          alert("Saved. PDF link logged.");
        }
        return;
      }
      if (st && st.ok && st.status === "error") {
        setStatus("Error");
        alert("Save failed: " + (st.error || "Unknown error"));
        return;
      }
      await new Promise(r => setTimeout(r, 1200));
    }

    setStatus("Saved?");
    alert("Save is taking longer than expected. Check the Estimates_Log / Estimator_Results sheet.");
  }

  window.saveFinal = saveFinal;

  // ---------- BOOT ----------
  async function boot(){
    // ✅ v1.5 session gate
    const a = getSessionAuth();
    if (!a || !a.ok || !a.employeeId) {
      showGateMessage("Please open the Admin Panel first (NFC token), then tap the Estimator card.");
      return;
    }
    if (!ESTIMATOR_ALLOWED.includes(a.employeeId)) {
      showGateMessage(`Denied: ${a.employeeId} is not permitted to use the estimator yet.\n\nGo back to Admin.`);
      return;
    }

    try {
      setStatus("Loading tasks…");
      const res = await jsonp(API_URL + "?action=estimate_tasks");
      if (!res || !res.ok) throw new Error(res?.error || "Task load failed");

      tasks = res.tasks || [];
      render();
      setStatus("Draft");
    } catch (err) {
      setStatus("Error");
      const msg = (err?.message || err || "").toString();
      alert("Task load failed: " + msg);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
