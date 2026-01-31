(() => {
  // ==========================
  // CONFIG
  // ==========================
  const API_URL = "https://script.google.com/macros/s/AKfycbyYBG5s4khMRNDsNiHi-v_dieGqpsYxDHCVB1TC-DLq9uqfigu5OVVXb0NQOBp4qDOX/exec"; // must end in /exec

  // ==========================
  // DOM
  // ==========================
  const statusEl = document.getElementById("status");
  const whoEl = document.getElementById("who");
  const cardsEl = document.getElementById("cards");
  const debugEl = document.getElementById("debug");
  const clockBtn = document.getElementById("clockBtn");

  function setStatus(msg){ statusEl.textContent = String(msg || ""); }
  function setDebug(msg){ debugEl.textContent = String(msg || ""); }

  // NEVER allow “blank page”
  window.onerror = function(message, source, lineno, colno, error){
    setStatus("JS Error:\n" + message);
    setDebug("Source: " + source + " @ " + lineno + ":" + colno);
    return true;
  };

  // ==========================
  // TOKEN + DEVICE KEY
  // ==========================
  const url = new URL(window.location.href);
  const token = url.searchParams.get("t") || "";

  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  function getDeviceKey(){
    let key = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!key) {
      key = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  }

  function removeTokenFromUrl(){
    try{
      const clean = new URL(window.location.href);
      clean.searchParams.delete("t");
      window.history.replaceState({}, "", clean.pathname + (clean.search ? clean.search : ""));
    } catch(e) {}
  }

  // ==========================
  // JSONP
  // ==========================
  function jsonp(u){
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const sep = u.includes("?") ? "&" : "?";
      script.src = u + sep + "callback=" + cb;

      window[cb] = (data) => {
        try { resolve(data); }
        finally {
          delete window[cb];
          script.remove();
        }
      };

      script.onerror = () => {
        delete window[cb];
        script.remove();
        reject(new Error("JSONP failed to load: " + script.src));
      };

      document.body.appendChild(script);
    });
  }

  // ==========================
  // BOOT
  // ==========================
  async function boot(){
    // Basic “is page even running?” proof
    setStatus("Admin panel loaded.\nChecking NFC token…");
    setDebug("Location: " + window.location.pathname);

    if (!token) {
      setStatus("Denied: missing token.\nUse the NFC link that includes ?t=YOURTOKEN");
      setDebug("Tip: Your NFC tag should point to /admin/?t=...");
      return;
    }

    // Quick ping first (helps diagnose wrong URL instantly)
    try{
      const ping = await jsonp(API_URL + "?action=ping");
      if (!ping || !ping.ok) throw new Error("Ping failed");
    } catch(err){
      setStatus("Error: API not reachable.\n(Your API_URL is wrong OR deployment access isn't 'Anyone')");
      setDebug(String(err && err.message ? err.message : err));
      return;
    }

    const deviceKey = getDeviceKey();

    try{
      setStatus("API reachable ✅\nAuthenticating…");

      const authUrl =
        API_URL +
        "?action=auth" +
        "&t=" + encodeURIComponent(token) +
        "&d=" + encodeURIComponent(deviceKey);

      const res = await jsonp(authUrl);

      if (!res || !res.ok) {
        setStatus("Denied: " + (res && res.error ? res.error : "unauthorized"));
        setDebug(res ? JSON.stringify(res) : "No response object");
        return;
      }

      whoEl.textContent = res.employeeId + " • " + res.employeeName;
      setStatus("Access granted ✅");
      cardsEl.classList.remove("hidden");

      // Clock link
      clockBtn.href = "/clock.html?emp=" + encodeURIComponent(res.employeeId);

      // Remove token after auth
      removeTokenFromUrl();
      setDebug("Device binding active.");
    } catch(err){
      setStatus("Error during auth.");
      setDebug(String(err && err.message ? err.message : err));
    }
  }

  boot();
})();
