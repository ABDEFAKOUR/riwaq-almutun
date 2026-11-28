/* مكتبة فيديو محلية: لا تستخدم مصادر خارجية ولا تخمّن بيانات الدروس. */
(async () => {
  const root = document.getElementById("video-library");
  if (!root) return;
  try {
    const response = await fetch("./videos.json");
    if (!response.ok) throw new Error("videos.json unavailable");
    const videos = await response.json();
    if (!Array.isArray(videos)) throw new Error("Invalid video catalogue");
    if (!videos.length) return;
    root.replaceChildren();
    for (const item of videos) {
      if (!item || typeof item.title !== "string" || typeof item.src !== "string") continue;
      const src = item.src.replace(/^\.\//, "");
      if (!src.startsWith("videos/") || src.includes("..") || !src.toLowerCase().endsWith(".mp4")) continue;
      const card = document.createElement("article"); card.className = "video-card";
      const player = document.createElement("video"); player.controls = true; player.preload = "metadata"; player.playsInline = true;
      const source = document.createElement("source"); source.src = "./" + src; source.type = "video/mp4"; player.append(source);
      const body = document.createElement("div"); body.className = "video-card-body";
      const title = document.createElement("h2"); title.textContent = item.title;
      const details = document.createElement("p"); details.textContent = [item.matn, item.teacher, item.source].filter(Boolean).join(" · ");
      body.append(title, details); card.append(player, body); root.append(card);
    }
    if (!root.children.length) root.innerHTML = '<article class="video-empty"><h2>لا توجد ملفات فيديو صالحة</h2><p>راجع مسارات MP4 داخل videos.json.</p></article>';
  } catch (error) {
    console.error("تعذر تحميل مكتبة الفيديو:", error);
    root.innerHTML = '<article class="video-empty"><h2>تعذر تحميل مكتبة الفيديو</h2><p>تأكد من وجود videos.json ثم أعد تحميل الصفحة.</p></article>';
  }
})();
