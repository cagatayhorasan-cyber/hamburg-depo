// Dil toggle + localStorage persistence
(function () {
  const KEY = "drc:ui:language";
  const current = localStorage.getItem(KEY) === "de" ? "de" : "tr";
  document.documentElement.lang = current;

  function setLang(lang) {
    const normalized = lang === "de" ? "de" : "tr";
    document.documentElement.lang = normalized;
    localStorage.setItem(KEY, normalized);
    document.querySelectorAll(".help-lang-switch button").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.lang === normalized);
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".help-lang-switch button").forEach((b) => {
      b.addEventListener("click", () => setLang(b.dataset.lang));
      b.classList.toggle("is-active", b.dataset.lang === current);
    });
    // TOC smooth scroll
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href").slice(1);
        const target = document.getElementById(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  });
})();
