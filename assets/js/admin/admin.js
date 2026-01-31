/* =========================================================
   About To Shine — Admin Panel (NFC Protected)
   File: /admin/admin.js

   Matches Apps Script router:
   /exec?action=auth&t=TOKEN&d=DEVICEKEY&callback=cb
   ========================================================= */

(() => {
  // ==============================
  // CONFIG (YOUR DEPLOYMENT URL)
  // ==============================
  const API_URL =
    "https://script.google.com/macros/s/AKfycbzjiBgtzj0MIXFonwdeXmVqbSw176C8KzAijd5XwlYHHWqrMztKhtLENC8Td5Yo9kU3/exec";

  // ==============================
  // Storage keys
  // ==============================
  const TOKEN_KEY = "ATS_ADMIN_TOKEN";
  const DEVICE_KEY = "ATS_DEVICE_KEY";

  // ==============================
  // Required DOM IDs on /admin/index.html
  // ==============================
  const elStatus = document.getElementById("status");
  const elMsg = document.getElementById("message");
  const elCards = document.getElementById("cards");

  function setStatus(t) {
    if (elStatus) elStatus.textContent = t || "";
  }
  function setMessage(t) {
    if (elMsg) elMsg.textContent = t || "";
  }
  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ==============================
  // Get token from URL and hide it
  // ==============================
  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get("t");

  if (tokenFromUrl) {
    sessionStorage.setItem(TOKEN_KEY, tokenFromUrl);

    // remove token from address bar
    url.searchParams.delete("t");
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }

  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    setStatus("Missing token");
    setMessage("Unauthorized. Tap your NFC tag again.");
    return;
  }

  // ==============================
  // Device key (stable per device/browser)
  // ==============================
  function getOrCreateDeviceKey() {
    let dk = localStorage.getItem(DEVICE_KEY);
    if (dk) return dk;

    // Create a random stable key (no permissions needed)
    dk = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, dk);
    return dk;
  }

  const deviceKey = getOrCreateDeviceKey();

  // ==============================
  // JSONP helper (avoids CORS issues on iPhone)
  // ==============================
  function jsonp(baseUrl, paramsObj, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const cbName = "__ats_cb_
