// ==============================
// 👷 Employees
// ==============================
const employees = {
  E01: "Shannon Kovecses",
  E02: "Shauna Bari",
  E03: "Caprea Kovecses",
  E04: "Matthew Bari",
  E05: "Employee Five",
  E06: "Employee Six",
  E07: "Employee Seven",
  E08: "Employee Eight",
  E09: "Employee Nine",
  E10: "Employee Ten"
};

// ==============================
// 🔗 Google Apps Script Web App URL
// ==============================
const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbyCCv30Q3l0Gg2zGs2sHD6a9jHm678QQKV_mdTm_GFnjR-xsmaYdDonmlBugX3TeHPiJA/exec";

// same endpoint returns jobs via GET (JSONP)
const JOBS_URL = SHEET_URL;

// ==============================
// DOM
// ==============================
const display = document.getElementById("employee-display");
const statusEl = document.getElementById("clock-status");
const jobSelect = document.getElementById("jobSelect");
const notesEl = document.getElementById("jobNotes");

const btnClockIn = document.getElementById("btnClockIn");
const btnBreakStart = document.getElementById("btnBreakStart");
const btnBreakEnd = document.getElementById("btnBreakEnd");
const btnClockOut = document.getElementById("btnClockOut");

// ==============================
// Employee from URL
// ==============================
const params = new URLSearchParams(window.location.search);
const employeeId = params.get("emp");
const employeeName = employees[employeeId];

if (!employeeName) {
  display.textContent = "Unauthorized Access";
  throw new Error("Invalid employee ID");
}
display.textContent = `Welcome, ${employeeName}`;

// ==============================
// State (persisted)
// ==============================
let onBreak = sessionStorage.getItem("onBreak") === "true";
let isClockedIn = sessionStorage.getItem("isClockedIn") === "true";
let selectedJob = null;

// Remember last job selection per employee
const lastJobKey = `lastJob_${employeeId}`;

// ==============================
// UI helpers
// ==============================
function setStatus(msg, kind = "info") {
  const styles = {
    info: "background:#fff;border:1px solid rgba(0,0,0,0.15);padding:10px 12px;border-radius:10px;",
    ok: "background:#eaffea;border:1px solid rgba(0,0,0,0.15);padding:10px 12px;border-radius:10px;",
    warn: "background:#fff7db;border:1px solid rgba(0,0,0,0.15);padding:10px 12px;border-radius:10px;",
    err: "background:#ffeaea;border:1px solid rgba(0,0,0,0.15);padding:10px 12px;border-radius:10px;"
  };
  if (!statusEl) return;
  statusEl.setAttribute("style", styles[kind] + "margin:12px 0;");
  statusEl.textContent = msg;
}

function updateButtons() {
  const hasJob = !!selectedJob;

  if (btnClockIn) btnClockIn.disabled = isClockedIn || !hasJob;
  if (btnBreakStart) btnBreakStart.disabled = !isClockedIn || onBreak || !hasJob;
  if (btnBreakEnd) btnBreakEnd.disabled = !isClockedIn || !onBreak || !hasJob;
  if (btnClockOut) btnClockOut.disabled = !isClockedIn || !hasJob;

  if (notesEl) notesEl.disabled = !isClockedIn;
}

// ==============================
// Job dropdown change
// ==============================
jobSelect.addEventListener("change", (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt && opt.value) {
    selectedJob = {
      id: opt.value,
      name: opt.dataset.name || "",
      pay: Number(opt.dataset.pay || 0)
    };
    sessionStorage.setItem(lastJobKey, selectedJob.id);
    setStatus(`Selected: ${selectedJob.name}`, "info");
  } else {
    selectedJob = null;
    sessionStorage.removeItem(lastJobKey);
    setStatus("Please select a job to continue.", "warn");
  }
  updateButtons();
});

