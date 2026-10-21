// Shared by the browser preview and server import: never infer cue boundaries
// from blank lines alone (many subtitle exporters omit them).
const subtitleStamp = "(?:\\d{1,3}:)?\\d{1,3}:\\d{2}(?:[,.]\\d{1,3})?";
export function looksLikeSubtitle(raw) {
  return /^\s*\uFEFF?WEBVTT(?:\s|$)/i.test(String(raw)) ||
    new RegExp(`${subtitleStamp}\\s*(?:-->|->|→)`).test(String(raw));
}

// Only parse recognisable subtitle syntax. Numbers in ordinary prose are content.
export function narrationText(raw) {
  const text = String(raw ?? '').trim();
  return looksLikeSubtitle(text) ? parseSrt(text).map(c => c.text).join('\n') : text;
}

export function parseSrt(raw) {
  const range = `${subtitleStamp}\\s*(?:-->|->|→)\\s*${subtitleStamp}`;
  // Some clipboard/export tools collapse a complete SRT into one line.
  const unfolded = String(raw).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map(line => {
    if ([...line.matchAll(new RegExp(range, 'g'))].length < 2) return line;
    return line.replace(new RegExp(`(?:^|[ \\t]+)(?:(\\d+)[ \\t]+)?(${range})`, 'g'),
      (_, index, timing) => `\n${index ? index+'\n' : ''}${timing}`);
  }).join('\n');
  const lines = unfolded.trim().split("\n");
  const webvtt = /^WEBVTT(?:\s|$)/i.test(lines[0] || "");
  if (webvtt) {
    // Header metadata and NOTE/STYLE/REGION blocks are not spoken captions.
    let end = 1;
    while (end < lines.length && lines[end].trim()) end++;
    lines.splice(0, end);
    for (let i = 0; i < lines.length; i++) {
      if (/^(?:NOTE(?:\s|$)|STYLE\s*$|REGION\s*$)/.test(lines[i].trim())) {
        let end = i + 1;
        while (end < lines.length && lines[end].trim()) end++;
        lines.splice(i, end - i);
        i--;
      }
    }
  }
  const stamp = subtitleStamp;
  const timing = new RegExp(`^\\s*(?:\\d+\\s+)?(${stamp})\\s*(?:-->|->|→)\\s*(${stamp})(?=\\s|$)(.*)$`);
  const ms = (s) => {
    const [whole, fraction = ""] = s.split(/[,.]/);
    const parts = whole.split(":").map(Number);
    const second = parts.pop(), minute = parts.pop(), hour = parts.pop() || 0;
    if (second >= 60 || (whole.split(":").length === 3 && minute >= 60))
      throw Error(`Mốc thời gian không hợp lệ: ${s}.`);
    return ((hour * 60 + minute) * 60 + second) * 1000 + Number(fraction.padEnd(3, "0"));
  };
  const markers = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(timing);
    if (match) markers.push({ line: i, match });
    else if (/^\s*(?:\d+\s+)?[\d:.,-]+\s*(?:-->|->|→)/.test(lines[i]))
      throw Error(`Mốc thời gian phụ đề không đúng ở dòng ${i + 1}.`);
  }
  if (!markers.length) throw Error("Không tìm thấy mốc thời gian phụ đề SRT / VTT.");
  const identifier = (s) => webvtt ? !!s?.trim() : /^\s*\d+\s*$/.test(s || "");
  const prefix = lines.slice(0, markers[0].line).filter((x) => x.trim());
  if (prefix.length > 1 || (prefix.length === 1 && !identifier(prefix[0])))
    throw Error("Có nội dung không thuộc câu phụ đề trước mốc thời gian đầu tiên.");
  const out = [];
  for (let n = 0; n < markers.length; n++) {
    const { line, match } = markers[n];
    let end = markers[n + 1]?.line ?? lines.length;
    // Remove only the identifier immediately before the next timing line.
    let identifierLine = end - 1;
    while (identifierLine > line && !lines[identifierLine].trim()) identifierLine--;
    if (markers[n + 1] && (/^\s*\d+\s*$/.test(lines[identifierLine] || "") ||
        (webvtt && lines[identifierLine]?.trim() && identifierLine >= 2 && !lines[identifierLine - 1].trim()))) end = identifierLine;
    const tail = match[3].trim().replace(/^(?:(?:align|position|line|size|vertical):\S+\s*)+/, "");
    const text = [tail, ...lines.slice(line + 1, end)].join(" ").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    const startMs = ms(match[1]), endMs = ms(match[2]);
    if (endMs <= startMs || !text)
      throw Error(`Câu phụ đề ${n + 1} có thời gian hoặc nội dung không hợp lệ.`);
    if (out.length && startMs < out.at(-1).endMs)
      throw Error(`Câu phụ đề ${n + 1} chồng thời gian với câu trước. Hãy điều chỉnh mốc thời gian.`);
    out.push({ startMs, endMs, text });
  }
  if (out.at(-1).endMs > 600000) throw Error("Phụ đề dài tối đa 10 phút.");
  return out;
}

// File.text() assumes UTF-8 and silently corrupts UTF-16 subtitle exports.
export function decodeSubtitleFile(buffer) {
  const bytes = new Uint8Array(buffer);
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw Error("Không đọc được bảng mã của file. Hãy lưu lại dạng UTF-8 hoặc UTF-16 có BOM."); }
}

export function scaleSrt(cues, totalMs) {
  if (!Number.isInteger(totalMs) || totalMs < 1000 || totalMs > 600000)
    throw Error("Thời lượng SRT cần từ 1 đến 600 giây.");
  const original = cues.at(-1)?.endMs;
  if (!original) throw Error("SRT chưa có thời gian hợp lệ.");
  const factor = totalMs / original;
  const result = cues.map((c) => ({
    ...c,
    startMs: Math.round(c.startMs * factor),
    endMs: Math.round(c.endMs * factor),
  }));
  result.at(-1).endMs = totalMs;
  if (result.some((c) => c.endMs <= c.startMs))
    throw Error("Thời lượng quá ngắn để giữ đủ các câu SRT.");
  return result;
}
