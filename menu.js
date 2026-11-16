/* القائمة الجانبية المشتركة بين صفحات رِواق المتون */
(() => {
  "use strict";

  function initMenu() {
    const toggle = document.getElementById("menu-toggle");
    const menu = document.getElementById("app-menu");
    const backdrop = document.getElementById("menu-backdrop");
    const closeButton = document.getElementById("menu-close");

    // لا نوقف تهيئة القائمة بسبب غياب زر الإغلاق؛ زر ☰ والغطاء يكفيان.
    if (!toggle || !menu || !backdrop) return;

    let previousFocus = null;
    let closeTimer = null;

    const openMenu = () => {
      window.clearTimeout(closeTimer);
      previousFocus = document.activeElement;
      menu.hidden = false;
      backdrop.hidden = false;
      menu.setAttribute("aria-hidden", "false");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "إغلاق القائمة");
      document.body.classList.add("menu-open");
      window.requestAnimationFrame(() => menu.classList.add("is-open"));
      if (closeButton) closeButton.focus();
    };

    const closeMenu = () => {
      menu.classList.remove("is-open");
      menu.setAttribute("aria-hidden", "true");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "فتح القائمة");
      document.body.classList.remove("menu-open");
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        if (menu.getAttribute("aria-hidden") === "true") {
          menu.hidden = true;
          backdrop.hidden = true;
        }
      }, 240);
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      } else {
        toggle.focus();
      }
    };

    toggle.addEventListener("click", () => {
      if (toggle.getAttribute("aria-expanded") === "true") closeMenu();
      else openMenu();
    });
    if (closeButton) closeButton.addEventListener("click", closeMenu);
    backdrop.addEventListener("click", closeMenu);

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        closeMenu();
      }
    });

    const currentUrl = new URL(window.location.href);
    const normalizePath = path => path.replace(/\/+$/, "") || "/";
    menu.querySelectorAll("[data-menu-link]").forEach(link => {
      const linkUrl = new URL(link.getAttribute("href"), window.location.href);
      const samePath = normalizePath(linkUrl.pathname) === normalizePath(currentUrl.pathname);
      const isCurrent = samePath && (linkUrl.hash
        ? currentUrl.hash === linkUrl.hash
        : !currentUrl.hash);
      if (isCurrent) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
      link.addEventListener("click", closeMenu);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMenu, { once: true });
  } else {
    initMenu();
  }
})();
