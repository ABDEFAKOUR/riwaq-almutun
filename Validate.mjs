import fs from "node:fs";
const data = JSON.parse(fs.readFileSync("mutun.json", "utf8"));
const err = [], ids = new Set();
for (const m of data) {
  if (!m.id || !m.title || !Array.isArray(m.items) || !m.items.length) err.push(`متن غير صالح: ${m.id}`);
  if (ids.has(m.id)) err.push(`id مكرر: ${m.id}`);
  ids.add(m.id);
  const it = new Set();
  for (const i of m.items || []) {
    if (!i.id || !i.text) err.push(`${m.id}: مقطع ناقص`);
    if (it.has(i.id)) err.push(`${m.id}: id مكرر ${i.id}`);
    it.add(i.id);
  }
  for (const s of m.similar || []) for (const r of s.refs || [])
    if (!it.has(r)) err.push(`${m.id}/${s.id}: المرجع ${r} غير موجود`);
}
if (err.length) { console.error(err.join("\n")); process.exit(1); }
console.log("mutun.json OK:", data.length, "متن");
