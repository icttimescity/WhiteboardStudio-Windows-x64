import {withVieneuWorker,vieneuStatus} from './vieneu-runtime.js';
import { timingForSpeech } from "../public/timing.js";
import { narrationText } from "../public/srt-timing.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { run } from "./process.js";
import { resolveTtsPython } from "./tts-runtime.js";
import { timedText } from "./domain.js";
import {voices,getVoice} from "./voice-catalog.js";
export {voices} from "./voice-catalog.js";
export const ttsPython = () =>
  resolveTtsPython({ root: config.root, fallback: config.python });
export function settings(s) {
  const t = s.tts || {};
  return {
    ...(t.engine==="vieneu"?{...(vieneuStatus().voices.find(v=>v.id===t.voice)?.kind==='clone'?{voiceRevision:vieneuStatus().voices.find(v=>v.id===t.voice)?.revision}:{}),engine:"vieneu",model:"v3turbo@3.8.3",backend:t.backend||"onnx"}:{}),
    text: narrationText(s.narration ?? s.text ?? ""),
    voice: t.voice || (t.engine==="vieneu"?vieneuStatus().defaultVoice:voices[0].id),
    speed: Number(t.speed ?? 0.85),
    pauseMs: Number(t.pauseMs ?? 450),
    style: t.style || "narration",
    ...(getVoice(t.voice)?.numSpeakers>1 ? {speakerId:Number(t.speakerId ?? 0)} : {}),
  };
}
export function validateSettings(v) {
  if(v.engine==='vieneu'){
    if(!['onnx','cuda'].includes(v.backend)||v.model!=='v3turbo@3.8.3')throw Error('Cấu hình VieNeu không hợp lệ.');
    const list=vieneuStatus().voices||[{id:'Minh Quân Pro'}];
    if(!list.some(x=>x.id===v.voice||(x.aliases||[]).includes(v.voice)))throw Error('Giọng VieNeu không hợp lệ. Hãy làm mới danh sách.');
  }
  if (v.engine!=="vieneu" && !voices.some((x) => x.id === v.voice))
    throw Error("Giọng Piper không được hỗ trợ.");
  const voice=getVoice(v.voice);
  if (v.speakerId !== undefined && (!Number.isInteger(v.speakerId)||v.speakerId<0||v.speakerId>=(voice?.numSpeakers||1)))
    throw Error(`Người nói phải từ 0 đến ${(voice?.numSpeakers||1)-1}.`);
  if (!Number.isFinite(v.speed) || v.speed < 0.7 || v.speed > 1.4)
    throw Error("Tốc độ lời đọc cần từ 0.7 đến 1.4.");
  if (!Number.isInteger(v.pauseMs) || v.pauseMs < 0 || v.pauseMs > 2000)
    throw Error("Khoảng nghỉ cần từ 0 đến 2000 ms.");
  if (!["neutral", "narration", "calm"].includes(v.style))
    throw Error("Nhịp đọc không hợp lệ.");
  if (!v.text || v.text.length > 6000)
    throw Error("Lời đọc cần từ 1 đến 6000 ký tự.");
  return v;
}
export const speechKey = (s) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify({ version: 2, ...settings(s) }))
    .digest("hex");
