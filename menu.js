/* القائمة الجانبية المشتركة بين صفحات رِواق المتون */
(() => {
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("app-menu");
  const backdrop = document.getElementById("menu-backdrop");
  const close = document.getElementById("menu-close");
  if (!toggle || !menu || !backdrop || !close) return;

  let previousFocus = null;
  let closeTimer;
  const openMenu = () => {
    window.clearTimeout(closeTimer);
    previousFocus = document.activeElement;
    menu.hidden = false;
    backdrop.hidden = false;
    window.requestAnimationFrame(() => menu.classList.add("is-open"));
    menu.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "إغلاق القائمة");
    document.body.classList.add("menu-open");
    close.focus();
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
    }, 230);
    if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
  };

  toggle.addEventListener("click", () => {
    if (toggle.getAttribute("aria-expanded") === "true") closeMenu();
    else openMenu();
  });
  close.addEventListener("click", closeMenu);
  backdrop.addEventListener("click", closeMenu);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") closeMenu();
  });
  // رابط قسم الفيديو يضاف مركزياً إلى القائمة المشتركة.
  if (!menu.querySelector('a[href="./video.html"]')) {
    const link = document.createElement("a");
    link.href = "./video.html";
    link.dataset.menuLink = "";
    link.innerHTML = '<span aria-hidden="true">▶</span> شرح المتون بالفيديو';
    const settingsLink = menu.querySelector('a[href="./settings.html"]');
    const nav = menu.querySelector(".app-menu-links");
    if (nav) nav.insertBefore(link, settingsLink || null);
  }

  menu.querySelectorAll("[data-menu-link]").forEach(link => {
    link.addEventListener("click", closeMenu);
  });
})();