// ==============================
// 📋 Job load (JSONP to bypass CORS)
// ==============================
window.loadJobs = function (jobs) {
  // clear options except first placeholder
  while (jobSelect.options.length > 1) jobSelect.remove(1);

  jobs.forEach((job) => {
    const opt = document.createElement("option");
    opt.value = job.id;
    opt.textContent = `${job.name}`; // ✅ pay NOT shown
    opt.dataset.name = job.name;
    opt.dataset.pay = job.pay;       // ✅ pay still logged
    jobSelect.appendChild(opt);
  });

  // restore last job if present
  const lastJobId = sessionStorage.getItem(lastJobKey);
  if (lastJobId) {
    jobSelect.value = lastJobId;
    const opt = jobSelect.selectedOptions[0];
    if (opt && opt.value) {
      selectedJob = {
        id: opt.value,
        name: opt.dataset.name || "",
        pay: Number(opt.dataset.pay || 0)
      };
    }
  }

  if (!selectedJob) {
    setStatus("Select the current job to enable clock actions.", "info");
  } else {
    setStatus(`Selected: ${selectedJob.name}`, "info");
  }

  updateButtons();
};

(function injectJobsScript() {
  const s = document.createElement("script");
  s.src = `${JOBS_URL}?callback=loadJobs`;
  s.async = true;
  s.onerror = () => setStatus("Jobs failed to load (script error).", "err");
  document.body.appendChild(s);
})();

// ==============================
// GPS helper
// ==============================
function getLocation(callback) {
  if (!navigator.geolocation) {
    callback(null, true);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => callback(pos.coords, false),
    () => callback(null, true),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ==============================
// POST helper (sendBeacon)
// ==============================
function postLog(payload) {
  const body = new URLSearchParams({
    payload: JSON.stringify(payload)
  }).toString();

  // sendBeacon is most reliable on mobile Safari
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/x-www-form-urlencoded" });
    const ok = navigator.sendBeacon(SHEET_URL, blob);
    if (ok) return;
  }

  // fallback
  fetch(SHEET_URL, {
    method: "POST",
    body,
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
}

// ==============================
// Log event
// ==============================
function logEvent(action) {
  // capture notes immediately (before any async GPS / sendBeacon)
  const notesValue =
    action === "Clock Out"
      ? (document.getElementById("jobNotes")?.value || "").trim()
      : "";

  getLocation((coords, gpsDenied) => {
    const payload = {
      employeeId,
      employeeName,
      action,
      jobId: selectedJob?.id || "",
      jobName: selectedJob?.name || "",
      jobPay: selectedJob?.pay || "",
      notes: notesValue, // ✅ use captured value
      latitude: coords?.latitude || "",
      longitude: coords?.longitude || "",
      accuracy: coords?.accuracy || "",
      gpsDenied,
      timestamp: new Date().toISOString()
    };

    postLog(payload);
  });
}



// ==============================
// Actions (called by buttons)
// ==============================
window.clockIn = function () {
  if (!selectedJob) return setStatus("Please select a job before clocking in.", "warn");
  if (isClockedIn) return setStatus("You are already clocked in.", "warn");

  onBreak = false;
  isClockedIn = true;
  sessionStorage.setItem("onBreak", "false");
  sessionStorage.setItem("isClockedIn", "true");

  logEvent("Clock In");
  setStatus(`Clocked In ✅ (${selectedJob.name})`, "ok");
  updateButtons();
};

window.startBreak = function () {
  if (!selectedJob) return setStatus("Select a job before starting break.", "warn");
  if (!isClockedIn) return setStatus("You must Clock In before starting break.", "warn");
  if (onBreak) return setStatus("Break is already active.", "warn");

  onBreak = true;
  sessionStorage.setItem("onBreak", "true");

  logEvent("Break Start");
  setStatus("Break Started 🟡", "ok");
  updateButtons();
};

window.endBreak = function () {
  if (!selectedJob) return setStatus("Select a job before ending break.", "warn");
  if (!isClockedIn) return setStatus("You must Clock In before ending break.", "warn");
  if (!onBreak) return setStatus("No active break to end.", "warn");

  onBreak = false;
  sessionStorage.setItem("onBreak", "false");

  logEvent("Break End");
  setStatus("Break Ended ✅", "ok");
  updateButtons();
};

window.clockOut = function () {
  if (!selectedJob) return setStatus("Please select a job before clocking out.", "warn");
  if (!isClockedIn) return setStatus("You are not clocked in.", "warn");

  if (onBreak) {
    logEvent("Break End");
    onBreak = false;
    sessionStorage.setItem("onBreak", "false");
  }

  logEvent("Clock Out");

  isClockedIn = false;
  sessionStorage.setItem("isClockedIn", "false");

  setStatus("Clocked Out ✅ (Notes saved if entered)", "ok");
  if (notesEl) notesEl.value = "";
  updateButtons();
};

// Init
updateButtons();
