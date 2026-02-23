document.addEventListener("DOMContentLoaded", () => {
  // Normalize bio whitespace so extra blank lines don't create huge gaps.
  document.querySelectorAll(".bio-text").forEach((el) => {
    const raw = (el.textContent || "").replace(/\r\n/g, "\n");
    const normalized = raw.replace(/\n{3,}/g, "\n\n").trim();
    el.textContent = normalized;
  });

  // Mobile nav toggle
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
    });
  }

  // About page: Read More / Read Less toggle (keeps original formatting)
  document.querySelectorAll(".bio-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-target");
      const bio = id ? document.getElementById(id) : null;
      if (!bio) return;

      const isExpanded = btn.getAttribute("aria-expanded") === "true";
      if (isExpanded) {
        bio.classList.add("bio-collapsed");
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = "Read More";
      } else {
        bio.classList.remove("bio-collapsed");
        btn.setAttribute("aria-expanded", "true");
        btn.textContent = "Read Less";
      }
    });
  });

  // Text button (iOS-friendly)
  window.handleTextClick = function () {
    const phone = "14842238496";

    const guidedBody =
      "Hello I like what I seen on the About To Shine Cleaning Website and would like a free quote!\n\n" +
      "Floors:\nBedrooms:\nBathrooms:\nPets?:\nCity:";

    const wantsGuided = confirm("Would you like a guided quote text template?");
    const smsBase = `sms:${phone}`;

    if (wantsGuided) {
      const encoded = encodeURIComponent(guidedBody);
      // iOS is more reliable with &body=
      window.location.href = `${smsBase}&body=${encoded}`;
    } else {
      window.location.href = smsBase;
    }
  };
});
