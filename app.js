const STORAGE_KEY = "riwaq-progress-v1";
const DATA_URL = "mutun.json";
let library = [];
let selectedSubject = "الكل";
let activeMatn = null;
let activeIndex = 0;
let revealed = true;
let meaningVisible = false;
let similarVisible = false;
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
const readProgress = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
};
const writeProgress = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
const progressKey = (matnId, itemId) => `${matnId}::${itemId}`;
const resetItemView = () => { revealed = true; meaningVisible = false; similarVisible = false; };

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function loadLibrary() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error("تعذر تحميل المكتبة");
    library = await response.json();
    renderFilters();
    renderLibrary();
    updateStats();
  } catch (error) {
    console.error(error);
    $("matn-grid").innerHTML = '<div class="empty-state">تعذر تحميل بيانات المتون. تأكد من وجود ملف mutun.json بجانب index.html وأنه ملف JSON صالح، ثم أعد تحميل الصفحة.</div>';
  }
}

function renderFilters() {
  const subjects = ["الكل", ...new Set(library.map(item => item.subject))];
  $("subject-filters").innerHTML = subjects.map(subject =>
    `<button class="filter ${subject === selectedSubject ? "active" : ""}" data-subject="${escapeHTML(subject)}">${escapeHTML(subject)}</button>`
  ).join("");
  $("subject-filters").querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      selectedSubject = button.dataset.subject;
      renderFilters(); renderLibrary();
    });
  });
}

function renderLibrary() {
  const query = $("search-input").value.trim().toLowerCase();
  const progress = readProgress();
  const results = library.filter(matn => {
    const matchesSubject = selectedSubject === "الكل" || matn.subject === selectedSubject;
    const haystack = `${matn.title} ${matn.subject} ${matn.description}`.toLowerCase();
    return matchesSubject && haystack.includes(query);
  });
  if (!results.length) {
    $("matn-grid").innerHTML = '<div class="empty-state">لا توجد نتائج مطابقة. جرّب كلمة أخرى.</div>';
    return;
  }
  $("matn-grid").innerHTML = results.map(matn => {
    const mastered = matn.items.filter(item => progress[progressKey(matn.id, item.id)]?.status === "mastered").length;
    return `<article class="matn-card">
      <span class="tag">${escapeHTML(matn.subject)}</span>
      <h3>${escapeHTML(matn.title)}</h3>
      <p>${escapeHTML(matn.description)}</p>
      <div class="card-bottom"><span>${matn.items.length} مقاطع · ${mastered} متقنة</span>
        <button data-open="${escapeHTML(matn.id)}">ابدأ الدراسة ←</button></div>
    </article>`;
  }).join("");
  $("matn-grid").querySelectorAll("[data-open]").forEach(button =>
    button.addEventListener("click", () => openMatn(button.dataset.open)));
}

