const KEY = "riwaq-progress-v2", OLD = "riwaq-progress-v1", LAST = "riwaq-last", PREFS = "riwaq-prefs", DAILY_GOAL = "riwaq-daily-goal";
const DATA_URL = "mutun.json", DAY = 864e5, HISTORY = "riwaq-study-history";
let library = [], selectedSubject = "الكل", activeMatn = null, activeIndex = 0;
let revealed = true, meaningVisible = false, similarVisible = false, deferredInstallPrompt = null;
let sessionQueue = [], sessionIndex = 0, sessionActive = false;

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
function readStudyHistory() {
  const value = J(HISTORY, []);
  return Array.isArray(value) ? value.filter(e => e && typeof e.key === "string" && Number.isFinite(e.at)) : [];
}
function recordStudyEvent(key, quality, at = Date.now()) {
  const history = readStudyHistory().filter(e => e.at >= at - 365 * DAY);
  history.push({ key, quality, at });
  S(HISTORY, history.slice(-5000));
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
  recordStudyEvent(k, q, c.last);
  updateStats(); renderLibrary();
  if (sessionActive) {
    sessionIndex++;
    if (sessionIndex >= sessionQueue.length) finishSession(true);
    else renderSessionItem();
  } else if (activeIndex < activeMatn.items.length - 1) go(1);
  else renderStudyItem();
}
function updateStats() {
  const progress = readProgress(), now = Date.now();
  const items = library.flatMap(matn => matn.items.map(item => progress[pk(matn.id, item.id)] || null));
  $("new-count").textContent = items.filter(c => !c).length;
  $("learning-count").textContent = items.filter(c => c && c.due > now && c.int < 6).length;
  $("saved-count").textContent = items.filter(c => c && c.due > now && c.int >= 6).length;
  const dueCount = items.filter(c => c && c.due <= now).length;
  $("review-count").textContent = dueCount;
  const dailyCount = $("daily-review-count");
  if (dailyCount) dailyCount.textContent = dueCount;
  const dailyButton = $("daily-review-btn");
  if (dailyButton) dailyButton.disabled = dueCount === 0;
  $("daily-review-empty")?.classList.toggle("hidden", dueCount > 0);
  updateAchievements(items, now);
  updateDailyPlan(items, now);
  updateWeeklyReport(items, now);
  updateSmartDashboard(items, now);
}


/* ---------- التقرير الأسبوعي ---------- */
function updateWeeklyReport(items = null, now = Date.now()) {
  const totalEl = $("weekly-total"), daysEl = $("weekly-days"), averageEl = $("weekly-average");
  const chart = $("weekly-chart"), range = $("weekly-range");
  if (!totalEl || !daysEl || !averageEl || !chart || !range) return;
  const today = new Date(now);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const firstDay = todayStart - 6 * DAY;
  const history = readStudyHistory().filter(event => event.at >= firstDay && event.at <= now);
  const days = Array.from({ length: 7 }, (_, index) => {
    const start = firstDay + index * DAY;
    const count = history.filter(event => event.at >= start && event.at < start + DAY).length;
    return { date: new Date(start), count };
  });
  const total = history.length, activeDays = days.filter(day => day.count > 0).length;
  const max = Math.max(1, ...days.map(day => day.count));
  totalEl.textContent = String(total);
  daysEl.textContent = String(activeDays);
  averageEl.textContent = (total / 7).toLocaleString("ar", { maximumFractionDigits: 1 });
  range.textContent = days[0].date.toLocaleDateString("ar", { day: "numeric", month: "short" }) + " – " + days[6].date.toLocaleDateString("ar", { day: "numeric", month: "short" });
  chart.innerHTML = days.map(day => {
    const height = day.count ? Math.max(5, Math.round(day.count / max * 100)) : 0;
    const label = day.date.toLocaleDateString("ar", { weekday: "short" });
    return '<div class="weekly-day" title="' + escapeHTML(label) + ': ' + day.count + ' مقاطع"><span class="weekly-bar-value">' + day.count + '</span><div class="weekly-bar-track"><span style="height:' + height + '%"></span></div><small>' + escapeHTML(label) + '</small></div>';
  }).join("");
  const progress = readProgress();
  const states = items || library.flatMap(matn => matn.items.map(item => progress[pk(matn.id, item.id)] || null));
  $("weekly-mastered").textContent = String(states.filter(state => state && state.due > now && state.int >= 6).length);
  $("weekly-learning").textContent = String(states.filter(state => state && state.due > now && state.int < 6).length);
  $("weekly-review").textContent = String(states.filter(state => state && state.due <= now).length);
}
 
