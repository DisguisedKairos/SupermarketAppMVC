// Simple JS polish (navbar shadow on scroll)
document.addEventListener("DOMContentLoaded", function () {
  const navbar = document.querySelector(".navbar.navbar-dark.bg-dark");

  if (navbar) {
    const toggleScrolledClass = () => {
      if (window.scrollY > 10) {
        navbar.classList.add("cs-navbar-scrolled");
      } else {
        navbar.classList.remove("cs-navbar-scrolled");
      }
    };

    toggleScrolledClass();
    window.addEventListener("scroll", toggleScrolledClass);
  }

// Scroll-in animations for elements with .cs-animate
const animated = document.querySelectorAll(".cs-animate");
if (animated.length > 0 && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("cs-animate-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      threshold: 0.12,
    }
  );

  animated.forEach((el) => observer.observe(el));
} else {
  // Fallback: just show them
  animated.forEach((el) => el.classList.add("cs-animate-visible"));
}


// Dark mode toggle with persistence
const themeToggle = document.getElementById("themeToggle");
const preferred = (localStorage && localStorage.getItem("cs-theme")) || "light";

const applyTheme = (mode) => {
  if (!document.body) return;
  if (mode === "dark") {
    document.body.classList.add("cs-dark");
  } else {
    document.body.classList.remove("cs-dark");
  }
  if (themeToggle) {
    themeToggle.setAttribute("data-mode", mode);
    themeToggle.innerText = mode === "dark" ? "☀️" : "🌙";
    themeToggle.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }
};

applyTheme(preferred);

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = themeToggle.getAttribute("data-mode") || "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    if (localStorage) {
      localStorage.setItem("cs-theme", next);
    }
  });
}

});