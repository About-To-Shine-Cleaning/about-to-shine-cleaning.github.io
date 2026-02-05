document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
    });
  }
});
document.querySelectorAll('.text-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.parentElement.classList.toggle('open');
  });
});
function handleTextClick() {
  const guided = confirm("Would you like a guided quote text template?");

  if (guided) {
    window.location.href =
      "sms:14842238496?body=Hello%20I%20would%20like%20a%20free%20quote!%0A%0AFloors%3A%0ABedrooms%3A%0ABathrooms%3A%0APets%3F%3A%0ACity%3A";
  } else {
    window.location.href = "sms:14842238496";
  }
}
