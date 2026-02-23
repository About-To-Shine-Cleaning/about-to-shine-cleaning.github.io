/* ATS Admin Nav v1 — visual-only global navigation (hamburger + drawer)
   Does NOT alter auth, tokens, routes, or storage behavior. */
(function () {
  const TOOLS = [
    { label: "Admin Home", href: "/admin/" },
    { label: "Clock", href: "/clock.html" },
    { label: "Estimator", href: "/admin/estimator/" },
    { label: "Payroll", href: "/admin/payroll/" },
    { label: "Site Report / Analytics", href: "/admin/analytics.html" },
    { label: "Legacy Pricing", href: "/admin/legacy/" }
  ];

// Preserve emp=... across tool links (Clock auth context)
function getEmpQuery() {
  try {
    const p = new URLSearchParams(window.location.search);
    const emp = p.get("emp");
    return emp ? `emp=${encodeURIComponent(emp)}` : "";
  } catch (e) {
    return "";
  }
}

function withEmp(href) {
  const empQ = getEmpQuery();
  if (!empQ) return href;
  return href.includes("?") ? `${href}&${empQ}` : `${href}?${empQ}`;
}


  function normalizePath(p) {
    try {
      // keep only pathname
      const u = new URL(p, window.location.origin);
      p = u.pathname;
    } catch (e) {}
    if (!p) return "/";
    // ensure trailing slash normalization for folder routes
    return p.endsWith("/") ? p : p;
  }

  function isActive(toolHref, currentPath) {
    const toolPath = normalizePath(toolHref);
    const cur = normalizePath(currentPath);

    // exact match
    if (toolPath === cur) return true;

    // treat /admin/estimator/ active for /admin/estimator/index.html
    if (toolPath.endsWith("/") && cur === (toolPath + "index.html")) return true;

    // treat /admin/ active for /admin/index.html
    if (toolPath === "/admin/" && cur === "/admin/index.html") return true;

    // treat /admin/payroll/ active for /admin/payroll/index.html etc.
    if (toolPath.endsWith("/") && cur.startsWith(toolPath)) return true;

    return false;
  }

  function buildDrawer() {
    if (document.getElementById("atsNavDrawer")) return;

    const backdrop = document.createElement("div");
    backdrop.className = "ats-nav-backdrop";
    backdrop.id = "atsNavBackdrop";

    const drawer = document.createElement("div");
    drawer.className = "ats-nav-drawer";
    drawer.id = "atsNavDrawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Admin menu");

    const header = document.createElement("header");
    const h2 = document.createElement("h2");
    h2.textContent = "Menu";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "ats-nav-close";
    closeBtn.setAttribute("aria-label", "Close menu");
    closeBtn.textContent = "✕";
    header.appendChild(h2);
    header.appendChild(closeBtn);

    const list = document.createElement("nav");
    list.className = "ats-nav-list";

    const curPath = window.location.pathname;

    TOOLS.forEach(t => {
      const a = document.createElement("a");
      a.className = "ats-nav-item";
      a.href = withEmp(t.href);
      a.textContent = t.label;

      if (isActive(t.href, curPath)) {
        a.setAttribute("aria-current", "page");
      }
      list.appendChild(a);
    });

    const footer = document.createElement("div");
    footer.className = "ats-nav-footer";
    const live = document.createElement("a");
    live.className = "ats-live-btn";
    live.href = "https://abouttoshinecleaning.com";
    live.target = "_blank";
    live.rel = "noopener";
    live.textContent = "Go to Live Website";
    footer.appendChild(live);

    drawer.appendChild(header);
    drawer.appendChild(list);
    drawer.appendChild(footer);

    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    function openDrawer() {
      backdrop.style.opacity = "1";
      backdrop.style.pointerEvents = "auto";
      drawer.style.transform = "translateX(0)";
      document.body.style.overflow = "hidden";
      const burger = document.querySelector(".ats-burger");
      if (burger) burger.setAttribute("aria-expanded", "true");
      closeBtn.focus({ preventScroll: true });
    }

    function closeDrawer() {
      backdrop.style.opacity = "0";
      backdrop.style.pointerEvents = "none";
      drawer.style.transform = "translateX(105%)";
      document.body.style.overflow = "";
      const burger = document.querySelector(".ats-burger");
      if (burger) burger.setAttribute("aria-expanded", "false");
      if (burger) burger.focus({ preventScroll: true });
    }

    closeBtn.addEventListener("click", closeDrawer);
    backdrop.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });

    const burger = document.querySelector(".ats-burger");
    if (burger) burger.addEventListener("click", openDrawer);
  }

  function init() {
    // Only run on pages that opted into ats-admin body class
    if (!document.body || !document.body.classList.contains("ats-admin")) return;
    buildDrawer();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