function openMatn(id) {
  activeMatn = library.find(item => item.id === id);
  if (!activeMatn) return;
  activeIndex = 0;
  resetItemView();
  $("study-panel").classList.remove("hidden");
  $("study-title").textContent = activeMatn.title;
  $("study-subject").textContent = activeMatn.subject;
  renderStudyItem();
  $("study-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderStudyItem() {
  if (!activeMatn) return;
  const item = activeMatn.items[activeIndex];
  const progress = readProgress()[progressKey(activeMatn.id, item.id)];
  $("item-counter").textContent = `المقطع ${activeIndex + 1} من ${activeMatn.items.length}`;
  $("item-reference").textContent = item.reference || "";
  $("item-status").textContent = progress?.status === "mastered" ? "متقَن" : progress?.status === "review" ? "للمراجعة" : "جديد";
  $("item-text").textContent = item.text;
  $("item-text").classList.toggle("concealed", !revealed);
  $("reveal-btn").textContent = revealed ? "إخفاء النص" : "إظهار النص";
  $("item-meaning").textContent = item.note || "لا توجد ملاحظة مضافة لهذا المقطع بعد.";
  $("item-meaning").classList.toggle("hidden", !meaningVisible);
  $("meaning-btn").textContent = meaningVisible ? "إخفاء الملاحظة" : "ملاحظة / شرح";
  $("previous-btn").disabled = activeIndex === 0;
  $("next-btn").disabled = activeIndex === activeMatn.items.length - 1;
  renderSimilar();
}

/* ---------- كشف المتشابهات ---------- */
function highlight(text, words) {
  return words.reduce(
    (html, w) => w ? html.split(escapeHTML(w)).join(`<mark>${escapeHTML(w)}</mark>`) : html,
    escapeHTML(text)
  );
}

function renderSimilar() {
  const btn = $("similar-btn"), box = $("similar-box");
  if (!btn || !box || !activeMatn) return;
  const item = activeMatn.items[activeIndex];
  const groups = (activeMatn.similar || []).filter(s => Array.isArray(s.refs) && s.refs.includes(item.id));
  btn.classList.toggle("hidden", !groups.length);
  btn.textContent = similarVisible ? "إخفاء المتشابهات" : `كشف المتشابهات (${groups.length})`;
  box.classList.toggle("hidden", !similarVisible || !groups.length);
  box.innerHTML = groups.map(s => `
    <div class="similar-group">
      ${s.refs.map(id => {
        const it = activeMatn.items.find(x => x.id === id);
        if (!it) return "";
        const isCurrent = id === item.id;
        return `<div class="similar-item ${isCurrent ? "current" : ""}">
          <small>${escapeHTML(it.reference || "")}</small>
          <p class="${isCurrent && !revealed ? "concealed" : ""}">${highlight(it.text, s.diff || [])}</p>
        </div>`;
      }).join("")}
      ${s.note ? `<p class="similar-note">${escapeHTML(s.note)}</p>` : ""}
      ${s.source ? `<small>المصدر: ${escapeHTML(s.source)}</small>` : ""}
    </div>`).join("");
}

function setItemStatus(status) {
  if (!activeMatn) return;
  const progress = readProgress();
  progress[progressKey(activeMatn.id, activeMatn.items[activeIndex].id)] = {
    status, updatedAt: new Date().toISOString()
  };
  writeProgress(progress);
  updateStats(); renderStudyItem(); renderLibrary();
}

function updateStats() {
  const values = Object.values(readProgress());
  $("saved-count").textContent = values.filter(item => item.status === "mastered").length;
  $("review-count").textContent = values.filter(item => item.status === "review").length;
  const sessions = new Set(values.filter(item => item.updatedAt).map(item => item.updatedAt.slice(0, 10)));
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  $("streak-count").textContent = [...sessions].filter(day => new Date(day) >= weekAgo).length;
}

function go(step) {
  if (!activeMatn) return;
  const next = activeIndex + step;
  if (next < 0 || next >= activeMatn.items.length) return;
  activeIndex = next;
  resetItemView();
  renderStudyItem();
}

on("search-input", "input", renderLibrary);
on("reveal-btn", "click", () => { revealed = !revealed; renderStudyItem(); });
on("meaning-btn", "click", () => { meaningVisible = !meaningVisible; renderStudyItem(); });
on("similar-btn", "click", () => { similarVisible = !similarVisible; renderSimilar(); });
on("mastered-btn", "click", () => setItemStatus("mastered"));
on("review-btn", "click", () => setItemStatus("review"));
on("previous-btn", "click", () => go(-1));
on("next-btn", "click", () => go(1));
on("close-study", "click", () => $("study-panel").classList.add("hidden"));

function updateNetworkStatus() {
  const status = $("offline-status");
  if (!status) return;
  const online = navigator.onLine;
  status.classList.toggle("online", online);
  status.classList.toggle("offline", !online);
  status.innerHTML = `<i></i>${online ? "متصل بالإنترنت" : "تعمل دون اتصال"}`;
}
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);
updateNetworkStatus();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(console.error));
}
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("install-btn")?.classList.remove("hidden");
});
on("install-btn", "click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("install-btn").classList.add("hidden");
});

loadLibrary();