/* ---------- الإنجازات وسلسلة الاستمرار ---------- */
function updateAchievements(items, now = Date.now()) {
  const events = readStudyHistory();
  const dateKey = date => date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();
  const activeDates = new Set(events.map(event => dateKey(new Date(event.at))));
  const cursor = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate());
  if (!activeDates.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDates.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const streakEl = $("streak-count");
  if (streakEl) streakEl.textContent = String(streak);
  const mastered = items.filter(state => state && state.due > now && state.int >= 6).length;
  const achievements = [
    { title: "أول خطوة", detail: "قيّم أول مقطع", earned: events.length >= 1, icon: "🌱" },
    { title: "إتقان 10 مقاطع", detail: "أتقن عشرة مقاطع", earned: mastered >= 10, icon: "📘" },
    { title: "إتقان 50 مقطعاً", detail: "أتقن خمسين مقطعاً", earned: mastered >= 50, icon: "🏅" },
    { title: "إتقان 100 مقطع", detail: "أتقن مئة مقطع", earned: mastered >= 100, icon: "🏆" },
    { title: "ثلاثة أيام متتالية", detail: "ادرس ثلاثة أيام دون انقطاع", earned: streak >= 3, icon: "🔥" },
    { title: "أسبوع من الثبات", detail: "ادرس سبعة أيام متتالية", earned: streak >= 7, icon: "⭐" }
  ];
  const earnedEl = $("achievement-earned"), list = $("achievement-list");
  if (earnedEl) earnedEl.textContent = String(achievements.filter(item => item.earned).length);
  if (list) list.innerHTML = achievements.map(item =>
    '<article class="achievement-card' + (item.earned ? ' earned' : '') + '">' +
    '<span class="achievement-icon" aria-hidden="true">' + item.icon + '</span>' +
    '<strong>' + escapeHTML(item.title) + '</strong><small>' + escapeHTML(item.detail) + '</small>' +
    '<span class="achievement-state">' + (item.earned ? "تم الإنجاز ✓" : "لم يتحقق بعد") + '</span></article>'
  ).join("");
}


/* ---------- الخطة اليومية ---------- */
function dailyGoal() {
  const value = Number(J(DAILY_GOAL, 5));
  return Number.isFinite(value) ? Math.min(50, Math.max(1, Math.round(value))) : 5;
}
function updateDailyPlan(items = null, now = Date.now()) {
  const goalInput = $("daily-goal-input"), completedEl = $("daily-goal-completed");
  const goalEl = $("daily-goal-total"), fill = $("daily-goal-bar");
  if (!goalInput || !completedEl || !goalEl || !fill) return;
  const goal = dailyGoal();
  const dayStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
  const progress = readProgress();
  const states = items || library.flatMap(matn => matn.items.map(item => progress[pk(matn.id, item.id)] || null));
  const completed = states.filter(state => state && Number.isFinite(state.last) && state.last >= dayStart && state.last <= now).length;
  const percent = Math.min(100, Math.round((completed / goal) * 100));
  goalInput.value = String(goal); completedEl.textContent = String(completed); goalEl.textContent = String(goal);
  fill.style.width = `${percent}%`;
  fill.parentElement.setAttribute("aria-valuenow", String(percent));
  const message = $("daily-goal-message");
  if (message) message.textContent = completed >= goal ? "أحسنت! حققت هدفك اليومي." : `باقي لك ${goal - completed} مقاطع لإتمام هدف اليوم.`;
}


