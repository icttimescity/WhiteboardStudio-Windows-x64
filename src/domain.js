import {polygonRegion} from '../public/region-shape.js';
export { parseSrt, scaleSrt } from "../public/srt-timing.js";
export function chunks(cues) {
  const groups = [];
  let bucket = [];
  for (const c of cues) {
    if (bucket.length && c.endMs - bucket[0].startMs > 30000) {
      groups.push(bucket);
      bucket = [];
    }
    bucket.push(c);
  }
  if (bucket.length) groups.push(bucket);
  return groups.map((g, i) => {
    const startMs = i ? g[0].startMs : 0;
    const endMs =
      i < groups.length - 1 ? groups[i + 1][0].startMs : cues.at(-1).endMs;
    return {
      id: `scene-${i + 1}`,
      title: `Cảnh ${i + 1}`,
      text: g.map((c) => c.text).join(" "),
      startMs,
      durationMs: endMs - startMs,
      prompt: "",
      image: null,
      annotation: null,
    };
  });
}
export function timedText(text, totalMs) {
  const words = text.trim().split(/\s+/),
    parts = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).length > 85 && line) {
      parts.push(line);
      line = "";
    }
    line += (line ? " " : "") + w;
  }
  if (line) parts.push(line);
  let cur = 0;
  const sum = parts.reduce((a, s) => a + s.length, 0);
  return parts.map((t, i) => {
    const startMs = cur;
    cur =
      i === parts.length - 1
        ? totalMs
        : cur + Math.round((totalMs * t.length) / sum);
    return { startMs, endMs: cur, text: t };
  });
}
export function fallbackAnnotation(s, canvas = {width:1280,height:720}) {
  return {
    canvas,
    sceneDurationMs: s.durationMs,
    elements: [
      {
        id: "all",
        label: "Toàn cảnh — có thể chia nhỏ",
        sequence: 1,
        subtitle: s.text,
        narrativeRole: "Minh họa toàn cảnh",
        region: { x: 0, y: 0, width: canvas.width, height: canvas.height },
        reveal: {
          startMs: 100,
          durationMs: Math.max(100, s.durationMs - 600),
          direction: "top_to_bottom",
          protectedRegions: [],
        },
      },
    ],
  };
}
export function validateAnnotation(a, duration, canvas = a?.canvas || {width:1280,height:720}) {
  if (
    !a ||
    a.canvas?.width !== canvas.width ||
    a.canvas?.height !== canvas.height ||
    !Number.isInteger(canvas.width) || !Number.isInteger(canvas.height) || canvas.width<100 || canvas.height<100 || canvas.width>4096 || canvas.height>4096 ||
    !Array.isArray(a.elements) ||
    a.elements.length < 1 ||
    a.elements.length > 20
  )
    throw Error(`Cần 1–20 vùng trên khung ${canvas.width} × ${canvas.height}.`);
  let end = 0;
  const rect = (r) =>
    r &&
    ["x", "y", "width", "height"].every((k) => Number.isInteger(r[k])) &&
    r.x >= 0 &&
    r.y >= 0 &&
    r.width > 0 &&
    r.height > 0 &&
    r.x + r.width <= canvas.width &&
    r.y + r.height <= canvas.height;
  const elements = a.elements.map((e, i) => {
    const r = e.reveal;
    const shape=e.region?.points!==undefined?polygonRegion(e.region.points,canvas):e.region;
    if (
      !rect(shape) ||
      !r ||
      !Number.isInteger(r.startMs) ||
      !Number.isInteger(r.durationMs) ||
      r.startMs < end ||
      r.durationMs < 100
    )
      throw Error(
        `Vùng ${i + 1}: kiểm tra tọa độ, thời gian và thứ tự (không chồng thời gian).`,
      );
    end = r.startMs + r.durationMs;
    if (end > duration - 500)
      throw Error("Hãy chừa ít nhất 0,5 giây cuối cảnh.");
    if (
      !Array.isArray(r.protectedRegions || []) ||
      (r.protectedRegions || []).some((x) => !rect(x))
    )
      throw Error("Vùng bảo vệ không hợp lệ.");
    return {
      id: `region-${i + 1}`,
      label: String(e.label || `Vùng ${i + 1}`).slice(0, 150),
      sequence: i + 1,
      subtitle: String(e.subtitle || "").slice(0, 2000),
      narrativeRole: String(e.narrativeRole || ""),
      region: shape,
      reveal: {
        startMs: r.startMs,
        durationMs: r.durationMs,
        direction: "top_to_bottom",
        protectedRegions: r.protectedRegions || [],
      },
    };
  });
  return {
    canvas,
    sceneDurationMs: duration,
    elements,
  };
}
export function srtText(cues) {
  const fmt = (n) => {
    n = Math.round(n);
    return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
  };
  return cues
    .map(
      (c, i) => `${i + 1}\n${fmt(c.startMs)} --> ${fmt(c.endMs)}\n${c.text}\n`,
    )
    .join("\n");
}
