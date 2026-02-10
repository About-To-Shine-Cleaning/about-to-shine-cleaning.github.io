document.addEventListener("DOMContentLoaded", () => {
  // Mobile nav toggle
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
    });
  }

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