/* ---------- لوحة المراجعة الذكية ---------- */
function updateSmartDashboard(items = null, now = Date.now()) {
  const progress = readProgress();
  const states = items || library.flatMap(matn => matn.items.map(item => progress[pk(matn.id, item.id)] || null));
  const overdue = [];
  for (const matn of library) matn.items.forEach((item, index) => {
    const state = progress[pk(matn.id, item.id)];
    if (state && state.due <= now) overdue.push({ matn, item, index, state });
  });
  overdue.sort((a, b) => a.state.due - b.state.due);
  const alertBox = $("overdue-alert");
  if (alertBox) {
    alertBox.classList.toggle("hidden", overdue.length === 0);
    const count = $("overdue-alert-count");
    if (count) count.textContent = String(overdue.length);
    const oldest = overdue.length ? Math.max(0, Math.floor((now - overdue[0].state.due) / DAY)) : 0;
    const detail = $("overdue-alert-detail");
    if (detail) detail.textContent = overdue.length
      ? (oldest > 0 ? `أقدم مقطع متأخر منذ ${oldest} يومًا. ابدأ بالأقدم استحقاقًا.` : "لديك مقاطع حان موعد مراجعتها اليوم.")
      : "";
  }

  const masteryList = $("matn-mastery-list");
  if (masteryList) masteryList.innerHTML = library.map(matn => {
    const total = matn.items.length;
    const learned = matn.items.filter(item => {
      const state = progress[pk(matn.id, item.id)];
      return !!state && state.int >= 6;
    }).length;
    const due = matn.items.filter(item => {
      const state = progress[pk(matn.id, item.id)];
      return !!state && state.due <= now;
    }).length;
    const percent = total ? Math.round(learned / total * 100) : 0;
    return `<article class="matn-mastery-card">
      <div class="matn-mastery-head"><strong>${escapeHTML(matn.title)}</strong><span>${percent}%</span></div>
      <div class="matn-mastery-track" role="progressbar" aria-label="نسبة إتقان ${escapeHTML(matn.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
      <small>${learned} من ${total} مقطعًا بلغ مستوى الإتقان · ${due} للمراجعة</small>
    </article>`;
  }).join("");

  const log = $("daily-log-list");
  if (log) {
    const today = new Date(now);
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const history = readStudyHistory();
    const rows = Array.from({ length: 7 }, (_, index) => {
      const start = startToday - (6 - index) * DAY;
      const end = start + DAY;
      const count = history.filter(event => event.at >= start && event.at < end).length;
      return { date: new Date(start), count };
    }).reverse();
    log.innerHTML = rows.map(day => `<div class="daily-log-row">
      <span>${escapeHTML(day.date.toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "short" }))}</span>
      <strong>${day.count} ${day.count === 1 ? "مقطع" : "مقاطع"}</strong>
    </div>`).join("");
  }
}