export const speechCurrent = (s) => {
  if (!s.speech?.file) return false;
  if (s.speech.key === speechKey(s)) return true;
  if(s.tts?.engine==='vieneu')return false;
  // Existing 1.1.0 WAVs stay usable until the user explicitly edits their voice settings.
  if (s.tts?.style) return false;
  const t = s.tts || {};
  const old = {
    text: narrationText(s.narration ?? s.text ?? ""),
    voice: t.voice || voices[0].id,
    speed: Number(t.speed ?? 1),
    pauseMs: Number(t.pauseMs ?? 300),
  };
  return (
    s.speech.key ===
    crypto.createHash("sha256").update(JSON.stringify(old)).digest("hex")
  );
};
export async function synthesize(s, output, ctx) {
  const spec = validateSettings(settings(s));
  if(spec.engine==='vieneu'){
    const status=vieneuStatus();if(!status.backends?.[spec.backend])throw Error('Chưa tải/cài bộ VieNeu '+spec.backend+'. Mở tab Lời đọc để cài.');
    const perform=async worker=>{
      const raw=output+'.raw.wav';
      try{
        const info=await worker({...spec,output:raw});
        await run(config.python,['scripts/media.py','tempo',raw,output,String(spec.speed)],{...ctx,timeout:180000});
        return {...info,durationMs:Math.round(info.durationMs/spec.speed),key:speechKey(s),file:path.basename(output),voice:spec.voice,engine:'vieneu'};
      }finally{fs.rmSync(raw,{force:true});fs.rmSync(raw.replace(/\.wav$/,'.part.wav'),{force:true});}
    };
    try{return await (ctx.vieneuWorker?perform(ctx.vieneuWorker):withVieneuWorker(ctx,perform));}catch(e){fs.rmSync(output,{force:true});throw e;}
  }
  const manifest = output + ".json";
  fs.writeFileSync(manifest, JSON.stringify({ ...spec, output }));
  try {
    const result = await run(
      ttsPython(),
      ["scripts/piper_tts.py", "synthesize", manifest],
      { ...ctx, timeout: 600000 },
    );
    const line = result.split("\n").find((x) => x.startsWith("RESULT "));
    if (!line) throw Error("Piper không trả kết quả âm thanh.");
    const info = JSON.parse(line.slice(7));
    if (
      !Number.isFinite(info.durationMs) ||
      info.durationMs <= 0 ||
      info.durationMs > 600000 ||
      !fs.existsSync(output)
    )
      throw Error("File lời đọc không hợp lệ hoặc dài hơn 10 phút.");
    return {
      ...info,
      key: speechKey(s),
      file: path.basename(output),
      voice: spec.voice,
    };
  } catch (e) {
    if (/Chua co model/.test(e.message))
      throw Error(
        "Giọng chưa có trên máy. Mở Quản lý / tải giọng và tải giọng này trước.",
      );
    fs.rmSync(output, { force: true });
    fs.rmSync(output.replace(/\.wav$/, ".part.wav"), { force: true });
    throw Error(
      "Piper: " +
        e.message +
        " Nếu chưa cài, chạy setup-piper-windows.bat hoặc npm run setup:tts.",
    );
  } finally {
    fs.rmSync(manifest, { force: true });
  }
}
// Build an export copy: source SRT and manual annotations remain editable unchanged.
export function speechTimeline(project, { audioSource, timing = "fit" } = {}) {
  const p = structuredClone(project);
  const source =
    audioSource ||
    (p.audio ? "upload" : p.scenes.some((s) => s.speech) ? "tts" : "none");
  if (
    !["upload", "tts", "none"].includes(source) ||
    !["fit", "fixed", "voice"].includes(timing)
  )
    throw Error("Thiết lập âm thanh không hợp lệ.");
  p.sceneSpeech = source === "tts";
  if (source !== "upload") p.audio = null;
  if (source === "upload" && !p.audio)
    throw Error("Chưa tải file lời đọc lên.");
  if (source !== "tts") return p;
  let start = 0;
  p.cues = [];
  for (const s of p.scenes) {
    if (!speechCurrent(s))
      throw Error(
        `Cảnh ${s.title}: thiếu lời đọc hoặc lời đọc đã thay đổi. Hãy tạo lời đọc trước.`,
      );
    const old = s.durationMs;
    let plan;
    try {
      plan = timingForSpeech(
        old,
        s.speech.durationMs,
        timing,
        Math.max(1000, (s.annotation?.elements.length || 1) * 100 + 600),
      );
    } catch (e) {
      throw Error(`Cảnh ${s.title}: ${e.message}`);
    }
    s.speech = {
      ...s.speech,
      playbackRate: plan.playbackRate,
      audioDurationMs: plan.audioDurationMs,
    };
    s.durationMs = plan.durationMs;
    if (timing !== "fixed") s.startMs = start;
    start = s.startMs + s.durationMs;
    if (s.annotation && s.durationMs !== old) {
      const elements = s.annotation.elements;
      const total = elements.reduce((sum, e) => sum + e.reveal.durationMs, 0);
      const extra = s.durationMs - 600 - elements.length * 100;
      let cursor = 100;
      elements.forEach((e, i) => {
        e.reveal.startMs = cursor;
        e.reveal.durationMs =
          i === elements.length - 1
            ? s.durationMs - 500 - cursor
            : 100 + Math.floor((extra * e.reveal.durationMs) / total);
        cursor += e.reveal.durationMs;
      });
      s.annotation.sceneDurationMs = s.durationMs;
    }
    p.cues.push(
      ...timedText(settings(s).text, s.speech.audioDurationMs).map((c) => ({
        ...c,
        startMs: c.startMs + s.startMs + 150,
        endMs: c.endMs + s.startMs + 150,
      })),
    );
  }
  if (start > 600000)
    throw Error("Video sau khi ghép lời đọc vượt quá 10 phút. Hãy chia dự án.");
  return p;
}
