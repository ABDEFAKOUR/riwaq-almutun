(() => {
  const KEY = "riwaq-prefs";
  const readPrefs = () => { try { return Object.assign({ fs: 1, theme: "dark" }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return { fs: 1, theme: "dark" }; } };
  const savePrefs = prefs => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch {} };
  const applyTheme = prefs => {
    const theme = prefs.theme || "dark";
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById("theme-btn");
    if (button) { button.textContent = theme === "dark" ? "☀" : "◐"; button.setAttribute("aria-label", theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"); button.setAttribute("aria-pressed", String(theme === "dark")); button.title = theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"; }
  };
  applyTheme(readPrefs());
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(readPrefs());
    const button = document.getElementById("theme-btn");
    if (!button) return;
    button.addEventListener("click", () => { const next = readPrefs(); next.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; savePrefs(next); applyTheme(next); });
  });
})();