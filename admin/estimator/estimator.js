(() => {
  // ✅ SAME Apps Script deployment you’re already using
  const API_URL = "https://script.google.com/macros/s/AKfycbyYBG5s4khMRNDsNiHi-v_dieGqpsYxDHCVB1TC-DLq9uqfigu5OVVXb0NQOBp4qDOX/exec";

  // ✅ Only these admins can use estimator for now
  const ESTIMATOR_ALLOWED = ["E01", "E04"];

  const AUTH_STORAGE = "ats_admin_auth_v1"; // sessionStorage from admin panel

  const app = document.getElementById("app");
  const pill = document.getElementById("pillStatus");

  // ---------- helpers ----------
  const estimate_id = "RES-EST-" + Date.now();
  let tasks = [];
  let selections = {};
  let activeTask = null;

  function money(n){ return "$" + Number(n||0).toFixed(2); }

  function jsonp(url){
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      script.async = true;

      window[cb] = (data) => {
        try { resolve(data); }
        finally {
          try { delete window[cb]; } catch(e){}
          try { script.remove(); } catch(e){}
        }
      };

      script.onerror = () => {
        try { delete window[cb]; } catch(e){}
        try { script.remove(); } catch(e){}
        reject(new Error("JSONP failed to load: " + url));
      };

      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.body.appendChild(script);
    });
  }

  function getAuth(){
    try { return JSON.parse(sessionStorage.getItem(AUTH_STORAGE) || "null"); }
    catch(e){ return null; }
  }

  function setPill(t){ if (pill) pill.textContent = t; }

  function buildUI(){
    app.innerHTML = `
      <div class="card">
        <div class="grid">
          <div><label>Client Name</label><input id="clientName" placeholder="Last, First (recommended)"/></div>
          <div><label>Phone</label><input id="clientPhone" placeholder="(555) 555-5555"/></div>
          <div><label>Address</label><input id="clientAddress" placeholder="Street, City, State"/></div>
          <div><label>Email</label><input id="clientEmail" placeholder="name@email.com"/></div>
          <div><label>Preferred Day</label>
            <select id="prefDay">
              <option value="">Select</option>
              <option>Monday</option><option>Tuesday</option><option>Wednesday</option>
              <option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option>
            </select>
          </div>
          <div><label>Preferred Schedule / Time Window</label><input id="prefTime" placeholder="e.g., mornings, after 2pm"/></div>
          <div><label>Allergies / sensitivities</label><input id="allergies" placeholder="e.g., fragrance-free"/></div>
          <div><label>Pets (names)</label><input id="pets" placeholder="e.g., Luna, Max"/></div>
        </div>
        <div style="margin-top:10px">
          <label>Notes</label>
          <textarea id="notes" placeholder="Notes for walkthrough..."></textarea>
        </div>
      </div>

      <div id="taskSections"></div>

      <div class="sticky">
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div><b>Total:</b> <span id="total">$0.00</span></div>
          <label class="emailRow">
            <input type="checkbox" id="sendEmail" />
            Email estimate PDF to client
          </label>
          <div id="resultLinks" style="font-size:12px;color:#111827"></div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="ghost" id="resetBtn">Reset</button>
          <button class="save" id="saveBtn">Save Estimate (PDF)</button>
        </div>
      </div>

      <div class="modal" id="modal">
        <div class="modalCard">
          <div class="modalTitle" id="modalTitle">Task</div>
          <div class="note">Select Tier (pricing only). Client PDF will NOT show tiers.</div>

          <div class="row2" id="tierRow">
            <div>
              <label>Tier</label>
              <select id="tier">
                <option value="1">Tier 1</option>
                <option value="2">Tier 2</option>
                <option value="3">Tier 3</option>
              </select>
            </div>
            <div id="qtyWrap">
              <label>How many?</label>
              <select id="qty"></select>
            </div>
          </div>

          <div style="display:flex; gap:10px; margin-top:14px; justify-content:flex-end;">
            <button class="ghost" id="unselectBtn">Unselect</button>
            <button class="save" id="confirmBtn">Confirm</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById("resetBtn").onclick = resetAll;
    document.getElementById("saveBtn").onclick = saveFinal;
    document.getElementById("confirmBtn").onclick = confirmModal;
    document.getElementById("unselectBtn").onclick = toggleOff;
  }

  function getClient(){
    return {
      name: document.getElementById('clientName').value.trim(),
      phone: document.getElementById('clientPhone').value.trim(),
      address: document.getElementById('clientAddress').value.trim(),
      email: document.getElementById('clientEmail').value.trim(),
      preferred_day: document.getElementById('prefDay').value.trim(),
      preferred_time: document.getElementById('prefTime').value.trim(),
      allergies: document.getElementById('allergies').value.trim(),
      pets: document.getElementById('pets').value.trim(),
      notes: document.getElementById('notes').value.trim(),
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

    const container = document.getElementById('taskSections');
    container.innerHTML = "";

    Object.keys(bySection).forEach(sec => {
      const card = document.createElement('div');
      card.className = "card";
      card.innerHTML = `<h3>${sec}</h3>`;

      bySection[sec].forEach(t => {
        const sel = selections[t.task_id];
        const on = !!sel;

        const div = document.createElement('div');
        div.className = "task";
        const meta = on ? (t.requires_qty ? `Selected • Qty ${sel.qty}` : "Selected") : "Tap to select";

        div.innerHTML = `
          <div class="box ${on?'on':''}">${on?'✓':''}</div>
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
    document.getElementById('modalTitle').textContent = task.task_name;

    const qtySel = document.getElementById('qty');
    qtySel.innerHTML = "";
    for (let i=1;i<=50;i++){
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = i;
      qtySel.appendChild(opt);
    }

    const existing = selections[task.task_id];
    document.getElementById('tier').value = existing?.tier || 1;
    qtySel.value = existing?.qty || 1;

    document.getElementById('tierRow').style.display = task.requires_tier ? "grid" : "none";
    document.getElementById('qtyWrap').style.display = task.requires_qty ? "block" : "none";

    document.getElementById('modal').classList.add('on');
  }

  function closeModal(){
    document.getElementById('modal').classList.remove('on');
    activeTask = null;
  }

  function confirmModal(){
    const t = activeTask;
    if (!t) return;

    const tier = Number(document.getElementById('tier').value || 1);
    const qty = Number(document.getElementById('qty').value || 1);

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
  }

  function toggleOff(){
    const t = activeTask;
    if (!t) return;
    delete selections[t.task_id];
    closeModal();
    render();
  }

  function calcTotal(){
    // UI-only quick estimate (server remains truth)
    let total = 0;
    Object.values(selections).forEach(s => {
      const tier = Number(s.tier || 1);
      const tierPrice = tier===1?10:(tier===2?20:30);
      total += tierPrice * (Number(s.qty)||1);
    });
    document.getElementById('total').textContent = money(total);
  }

  function resetAll(){
    selections = {};
    setPill("Draft");
    document.getElementById("resultLinks").innerHTML = "";
    render();
  }

  async function loadTasks(){
    const res = await jsonp(`${API_URL}?action=estimate_tasks`);
    if (!res || !res.ok) throw new Error(res?.error || "tasks_failed");
    tasks = res.tasks || [];
    render();
  }

  async function pollStatus(){
    const started = Date.now();
    const maxMs = 90000; // 90 sec

    while (Date.now() - started < maxMs){
      const res = await jsonp(`${API_URL}?action=estimate_status&estimate_id=${encodeURIComponent(estimate_id)}`);

      if (res && res.ok && res.status === "done"){
        return res;
      }
      if (res && res.ok && res.status === "error"){
        throw new Error(res.error || "save_error");
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error("Timed out waiting for PDF. (Try again or check Estimates_Log.)");
  }

  async function saveFinal(){
    if (!validateRequiredFields()) return;

    setPill("Saving…");
    document.getElementById("resultLinks").innerHTML = "";

    const send_email = document.getElementById('sendEmail').checked;

    const payload = {
      estimate_id,
      send_email,
      client: getClient(),
      selections: Object.values(selections)
    };

    // POST (we don’t need to read the response; we poll status via JSONP)
    await fetch(`${API_URL}?action=estimate_save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    setPill("Processing…");

    try{
      const done = await pollStatus();
      setPill("Saved ✅");

      const links = [];
      if (done.pdfUrl) links.push(`<div><b>PDF:</b> <a href="${done.pdfUrl}" target="_blank" rel="noopener">open</a></div>`);
      if (done.docUrl) links.push(`<div><b>DOC:</b> <a href="${done.docUrl}" target="_blank" rel="noopener">open</a></div>`);
      links.push(`<div><b>Total:</b> ${money(done.total || 0)}</div>`);
      if (send_email){
        links.push(`<div><b>Email:</b> ${done.emailSent ? "sent" : "not sent"}${done.emailError ? " ("+done.emailError+")" : ""}</div>`);
      }

      document.getElementById("resultLinks").innerHTML = links.join("");

    }catch(err){
      setPill("Saved (check log)");
      alert("Saved request sent, but status check failed:\n\n" + (err.message || err));
    }
  }

  function gate(){
    const a = getAuth();
    if (!a || !a.ok){
      app.innerHTML = `
        <div class="card">
          <b>Denied:</b> open from Admin Panel first.<br><br>
          <a href="/admin/">Go to Admin</a>
        </div>
      `;
      return null;
    }
    if (!ESTIMATOR_ALLOWED.includes(a.employeeId)){
      app.innerHTML = `
        <div class="card">
          <b>Denied:</b> estimator not enabled for ${a.employeeId}.<br><br>
          <a href="/admin/">Back to Admin</a>
        </div>
      `;
      return null;
    }
    return a;
  }

  async function boot(){
    const a = gate();
    if (!a) return;

    buildUI();
    setPill("Draft");

    try{
      setPill("Loading tasks…");
      await loadTasks();
      setPill("Draft");
    }catch(err){
      setPill("Error");
      app.insertAdjacentHTML("afterbegin", `<div class="card"><b>Task load failed:</b><br>${String(err.message||err)}</div>`);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
