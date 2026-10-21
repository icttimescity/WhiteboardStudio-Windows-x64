import { uid } from "./store.js";
export function sceneCount(value, cues) {
  const n = Number(value);
  const words = cues.reduce((a, c) => a + c.text.trim().split(/\s+/).length, 0);
  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 40 ||
    n > words ||
    n * 1000 > cues.at(-1).endMs
  )
    throw Error("Số cảnh cần từ 1–40, đủ nội dung và ít nhất 1 giây mỗi cảnh.");
  return n;
}
export function sourceUnits(cues, count) {
  sceneCount(count, cues);
  const total = cues.reduce((a, c) => a + c.text.trim().split(/\s+/).length, 0);
  const width = Math.max(1, Math.min(8, Math.floor(total / count)));
  const units = [];
  for (const c of cues) {
    const words = c.text.trim().split(/\s+/);
    for (let i = 0; i < words.length; i += width) {
      units.push({
        text: words.slice(i, i + width).join(" "),
        startMs:
          c.startMs + Math.round(((c.endMs - c.startMs) * i) / words.length),
      });
    }
  }
  return units;
}
export function scenesFromRanges(cues, count, ranges) {
  const units = sourceUnits(cues, count);
  if (!Array.isArray(ranges) || ranges.length !== count)
    throw Error(`AI phải trả đúng ${count} cảnh.`);
  let next = 1;
  const scenes = ranges.map((r, i) => {
    if (
      !Number.isInteger(r.start) ||
      !Number.isInteger(r.end) ||
      r.start !== next ||
      r.end < r.start ||
      r.end > units.length
    )
      throw Error("AI chia cảnh thiếu, lặp hoặc đảo nội dung. Hãy thử lại.");
    next = r.end + 1;
    const startMs = i ? units[r.start - 1].startMs : 0;
    const endMs =
      r.end === units.length ? cues.at(-1).endMs : units[r.end].startMs;
    if (endMs - startMs < 1000)
      throw Error("AI chia cảnh quá ngắn. Giảm số cảnh hoặc thử lại.");
    return {
      id: uid(),
      title: String(r.title || `Cảnh ${i + 1}`).slice(0, 120),
      text: units
        .slice(r.start - 1, r.end)
        .map((u) => u.text)
        .join(" "),
      startMs,
      durationMs: endMs - startMs,
      prompt: "",
      image: null,
      annotation: null,
    };
  });
  if (next !== units.length + 1)
    throw Error("AI chưa phân hết nội dung kịch bản.");
  return scenes;
}
