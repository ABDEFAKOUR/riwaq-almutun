const KEY = "riwaq-progress-v2", OLD = "riwaq-progress-v1", LAST = "riwaq-last", PREFS = "riwaq-prefs";
const DATA_URL = "mutun.json", DAY = 864e5;
let library = [], selectedSubject = "الكل", activeMatn = null, activeIndex = 0;
let revealed = true, meaningVisible = false, similarVisible = false, deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const J = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null ? d : v; } catch { return d; } };
const S = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const pk = (m, i) => `${m}::${i}`;
const resetItemView = () => { revealed = true; meaningVisible = false; similarVisible = false; };
const statusOf = (c) => !c ? "جديد" : c.due <= Date.now() ? "للمراجعة" : c.int >= 6 ? "متقَن" : "قيد الحفظ";
const escapeHTML = (v) => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- التقدم (SM-2) ---------- */
function readProgress() {
  const p = J(KEY, null);
  if (p) return p;
  const old = J(OLD, {}), n = {}, now = Date.now();
  for (const [k, v] of Object.entries(old)) {
    const last = Date.parse(v.updatedAt) || now;
    n[k] = v.status === "mastered" ? { ef: 2.5, int: 6, rep: 2, due: now + 6 * DAY, last } : { ef: 2.5, int: 1, rep: 0, due: now, last };
  }
  S(KEY, n); return n;
}
function grade(q) {
  if (!activeMatn) return;
  const all = readProgress(), k = pk(activeMatn.id, activeMatn.items[activeIndex].id);
  const c = all[k] || { ef: 2.5, int: 0, rep: 0 };
  if (q < 3) { c.rep = 0; c.int = 1; }
  else { c.int = c.rep === 0 ? 1 : c.rep === 1 ? 6 : Math.round(c.int * c.ef); c.rep++; }
  c.ef = Math.max(1.3, c.ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  c.last = Date.now(); c.due = q < 3 ? c.last + 6e5 : c.last + c.int * DAY;
  all[k] = c; S(KEY, all);
  updateStats(); renderLibrary();
  if (activeIndex < activeMatn.items.length - 1) go(1); else renderStudyItem();
}
function updateStats() {
  const v = Object.values(readProgress()), now = Date.now();
  $("saved-count").textContent = v.filter(c => c.int >= 6).length;
  $("review-count").textContent = v.filter(c => c.due <= now).length;
  $("streak-count").textContent = new Set(v.filter(c => c.last > now - 7 * DAY).map(c => new Date(c.last).toISOString().slice(0, 10))).size;
}

/* ---------- نسخة احتياطية ---------- */
function exportData() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "riwayq", v: 2, progress: readProgress() })], { type: "application/json" }));
  a.download = `riwayq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function importData(file) {
  if (!file) return;
  try {
    const o = JSON.parse(await file.text());
    if (o.app !== "riwayq" || typeof o.progress !== "object") throw 0;
    const cur = readProgress();
    for (const [k, c] of Object.entries(o.progress)) if (!cur[k] || (c.last || 0) > (cur[k].last || 0)) cur[k] = c;
    S(KEY, cur); updateStats(); renderLibrary(); renderStudyItem();
    alert("تم استيراد النسخة الاحتياطية");
  } catch { alert("ملف النسخة الاحتياطية غير صالح"); }
}

/* ---------- المكتبة ---------- */
async function loadLibrary() {
  try {
    const r = await fetch(DATA_URL);
    if (!r.ok) throw new Error("تعذر تحميل المكتبة");
    library = await r.json();
    renderFilters(); renderLibrary(); updateStats();
  } catch (e) {
    console.error(e);
    $("matn-grid").innerHTML = '<div class="empty-state">تعذر تحميل بيانات المتون. تأكد من وجود ملف mutun.json بجانب index.html وأنه ملف JSON صالح، ثم أعد تحميل الصفحة.</div>';
  }
}
function renderFilters() {
  const subjects = ["الكل", ...new Set(library.map(i => i.subject))];
  $("subject-filters").innerHTML = subjects.map(s =>
    `<button class="filter ${s === selectedSubject ? "active" : ""}" data-subject="${escapeHTML(s)}">${escapeHTML(s)}</button>`).join("");
  $("subject-filters").querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    selectedSubject = b.dataset.subject; renderFilters(); renderLibrary();
  }));
}
function renderLibrary() {
  const q = $("search-input").value.trim().toLowerCase(), progress = readProgress();
  const results = library.filter(m => (selectedSubject === "الكل" || m.subject === selectedSubject) &&
    `${m.title} ${m.subject} ${m.description}`.toLowerCase().includes(q));
  if (!results.length) { $("matn-grid").innerHTML = '<div class="empty-state">لا توجد نتائج مطابقة. جرّب كلمة أخرى.</div>'; return; }
  $("matn-grid").innerHTML = results.map(m => {
    const done = m.items.filter(i => (progress[pk(m.id, i.id)] || {}).int >= 6).length;
    return `<article class="matn-card"><span class="tag">${escapeHTML(m.subject)}</span><h3>${escapeHTML(m.title)}</h3>
      <p>${escapeHTML(m.description)}</p><div class="card-bottom"><span>${m.items.length} مقاطع · ${done} متقنة</span>
      <button data-open="${escapeHTML(m.id)}">ابدأ الدراسة ←</button></div></article>`;
  }).join("");
  $("matn-grid").querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openMatn(b.dataset.open)));
}

/* ---------- الدراسة ---------- */
function openMatn(id) {
  activeMatn = library.find(i => i.id === id);
  if (!activeMatn) return;
  activeIndex = Math.min(J(LAST, {})[id] || 0, activeMatn.items.length - 1);
  resetItemView();
  const sel = $("item-jump");
  if (sel) sel.innerHTML = activeMatn.items.map((it, i) => `<option value="${i}">${i + 1}. ${escapeHTML(it.reference || "")}</option>`).join("");
  $("study-panel").classList.remove("hidden");
  $("study-title").textContent = activeMatn.title;
  $("study-subject").textContent = activeMatn.subject;
  renderStudyItem();
  $("study-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}
/* تقسيم المقطع للاختبار: صدر/عجز إن وُجدا، وإلا تقسيم تلقائي قرب المنتصف (يفضَّل عند علامة وقف) */
function splitItem(item) {
  if (item.sadr && item.ajuz) return [item.sadr, item.ajuz];
  const w = item.text.split(/\s+/);
  if (w.length < 6 || item.reference === "موضع تجريبي") return null;
  const mid = Math.floor(w.length / 2), span = Math.floor(w.length * 0.3);
  let cut = mid;
  search: for (let d = 0; d <= span; d++)
    for (const i of [mid + d, mid - d])
      if (i > 2 && i < w.length - 1 && /[،:؛.]$/.test(w[i - 1])) { cut = i; break search; }
  return [w.slice(0, cut).join(" "), w.slice(cut).join(" ")];
}
function renderStudyItem() {
  if (!activeMatn) return;
  const item = activeMatn.items[activeIndex], t = $("item-text");
  const last = J(LAST, {}); last[activeMatn.id] = activeIndex; S(LAST, last);
  $("item-counter").textContent = `المقطع ${activeIndex + 1} من ${activeMatn.items.length}`;
  $("item-reference").textContent = item.reference || "";
  $("item-status").textContent = statusOf(readProgress()[pk(activeMatn.id, item.id)]);
  const sp = splitItem(item);
  if (sp && !revealed) {      // اختبار: البداية ظاهرة والباقي مخفي
    t.innerHTML = `${escapeHTML(sp[0])} <span class="concealed">${escapeHTML(sp[1])}</span>`;
    t.classList.remove("concealed");
  } else { t.textContent = item.text; t.classList.toggle("concealed", !revealed); }
  $("reveal-btn").textContent = revealed ? (sp ? "اختبر حفظي" : "إخفاء النص") : "إظهار النص";
  $("item-meaning").textContent = item.note || "لا توجد ملاحظة مضافة لهذا المقطع بعد.";
  $("item-meaning").classList.toggle("hidden", !meaningVisible);
  $("meaning-btn").textContent = meaningVisible ? "إخفاء الملاحظة" : "ملاحظة / شرح";
  $("previous-btn").disabled = activeIndex === 0;
  $("next-btn").disabled = activeIndex === activeMatn.items.length - 1;
  const sel = $("item-jump"); if (sel) sel.value = activeIndex;
  renderSimilar();
}
function highlight(text, words) {
  return words.reduce((h, w) => w ? h.split(escapeHTML(w)).join(`<mark>${escapeHTML(w)}</mark>`) : h, escapeHTML(text));
}
function renderSimilar() {
  const btn = $("similar-btn"), box = $("similar-box");
  if (!btn || !box || !activeMatn) return;
  const item = activeMatn.items[activeIndex];
  const groups = (activeMatn.similar || []).filter(s => Array.isArray(s.refs) && s.refs.includes(item.id));
  btn.classList.toggle("hidden", !groups.length);
  btn.textContent = similarVisible ? "إخفاء المتشابهات" : `كشف المتشابهات (${groups.length})`;
  box.classList.toggle("hidden", !similarVisible || !groups.length);
  box.innerHTML = groups.map(s => `<div class="similar-group">${s.refs.map(id => {
    const it = activeMatn.items.find(x => x.id === id); if (!it) return "";
    const cur = id === item.id;
    return `<div class="similar-item ${cur ? "current" : ""}"><small>${escapeHTML(it.reference || "")}</small>
      <p class="${cur && !revealed ? "concealed" : ""}">${highlight(it.text, s.diff || [])}</p></div>`;
  }).join("")}${s.note ? `<p class="similar-note">${escapeHTML(s.note)}</p>` : ""}
    ${s.source ? `<small>المصدر: ${escapeHTML(s.source)}</small>` : ""}</div>`).join("");
}
function go(step) {
  if (!activeMatn) return;
  const n = activeIndex + step;
  if (n < 0 || n >= activeMatn.items.length) return;
  activeIndex = n; resetItemView(); renderStudyItem();
}

/* ---------- التفضيلات: حجم الخط والوضع الليلي ---------- */
const prefs = Object.assign({ fs: 1, theme: "" }, J(PREFS, {}));
function applyPrefs() {
  const r = document.documentElement;
  r.style.setProperty("--fs", prefs.fs);
  r.dataset.theme = prefs.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  S(PREFS, prefs);
}

/* ---------- الأحداث ---------- */
on("search-input", "input", renderLibrary);
on("reveal-btn", "click", () => { revealed = !revealed; renderStudyItem(); });
on("meaning-btn", "click", () => { meaningVisible = !meaningVisible; renderStudyItem(); });
on("similar-btn", "click", () => { similarVisible = !similarVisible; renderSimilar(); });
on("review-btn", "click", () => grade(2));
on("good-btn", "click", () => grade(4));
on("mastered-btn", "click", () => grade(5));
on("previous-btn", "click", () => go(-1));
on("next-btn", "click", () => go(1));
on("close-study", "click", () => $("study-panel").classList.add("hidden"));
on("item-jump", "change", e => { activeIndex = +e.target.value; resetItemView(); renderStudyItem(); });
on("export-btn", "click", exportData);
on("import-input", "change", e => { importData(e.target.files[0]); e.target.value = ""; });
on("font-up", "click", () => { prefs.fs = Math.min(1.6, +(prefs.fs + 0.1).toFixed(1)); applyPrefs(); });
on("font-down", "click", () => { prefs.fs = Math.max(0.8, +(prefs.fs - 0.1).toFixed(1)); applyPrefs(); });
on("theme-btn", "click", () => { prefs.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; applyPrefs(); });

function updateNetworkStatus() {
  const s = $("offline-status"); if (!s) return;
  const online = navigator.onLine;
  s.classList.toggle("online", online); s.classList.toggle("offline", !online);
  s.innerHTML = `<i></i>${online ? "متصل بالإنترنت" : "تعمل دون اتصال"}`;
}
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstallPrompt = e; $("install-btn")?.classList.remove("hidden"); });
on("install-btn", "click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null; $("install-btn").classList.add("hidden");
});

applyPrefs(); updateNetworkStatus(); loadLibrary();
