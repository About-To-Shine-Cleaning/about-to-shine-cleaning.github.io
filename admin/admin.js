const GAS_URL = "https://script.google.com/macros/s/AKfycbzjiBgtzj0MIXFonwdeXmVqbSw176C8KzAijd5XwlYHHWqrMztKhtLENC8Td5Yo9kU3/exec";

const statusEl = document.getElementById("status");
const panelEl = document.getElementById("panel");
const whoEl = document.getElementById("who");

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getOrCreateDeviceKey() {
  const keyName = "ats_devicekey";
  let k = localStorage.getItem(keyName);
  if (!k) {
    k = "dev_" + crypto.getRandomValues(new Uint32Array(4)).join("-");
    localStorage.setItem(keyName, k);
  }
  return k;
}

// Remove token from address bar after load (token still works, just not visible)
function stripTokenFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("t");
  history.replaceState({}, "", url.toString());
}

window.onAdminAuth = function (res) {
  if (!res || !res.ok) {
    const why = res?.reason || "unauthorized";
    statusEl.textContent = `Access denied (${why}).`;
    panelEl.style.display = "none";
    return;
  }

  // Role gate (only admin can see admin panel)
  if ((res.role || "").toLowerCase() !== "admin") {
    statusEl.textContent = "Access denied (not admin).";
    panelEl.style.display = "none";
    return;
  }

  statusEl.textContent = "Access granted ✅";
  whoEl.textContent = `Signed in: ${res.employeeid} (${res.status})`;
  panelEl.style.display = "block";

  stripTokenFromUrl();
};

(function boot() {
  const t = (getParam("t") || "").trim();
  if (!t) {
    statusEl.textContent = "Missing token.";
    return;
  }

  const deviceKey = getOrCreateDeviceKey();

  // JSONP call (bypasses CORS)
  const s = document.createElement("script");
  s.src = `${GAS_URL}?action=auth&t=${encodeURIComponent(t)}&device=${encodeURIComponent(deviceKey)}&callback=onAdminAuth`;
  s.async = true;
  s.onerror = () => statusEl.textContent = "Auth failed (script load error).";
  document.body.appendChild(s);
})();