function renderProgressList(type) {
  const panel = $("progress-panel"), list = $("progress-list"), title = $("progress-panel-title");
  if (!panel || !list) return;
  const now = Date.now(), progress = readProgress(), rows = [];
  for (const matn of library) {
    matn.items.forEach((item, index) => {
      const state = progress[pk(matn.id, item.id)] || null;
      const due = !!state && state.due <= now;
      const mastered = !!state && !due && state.int >= 6;
      const learning = !!state && !due && state.int < 6;
      const recent = !!state && Number.isFinite(state.last) && state.last > 0;
      const include =
        (type === "new" && !state) ||
        (type === "learning" && learning) ||
        (type === "mastered" && mastered) ||
        (type === "review" && due) ||
        (type === "recent" && recent);
      if (include) rows.push({ matn, item, index, state });
    });
  }
  const titles = {
    new: "المقاطع الجديدة",
    learning: "المقاطع قيد الحفظ",
    mastered: "المقاطع التي أتقنتها",
    review: "المقاطع المستحقة للمراجعة",
    recent: "آخر المقاطع التي درستها"
  };
  title.textContent = titles[type] || "مقاطع الحفظ";
  if (type === "recent") rows.sort((a, b) => (b.state.last || 0) - (a.state.last || 0));
  if (type === "review") rows.sort((a, b) => (a.state.due || 0) - (b.state.due || 0));
  if (type === "learning") rows.sort((a, b) => (b.state.last || 0) - (a.state.last || 0));
  const empty = {
    new: "أحسنت! لا توجد مقاطع جديدة غير مبدوءة.",
    learning: "لا توجد مقاطع قيد الحفظ حالياً.",
    mastered: "لم تتقن أي مقطع بعد. ابدأ بمقطع واحفظه جيداً، ثم اضغط «سهل».",
    review: "لا توجد مقاطع مستحقة للمراجعة الآن.",
    recent: "لم تسجل دراسة أي مقطع بعد."
  };
  list.innerHTML = rows.length ? rows.map((r, n) => {
    const detail = type === "recent" ? new Date(r.state.last).toLocaleDateString("ar")
      : type === "new" ? "جديد"
      : type === "learning" ? "قيد الحفظ"
      : type === "mastered" ? "متقَن"
      : type === "review" ? (Math.floor((now - r.state.due) / DAY) >= 1 ? `متأخر منذ ${Math.floor((now - r.state.due) / DAY)} يوم` : "مستحق اليوم")
      : "للمراجعة";
    return `<button class="progress-item" type="button" data-progress-matn="${escapeHTML(r.matn.id)}" data-progress-index="${r.index}">
      <span class="progress-item-number">${n + 1}</span>
      <span class="progress-item-copy"><strong>${escapeHTML(r.matn.title)}</strong><small>${escapeHTML(r.item.reference || `المقطع ${r.index + 1}`)} · ${detail}</small></span>
      <span class="progress-item-arrow">←</span>
    </button>`;
  }).join("") : `<p class="empty-state">${empty[type] || "لا توجد مقاطع هنا."}</p>`;
  panel.classList.remove("hidden");
  if (!location.pathname.endsWith("/progress.html")) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- جلسة الحفظ ---------- */
function startSession() {
  const now = Date.now(), progress = readProgress(), due = [], fresh = [];
  for (const matn of library) matn.items.forEach((item, index) => {
    const state = progress[pk(matn.id, item.id)] || null;
    const entry = { matnId: matn.id, index, due: state?.due || 0 };
    if (state && state.due <= now) due.push(entry);
    else if (!state) fresh.push(entry);
  });
  due.sort((a, b) => a.due - b.due);
  sessionQueue = [...due, ...fresh.slice(0, 3)];
  if (!sessionQueue.length) {
    alert("لا توجد مقاطع جديدة أو مستحقة للمراجعة. أحسنت!");
    return;
  }
  sessionIndex = 0; sessionActive = true;
  $("session-panel")?.classList.remove("hidden");
  renderSessionItem();
}
function renderSessionItem() {
  if (!sessionActive || !sessionQueue[sessionIndex]) return;
  const entry = sessionQueue[sessionIndex];
  const matn = library.find(m => m.id === entry.matnId);
  if (!matn) return;
  $("session-progress").textContent = `المقطع ${sessionIndex + 1} من ${sessionQueue.length}`;
  $("session-progress-bar").style.width = `${((sessionIndex + 1) / sessionQueue.length) * 100}%`;
  openMatn(entry.matnId);
  activeIndex = entry.index; resetItemView(); renderStudyItem();
}
function finishSession(completed = false) {
  sessionActive = false; sessionQueue = []; sessionIndex = 0;
  $("session-panel")?.classList.add("hidden");
  if (completed) alert("أحسنت! أتممت جلسة الحفظ بنجاح.");
}
/* ---------- نسخة احتياطية ---------- */
function exportData() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: "riwayq", v: 3, progress: readProgress(), studyHistory: readStudyHistory(), dailyGoal: dailyGoal() })], { type: "application/json" }));
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
    S(KEY, cur);
    if (Array.isArray(o.studyHistory)) {
      const merged = new Map();
      for (const event of [...readStudyHistory(), ...o.studyHistory]) {
        if (!event || typeof event.key !== "string" || !Number.isFinite(event.at)) continue;
        merged.set(event.key + "|" + event.at + "|" + (event.quality ?? ""), event);
      }
      S(HISTORY, [...merged.values()].sort((x, y) => x.at - y.at).slice(-5000));
    }
    if (Number.isFinite(Number(o.dailyGoal))) S(DAILY_GOAL, Math.min(50, Math.max(1, Math.round(Number(o.dailyGoal)))));
    updateStats(); renderLibrary(); renderStudyItem();
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
    if (location.pathname.endsWith("/study.html")) {
      const params = new URLSearchParams(location.search);
      const matnId = params.get("matn");
      if (matnId) openMatn(matnId);
      else {
        const panel = $("study-panel");
        if (panel) {
          panel.classList.remove("hidden");
          panel.innerHTML = '<p class="empty-state">اختر متناً من المكتبة لبدء الدراسة.</p><a class="button button-outline" href="./index.html#library">العودة إلى المكتبة</a>';
        }
      }
    }
    if (location.pathname.endsWith("/review.html")) renderProgressList("review");
    if (location.pathname.endsWith("/progress.html")) renderProgressList("recent");
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
    return `<article class="matn-card matn-card-recall" data-recall="${escapeHTML(m.id)}" tabindex="0" role="link" aria-label="استظهار متن ${escapeHTML(m.title)}">
      <span class="tag">${escapeHTML(m.subject)}</span>${m.contentStatus === "partial" ? '<span class="content-status">المتن غير مكتمل</span>' : ""}
      <h3>${escapeHTML(m.title)}</h3><p>${escapeHTML(m.description)}</p>
      <div class="card-bottom"><span>${m.items.length} مقاطع · ${done} متقنة</span>
      <button data-open="${escapeHTML(m.id)}" type="button">ابدأ الدراسة ←</button></div></article>`;
  }).join("");
  $("matn-grid").querySelectorAll("[data-recall]").forEach(card => {
    const openRecall = () => { window.location.href = `./istidhar.html?matn=${encodeURIComponent(card.dataset.recall)}`; };
    card.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      openRecall();
    });
    card.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") && event.target === card) {
        event.preventDefault(); openRecall();
      }
    });
  });
  $("matn-grid").querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", event => {
    event.stopPropagation();
    window.location.href = `./study.html?matn=${encodeURIComponent(b.dataset.open)}`;
  }));
}

