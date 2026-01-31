/* =========================================================
   About To Shine — Admin Panel (NFC Protected)
   File: /admin/admin.js

   - Reads token from URL (?t=...)
   - Stores in sessionStorage
   - Removes token from address bar (history.replaceState)
   - Auth checks via JSONP against Apps Script Web App
   ========================================================= */

(() => {
  // ==============================
  // CONFIG
  // ==============================
  const API_URL =
    "https://script.google.com/macros/s/AKfycbzjiBgtzj0MIXFonwdeXmVqbSw176C8KzAijd5XwlYHHWqrMztKhtLENC8Td5Yo9kU3/exec";

  // Where to store the token after NFC tap
  const TOKEN_KEY = "ATS_ADMIN_TOKEN";

  // ==============================
  // DOM helpers (expects these IDs)
  // ==============================
  const elStatus = document.getElementById("status");
  const elMsg = document.getElementById("message");
  const elCards = document.getElementById("cards");

  function setStatus(text) {
    if (elStatus) elStatus.textContent = text;
  }
  function setMessage(text) {
    if (elMsg) elMsg.textContent = text || "";
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
  // Token logic
  // ==============================
  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get("t");

  // If token is in URL, store it and remove it from address bar
  if (tokenFromUrl) {
    sessionStorage.setItem(TOKEN_KEY, tokenFromUrl);

    url.searchParams.delete("t");
    // Remove token from the visible URL
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }

  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    setStatus("Missing token");
    setMessage("Unauthorized. Please tap your NFC tag again.");
    return;
  }

  // ==============================
  // JSONP helper (avoids CORS issues on iPhone/Safari)
  // ==============================
  function jsonp(url, timeoutMs = 10000) {
    return new Promise((resolve, rej
