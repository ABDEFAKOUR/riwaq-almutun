import fs from "node:fs";

const data = JSON.parse(fs.readFileSync("mutun.json", "utf8"));
const errors = [], ids = new Set();

for (const matn of data) {
  if (!matn.id || !matn.title || !Array.isArray(matn.items) || !matn.items.length)
    errors.push(`متن غير صالح: ${matn.id || "(بلا id)"}`);

  if (ids.has(matn.id)) errors.push(`id مكرر: ${matn.id}`);
  ids.add(matn.id);

  const itemIds = new Set();
  for (const item of matn.items || []) {
    if (!item.id) errors.push(`${matn.id}: مقطع بلا id`);
    if (itemIds.has(item.id)) errors.push(`${matn.id}: id مكرر ${item.id}`);
    itemIds.add(item.id);

    const text = typeof item.text === "string" ? item.text.trim() : "";
    const hasVerses = Array.isArray(item.verses) && item.verses.some(verse =>
      verse && typeof verse.sadr === "string" && verse.sadr.trim() &&
      typeof verse.ajuz === "string" && verse.ajuz.trim()
    );
    const isPlaceholder = item.reference === "موضع تجريبي" ||
      /^(لم يُضف نص هذا (?:المتن|الحديث) بعد\.?|أضف النص من نسختك المعتمدة\.?|نص غير متوفر\.?|هيكل .*؛ أضف النص من نسختك المعتمدة\.?)$/u.test(text);

    // تسمح البنية بمواضع معلّمة بوضوح داخل متن جزئي، لكنها لا تسمح
    // بمقطع فارغ داخل متن معلن على أنه مكتمل.
    if ((!text || isPlaceholder) && !(matn.contentStatus === "partial" && item.note))
      errors.push(`${matn.id}/${item.id}: محتوى ناقص دون وسم المتن الجزئي وملاحظة`);
    if (!text && !hasVerses && !item.note)
      errors.push(`${matn.id}/${item.id}: لا يوجد نص أو أبيات أو ملاحظة توضيحية`);
  }

  for (const similar of matn.similar || []) for (const ref of similar.refs || [])
    if (!itemIds.has(ref)) errors.push(`${matn.id}/${similar.id}: المرجع ${ref} غير موجود`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("mutun.json OK:", data.length, "متن؛ placeholders موضحة وموسومة");