/* ---------- الدراسة ---------- */
function openMatn(id) {
  activeMatn = library.find(i => i.id === id);
  if (!activeMatn) return;
  const requestedItem = location.pathname.endsWith("/study.html") ? new URLSearchParams(location.search).get("item") : null;
  const startIndex = requestedItem === null ? (J(LAST, {})[id] || 0) : Math.max(0, Number(requestedItem) || 0);
  activeIndex = Math.min(startIndex, activeMatn.items.length - 1);
  resetItemView();
  const sel = $("item-jump");
  if (sel) sel.innerHTML = activeMatn.items.map((it, i) => `<option value="${i}">${i + 1}. ${escapeHTML(it.reference || "")}</option>`).join("");
  $("study-panel").classList.remove("hidden");
  $("study-title").textContent = activeMatn.title;
  $("study-subject").textContent = activeMatn.subject;
  const warning = $("study-warning");
  if (warning) { warning.textContent = activeMatn.contentStatus === "partial" ? "تنبيه: هذا المتن غير مكتمل في المكتبة حالياً؛ المقاطع المتاحة فقط هي المعروضة، فلا تعتمد هذه النسخة على أنها النص الكامل." : ""; warning.classList.toggle("hidden", activeMatn.contentStatus !== "partial"); }
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
  if (Array.isArray(item.verses) && item.verses.length) {
    t.classList.add("poetry-text");
    t.classList.remove("concealed");
    t.innerHTML = item.verses.map(verse =>
      '<div class="poetry-verse"><span class="poetry-sadr">' +
      escapeHTML(verse.number + ' ' + verse.sadr) +
      '</span><span class="poetry-tab" aria-hidden="true"></span><span class="poetry-ajuz' + (revealed ? '' : ' concealed') + '">' +
      escapeHTML(verse.ajuz) + '</span></div>'
    ).join("");
  } else if (sp && !revealed) {
    t.classList.remove("poetry-text");
    t.innerHTML = `${escapeHTML(sp[0])} <span class="concealed">${escapeHTML(sp[1])}</span>`;
    t.classList.remove("concealed");
  } else {
    t.classList.remove("poetry-text");
    t.textContent = item.text;
    t.classList.toggle("concealed", !revealed);
  }
  $("reveal-btn").textContent = revealed ? (item.verses?.length || sp ? "اختبر حفظي" : "إخفاء النص") : "إظهار النص";
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
const prefs = Object.assign({ fs: 1, theme: "dark" }, J(PREFS, {}));
function applyPrefs() {
  const r = document.documentElement;
  r.style.setProperty("--fs", prefs.fs);
  r.dataset.theme = prefs.theme || "dark";
  S(PREFS, prefs);
}

/* ---------- التسميع الصوتي المباشر ---------- */
let recitationRecognition = null, recitationActive = false, recitationSessionId = 0;
let recitationAudioContext = null, recitationAlerted = new Set();
function normalizeRecitationText(value) {
  return String(value || "").normalize("NFD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/[\u0610-\u061A\u06D6-\u06ED]/g, "")
    .replace(/[.,،؛:!?؟«»"']/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function alignLiveRecitation(expected, spoken, complete = false) {
  const a=normalizeRecitationText(expected).split(" ").filter(Boolean);
  const b=String(spoken||"").trim().split(/\s+/).filter(Boolean);
  const an=a.map(normalizeRecitationText), bn=b.map(normalizeRecitationText);
  const dp=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
  for(let i=0;i<=a.length;i++)dp[i][0]=i;
  for(let j=0;j<=b.length;j++)dp[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)
    dp[i][j]=an[i-1]===bn[j-1]?dp[i-1][j-1]:Math.min(dp[i-1][j-1]+1,dp[i-1][j]+1,dp[i][j-1]+1);
  let endI=0,best=Infinity;
  for(let i=0;i<=a.length;i++)if(dp[i][b.length]<best){best=dp[i][b.length];endI=i;}
  const expectedStates=a.map(()=>"pending"),spokenStates=b.map(()=>"extra"),issues=[];
  if (complete) for (let k=endI;k<a.length;k++) {
    expectedStates[k]="missing";
    issues.push({type:"missing",expected:a[k],spoken:"",expectedIndex:k,spokenIndex:b.length});
  }
  let i=endI,j=b.length;
  while(j>0){
    if(i>0&&an[i-1]===bn[j-1]&&dp[i][j]===dp[i-1][j-1]){expectedStates[i-1]="correct";spokenStates[j-1]="correct";i--;j--;}
    else if(i>0&&j>0&&dp[i][j]===dp[i-1][j-1]+1){expectedStates[i-1]="correction";spokenStates[j-1]="wrong";issues.push({type:"changed",expected:a[i-1],spoken:b[j-1],expectedIndex:i-1,spokenIndex:j-1});i--;j--;}
    else if(i>0&&dp[i][j]===dp[i-1][j]+1){expectedStates[i-1]="missing";issues.push({type:"missing",expected:a[i-1],spoken:"",expectedIndex:i-1,spokenIndex:j});i--;}
    else{spokenStates[j-1]="wrong";issues.push({type:"extra",expected:"",spoken:b[j-1],expectedIndex:i,spokenIndex:j-1});j--;}
  }
  return {expected:a.map((word,k)=>({word,state:expectedStates[k]})),spoken:b.map((word,k)=>({word,state:spokenStates[k]})),issues:issues.reverse()};
}
function playRecitationAlert(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!recitationAudioContext)recitationAudioContext=new AC();
    if(recitationAudioContext.state==="suspended")recitationAudioContext.resume();
    const ctx=recitationAudioContext,now=ctx.currentTime;
    // جرس قصير من نغمتين متناغمتين، أوضح من النبضة السابقة.
    [[880,1320,0],[988,1480,0.18]].forEach(([low,high,delay])=>{
      [low,high].forEach((frequency,index)=>{
        const oscillator=ctx.createOscillator(),gain=ctx.createGain();
        const start=now+delay,duration=index===0?0.34:0.28;
        oscillator.type="sine";
        oscillator.frequency.setValueAtTime(frequency,start);
        gain.gain.setValueAtTime(0.0001,start);
        gain.gain.exponentialRampToValueAtTime(index===0?0.34:0.16,start+0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
        oscillator.connect(gain);gain.connect(ctx.destination);
        oscillator.start(start);oscillator.stop(start+duration+0.02);
      });
    });
  }catch(e){console.warn("تعذر تشغيل تنبيه التسميع",e);}
}
function renderLiveRecitation(spoken,finalText,complete=false){
  const transcript=$("recitation-transcript"),original=$("recitation-original");
  if(!activeMatn||!transcript||!original)return {issues:[]};
  const aligned=alignLiveRecitation(activeMatn.items[activeIndex].text,spoken,complete);
  const finalCount=String(finalText||"").trim().split(/\s+/).filter(Boolean).length;
  transcript.innerHTML="<strong>ما نطقتَ:</strong> "+aligned.spoken.map((x,k)=>{
    const cls=k>=finalCount?"recitation-interim":x.state==="correct"?"recitation-word-correct":"recitation-word-wrong";
    return '<span class="'+cls+'">'+escapeHTML(x.word)+"</span>";
  }).join(" ");
  original.innerHTML="<strong>النص الأصلي:</strong> "+aligned.expected.map(x=>{
    const cls=x.state==="pending"?"recitation-word-pending":"recitation-word-correct";
    const marker=x.state==="missing"?' <small class="recitation-missing-label">(ساقطة)</small>':"";
    return '<span class="'+cls+'">'+escapeHTML(x.word)+"</span>"+marker;
  }).join(" ");
  return aligned;
}
function alertConfirmedRecitationErrors(finalText){
  if(!activeMatn||!String(finalText||"").trim())return;
  const aligned=alignLiveRecitation(activeMatn.items[activeIndex].text,finalText);
  let fresh=false;
  for(const x of aligned.issues){
    const key=[x.type,x.expectedIndex,x.spokenIndex,x.expected,x.spoken].join("|");
    if(!recitationAlerted.has(key)){recitationAlerted.add(key);fresh=true;}
  }
  if(fresh){playRecitationAlert();$("recitation-status").textContent="تنبيه: رُصد اختلاف محتمل. راجع الكلمات الحمراء والتصحيح الأخضر.";}
}
function compareRecitation(expected,spoken){
  const aligned=alignLiveRecitation(expected,spoken,true);
  return {issues:aligned.issues,total:Math.max(normalizeRecitationText(expected).split(" ").filter(Boolean).length,normalizeRecitationText(spoken).split(" ").filter(Boolean).length)};
}
function showRecitationComparison(spoken){
  const feedback=$("recitation-feedback");if(!activeMatn||!feedback)return;
  if(!spoken.trim()){feedback.classList.remove("hidden");feedback.innerHTML="<strong>لم نلتقط كلاماً واضحاً.</strong><p>جرّب مرة أخرى وتحدث بصوت واضح.</p>";return;}
  const result=compareRecitation(activeMatn.items[activeIndex].text,spoken),errors=result.issues;
  const accuracy=result.total?Math.max(0,Math.round((1-errors.length/result.total)*100)):100;
  const details=errors.length?errors.slice(0,30).map(x=>{
    if(x.type==="missing")return '<li><span class="recitation-missing">ناقص</span> الكلمة الصحيحة: <strong>'+escapeHTML(x.expected)+"</strong></li>";
    if(x.type==="extra")return '<li><span class="recitation-extra">زائد</span> قلتَ: <strong>'+escapeHTML(x.spoken)+"</strong></li>";
    return '<li><span class="recitation-changed">اختلاف</span> قلتَ: <strong>'+escapeHTML(x.spoken)+"</strong> والصواب: <strong>"+escapeHTML(x.expected)+"</strong></li>";
  }).join(""):"<li>لم يظهر اختلاف في الكلمات بعد تطبيع التشكيل وعلامات الترقيم.</li>";
  feedback.classList.remove("hidden");
  feedback.innerHTML='<div class="recitation-score"><strong>'+accuracy+'%</strong><span>'+(errors.length?"مراجعة مواضع الاختلاف":"مطابقة الكلمات ممتازة")+'</span></div><ul>'+details+'</ul><p class="recitation-caution">هذه مقارنة آلية للكلمات وليست حكماً نهائياً على صحة الأداء أو التجويد؛ قد يخطئ التعرف الصوتي.</p>';
}
function startRecitation(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  const status=$("recitation-status"),transcript=$("recitation-transcript"),start=$("recitation-start"),stop=$("recitation-stop");
  if(!SR){status.textContent="متصفحك لا يدعم التعرف الصوتي. جرّب Google Chrome.";return;}
  if(recitationActive)return;

  // كل ضغطة تبدأ جلسة مستقلة؛ تجاهل أي أحداث متأخرة من جلسة سابقة.
  const sessionId=++recitationSessionId;
  const isCurrentSession=()=>sessionId===recitationSessionId;
  const recognition=new SR();
  recitationRecognition=recognition;
  recitationAlerted=new Set();
  let finalText="",liveAlertTimer=null,lastInterimText="";

  // امسح واجهة الجلسة السابقة فور الضغط، لا تنتظر حدث onstart.
  transcript.dataset.finalText="";
  transcript.textContent="أستمع إليك…";
  $("recitation-original").textContent="";
  $("recitation-feedback").classList.add("hidden");
  status.textContent="جارٍ بدء التسميع…";
  recitationActive=true;
  start.disabled=true;
  stop.disabled=false;

  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC){
      if(!recitationAudioContext)recitationAudioContext=new AC();
      if(recitationAudioContext.state==="suspended")recitationAudioContext.resume();
    }
  }catch{}

  recognition.lang="ar-SA";
  recognition.continuous=true;
  recognition.interimResults=true;
  recognition.maxAlternatives=1;

  recognition.onstart=()=>{
    if(!isCurrentSession())return;
    revealed=false;
    renderStudyItem();
    start.disabled=true;
    stop.disabled=false;
    status.textContent="أستمع إليك الآن… استظهر المقطع بوضوح.";
  };

  recognition.onresult=event=>{
    if(!isCurrentSession())return;
    finalText="";
    let interim="";
    for(let i=0;i<event.results.length;i++){
      const t=event.results[i][0].transcript;
      if(event.results[i].isFinal)finalText+=t+" ";
      else interim+=t;
    }
    const all=(finalText+interim).trim(),confirmedText=finalText.trim();
    transcript.dataset.finalText=confirmedText;

    renderLiveRecitation(all,confirmedText);
    alertConfirmedRecitationErrors(confirmedText);

    if(liveAlertTimer)clearTimeout(liveAlertTimer);
    lastInterimText=interim.trim();
    if(lastInterimText&&activeMatn){
      const finalCount=confirmedText.split(/\s+/).filter(Boolean).length;
      const aligned=alignLiveRecitation(activeMatn.items[activeIndex].text,all);
      const pendingIssues=aligned.issues.filter(x=>x.type!=="missing"&&x.spokenIndex>=finalCount);
      if(pendingIssues.length){
        const candidate=lastInterimText;
        liveAlertTimer=setTimeout(()=>{
          if(!isCurrentSession()||!recitationActive||lastInterimText!==candidate)return;
          let fresh=false;
          for(const x of pendingIssues){
            const key=[x.type,x.expectedIndex,x.spokenIndex,x.expected,x.spoken].join("|");
            if(!recitationAlerted.has(key)){recitationAlerted.add(key);fresh=true;}
          }
          if(fresh){
            playRecitationAlert();
            status.textContent="تنبيه: اختلاف محتمل في القراءة. راجع الكلمة الحمراء والتصحيح الأخضر.";
          }
        },350);
      }
    }
    if(!recitationAlerted.size)status.textContent="أستمع إليك… الأخضر مطابق، والأحمر يحتاج مراجعة.";
  };

  recognition.onerror=event=>{
    if(!isCurrentSession())return;
    status.textContent=event.error==="not-allowed"?"لم تسمح باستعمال الميكروفون. فعّل الإذن من إعدادات المتصفح.":event.error==="no-speech"?"لم نسمع صوتاً. تحدث بوضوح قرب الميكروفون.":"وقع مشكل أثناء التعرف الصوتي: "+event.error;
  };

  recognition.onend=()=>{
    if(!isCurrentSession())return;
    if(liveAlertTimer)clearTimeout(liveAlertTimer);
    recitationActive=false;
    if(recitationRecognition===recognition)recitationRecognition=null;
    start.disabled=false;
    stop.disabled=true;
    const spoken=(transcript.dataset.finalText||finalText).trim();
    status.textContent=spoken?"انتهى التسميع. راجع الكلمات الملوّنة والتصحيح أدناه.":"انتهى التسميع دون التقاط نص واضح.";
    if(spoken){
      renderLiveRecitation(spoken,spoken,true);
      showRecitationComparison(spoken);
    }
  };

  try{
    recognition.start();
  }catch(e){
    if(isCurrentSession()){
      recitationActive=false;
      recitationRecognition=null;
      start.disabled=false;
      stop.disabled=true;
      status.textContent="تعذر بدء الميكروفون. تحقق من إذن المتصفح وحاول مجدداً.";
    }
  }
}
function stopRecitation(){
  if(recitationRecognition&&recitationActive)recitationRecognition.stop();
}

/* ---------- الأحداث ---------- */
on("daily-goal-input", "change", e => {
  const value = Math.min(50, Math.max(1, Math.round(Number(e.target.value) || 5)));
  S(DAILY_GOAL, value);
  updateDailyPlan();
});
on("search-input", "input", renderLibrary);
document.querySelectorAll("[data-progress-view]").forEach(button => button.addEventListener("click", () => {
  if (button.dataset.progressView === "review" && !location.pathname.endsWith("/review.html")) { window.location.href = "./review.html"; return; }
  renderProgressList(button.dataset.progressView);
}));
on("overdue-review-btn", "click", () => { window.location.href = "./review.html"; });
on("daily-review-btn", "click", () => {
  if (!location.pathname.endsWith("/review.html")) window.location.href = "./review.html";
  else renderProgressList("review");
});
on("session-start-btn", "click", startSession);
on("session-end-btn", "click", () => finishSession(false));
on("close-progress", "click", () => {
  if (location.pathname.endsWith("/review.html") || location.pathname.endsWith("/progress.html")) window.location.href = "./index.html";
  else $("progress-panel").classList.add("hidden");
});
on("progress-list", "click", e => {
  const button = e.target.closest("[data-progress-matn]");
  if (!button) return;
  const id = button.dataset.progressMatn, index = Number(button.dataset.progressIndex);
  window.location.href = `./study.html?matn=${encodeURIComponent(id)}&item=${index}`;
});
on("recitation-start", "click", startRecitation);
on("recitation-stop", "click", stopRecitation);
on("reveal-btn", "click", () => { revealed = !revealed; renderStudyItem(); });
on("meaning-btn", "click", () => { meaningVisible = !meaningVisible; renderStudyItem(); });
on("similar-btn", "click", () => { similarVisible = !similarVisible; renderSimilar(); });
on("review-btn", "click", () => grade(2));
on("good-btn", "click", () => grade(4));
on("mastered-btn", "click", () => grade(5));
on("previous-btn", "click", () => go(-1));
on("next-btn", "click", () => go(1));
on("close-study", "click", () => {
  if (location.pathname.endsWith("/study.html")) window.location.href = "./index.html#library";
  else $("study-panel").classList.add("hidden");
});
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
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $("install-btn")?.classList.remove("hidden");
});
on("install-btn", "click", async () => {
  if (!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  if (choice && choice.outcome === "accepted") $("install-btn")?.classList.add("hidden");
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  $("install-btn")?.classList.add("hidden");
});

applyPrefs(); updateNetworkStatus(); loadLibrary();


