import {polygonRegion,transformRegion,insideRegion} from './region-shape.js';
import {initExternalImages} from "./external-images.js";
import {initVoiceLibrary} from "./voice-library.js";
import {filterVoices} from "./voice-filters.js";
import { createApiClient } from "./api-client.js";
import { parseSrt, decodeSubtitleFile, looksLikeSubtitle, narrationText } from "./srt-timing.js";
import { timingForSpeech } from "./timing.js";
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let p = null,
  selected = 0,
  region = 0,
  draft = null,
  dirty = false,
  image = null,
  lastJob = "",
  polling = false,
  drag = null,
  tracing = null,
  polygonDraft = [],
  localBusy = false,
  deleteTarget = null;
const api = createApiClient();
function toast(msg, error = false) {
  $("toast").textContent = String(msg).replace(/Agnes(?: AI)?/gi,"dịch vụ AI");
  $("toast").className = error ? "error" : "";
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => ($("toast").hidden = true),
    error ? 10000 : 4000,
  );
}
function action(id, fn) {
  $(id).onclick = async (e) => {
    try {
      await fn(e);
    } catch (e) {
      toast(e.message, true);
    }
  };
}
// Proxy controls keep existing save/lock/cancel behaviour in one place.
document.querySelectorAll('[data-action]').forEach(button => {
  button.onclick=()=>{const target=$(button.dataset.action);if(target&&!target.disabled){target.click();button.closest('details')?.removeAttribute('open');}};
});
const dockObserver=new ResizeObserver(entries=>{
  document.documentElement.style.setProperty('--dock-height',`${entries[0].target.getBoundingClientRect().height}px`);
});
dockObserver.observe($('actionDock'));
function changed() {
  dirty = true;
  $("dirty").textContent =
    "Có thay đổi chưa lưu. Lưu trước khi chuyển cảnh hoặc tạo video.";
}
function s() {
  return p?.scenes[selected];
}
function locked() {
  return localBusy || ["queued", "running", "waiting"].includes(p?.job?.status);
}
async function refreshList() {
  const all = await api("/api/projects");
  $("projects").innerHTML = all
    .map(
      (x) =>
        `<div class="projectItem ${p?.id === x.id ? "active" : ""}"><button class="project" data-id="${x.id}">${esc(x.title)}<small>${x.scenes.length} cảnh · ${new Date(x.updatedAt).toLocaleDateString("vi-VN")}</small></button><button class="projectDelete" data-delete="${x.id}" title="Xóa dự án ${esc(x.title)}" aria-label="Xóa dự án ${esc(x.title)}" ${["queued", "running", "waiting"].includes(x.job?.status) || (p?.id === x.id && locked()) ? "disabled" : ""}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg></button></div>`,
    )
    .join("");
  $("projects")
    .querySelectorAll("button[data-id]")
    .forEach((b) => (b.onclick = () => guard(() => load(b.dataset.id))));
  $("projects")
    .querySelectorAll("button[data-delete]")
    .forEach((b) => {
      b.onclick = () => {
        const target = all.find((x) => x.id === b.dataset.delete);
        if (!target || (target.id === p?.id && locked())) return;
        deleteTarget = { id: target.id, title: target.title };
        $("deleteName").textContent = target.title;
        $("deleteDialog").showModal();
      };
    });
}
async function guard(fn) {
  try {
    if (dirty) await save();
    await fn();
  } catch (e) {
    toast(e.message, true);
  }
}
async function load(id) {
  p = await api(`/api/projects/${id}`);
  selected = 0;
  region = 0;
  dirty = false;
  lastJob = "";
  $("welcome").hidden = true;
  $("workspace").hidden = false;
  $("heading").textContent = p.title;
  renderProject();
  await refreshList();
  await voiceLibrary.refresh();
}
function renderProject() {
  $("contentMode").value = p.contentMode || "story";
  $("audience").value = p.audience || "primary";
  selected = Math.min(selected, p.scenes.length - 1);
  $("sceneCount").value = p.sceneCount || p.scenes.length;
  const duration = p.cues.at(-1).endMs / 1000;
  $("summary").textContent =
    `${p.scenes.length} cảnh · ${duration.toFixed(1)} giây · ${p.kind === "srt" ? (p.srtTiming === "scale" ? "Mốc SRT đã co/giãn" : "Mốc thời gian từ SRT") : "Thời gian ước tính từ văn bản"}`;
  renderProjectVoices();
  renderScenes();
  openScene();
  renderStatus();
  renderMedia();
}
function taskText(sc) {
  const labels = {
    queued: "chờ",
    running: "đang xử lý",
    done: "xong",
    stale: "cần tạo lại",
    error: "lỗi",
    interrupted: "bị gián đoạn",
    cancelled: "đã hủy",
  };
  return [
    ["storyboard", "Nội dung"],
    ["speech", "Lời đọc"],
  ]
    .map(([key, label]) => {
      const t = sc.tasks?.[key];
      return t
        ? `${label}: ${labels[t.status] || t.status}${t.error ? " — " + t.error : ""}`
        : "";
    })
    .filter(Boolean)
    .join(" · ");
}
function renderScenes() {
  const scroll = { top: $("scenes").scrollTop, left: $("scenes").scrollLeft };
  $("scenes").innerHTML = p.scenes
    .map(
      (x, i) =>
        `<button class="scene ${i === selected ? "active" : ""}" data-index="${i}">${x.image ? `<img src="/media/${p.id}/${x.image}" alt="Ảnh cảnh ${i + 1}">` : '<div class="placeholder">✎</div>'}<b>${i + 1}. ${esc(x.title)}</b><small>${(x.durationMs / 1000).toFixed(1)} giây</small><small>${esc(taskText(x))}</small></button>`,
    )
    .join("");
  $("scenes")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () =>
          guard(async () => {
            selected = +b.dataset.index;
            region = 0;
            renderScenes();
            openScene();
          })),
    );
  $("scenes").scrollTop = scroll.top;
  $("scenes").scrollLeft = scroll.left;
}
function openScene() {
  tracing=null;polygonDraft=[];drag=null;
  const sc = s();
  $("sceneTasks").textContent =
    taskText(sc) +
    (sc.visualPlan ? ` · Mục tiêu: ${sc.visualPlan.goal}` : "") +
    (sc.promptPurposeStale ? " · Cần đề xuất minh họa theo mục tiêu mới" : "");
  draft = sc.annotation ? structuredClone(sc.annotation) : null;
  dirty = false;
  $("dirty").textContent = "";
  $("sceneTitle").textContent = `Cảnh ${selected + 1}`;
  $("duration").textContent =
    `${(sc.startMs / 1000).toFixed(1)}s → ${((sc.startMs + sc.durationMs) / 1000).toFixed(1)}s`;
  $("title").value = sc.title;
  $("prompt").value = sc.prompt;
  $("imageConsistencyNote").textContent = "Dùng Prompt đầy đủ để sao chép hồ sơ nhân vật, bối cảnh và phong cách sang công cụ tạo ảnh. Tải ảnh hoàn thành vào cảnh này.";
  $("speechText").value = sc.narration ?? sc.text;
  try { $("speechText").value = narrationText($("speechText").value); } catch {} // Keep invalid legacy text editable.
  renderSpeechVoices(sc.tts?.voice || "vi_VN-vais1000-medium");
  syncSpeaker(sc.tts?.speakerId ?? 0);
  $("speechSpeed").value = String(sc.tts?.speed ?? (sc.speech ? 1 : 0.85));
  $("speechPause").value = sc.tts?.pauseMs ?? (sc.speech ? 300 : 450);
  $("speechStyle").value = sc.tts?.style || "narration";
  syncNote();
  $("speechPlayer").hidden = !sc.speech;
  if (sc.speech) $("speechPlayer").src = `/media/${p.id}/${sc.speech.file}`;
  else {
    $("speechPlayer").removeAttribute("src");
    $("speechPlayer").load();
  }
  $("speechNote").textContent =
    sc.tasks?.speech?.status === "stale"
      ? "Nội dung / giọng đã đổi. Cần tạo lại trước khi xuất. Bên dưới là bản cũ."
      : sc.speech
        ? `Đã tạo ${(sc.speech.durationMs / 1000).toFixed(1)} giây — có thể nghe thử.`
        : "Chưa có lời đọc cho cảnh này.";

  $("narration").value = sc.text;
  $("noImage").hidden = !!sc.image;
  image = null;
  if (sc.image) {
    const next = new Image();
    next.onload = () => {
      if (s()?.image === sc.image) {
        image = next;
        draw();
      }
    };
    next.src = `/media/${p.id}/${sc.image}`;
  }
  $("annotationNote").textContent =
    sc.annotationSource === "ai"
      ? "AI đã đề xuất vùng. Hãy kiểm tra và chỉnh nếu cần."
      : "Mặc định vẽ toàn ảnh. Bạn có thể dùng AI hoặc thêm vùng thủ công. Khi chia nhỏ, giữ một vùng toàn ảnh ở đầu để vẽ các nét nền còn lại.";
  region = Math.min(region, Math.max(0, (draft?.elements.length || 1) - 1));
  renderRegions();
  draw();
}
function draw() {
  const c = $("canvas"),
    ctx = c.getContext("2d");
  ctx.fillStyle = "#F6F1E3";
  ctx.fillRect(0, 0, 1280, 720);
  if (image) ctx.drawImage(image, 0, 0, 1280, 720);
  if (!$("showBoxes").checked || !draft) return;
  draft.elements.forEach((e, i) => {
    const r = e.region;
    ctx.strokeStyle = i === region ? "#df853c" : "#477c65";
    ctx.lineWidth = i === region ? 5 : 3;
    if(r.points){ctx.beginPath();r.points.forEach((p,n)=>n?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();}
    else ctx.strokeRect(r.x, r.y, r.width, r.height);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fillRect(r.x, Math.max(0, r.y), Math.min(r.width, 38), 30);
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "white";
    ctx.fillText(i + 1, r.x + 9, r.y + 23);
    if (i === region) {
      ctx.fillStyle = "#df853c";
      ctx.fillRect(r.x + r.width - 9, r.y + r.height - 9, 18, 18);
    }
  });
  const line=tracing||polygonDraft;
  if(line.length){ctx.strokeStyle='#df853c';ctx.lineWidth=4;ctx.beginPath();line.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();line.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fillStyle='#df853c';ctx.fill();});}

}
function renderRegions() {
  $("regions").innerHTML = (draft?.elements || [])
    .map(
      (e, i) =>
        `<button data-i="${i}" class="${i === region ? "active" : ""}">${i + 1}. ${esc(e.label)}</button>`,
    )
    .join("");
  $("regions")
    .querySelectorAll("button")
    .forEach(
      (b) =>
        (b.onclick = () => {
          region = +b.dataset.i;
          renderRegions();
          draw();
        }),
    );
  const e = draft?.elements[region];
  $("regionEditor").hidden = !e;
  if (!e) return;
  $("rLabel").value = e.label;
  $("rStart").value = e.reveal.startMs;
  $("rDuration").value = e.reveal.durationMs;
  ["x", "y", "width", "height"].forEach(
    (k, i) => ($(["rx", "ry", "rw", "rh"][i]).value = e.region[k]),
  );
}
function timing() {
  if (!draft?.elements.length) return;
  const total = s().durationMs - 600,
    n = draft.elements.length;
  let t = 100;
  draft.elements.forEach((e, i) => {
    e.sequence = i + 1;
    e.reveal.startMs = t;
    e.reveal.durationMs =
      i === n - 1 ? s().durationMs - 500 - t : Math.floor(total / n);
    t += e.reveal.durationMs;
  });
  changed();
  renderRegions();
  draw();
}
async function save() {
  if (!p || !dirty) return;
  if (locked()) throw Error("Chờ tác vụ hoàn tất trước khi lưu.");
  p = await api(`/api/projects/${p.id}/scenes/${s().id}`, "PUT", {
    title: $("title").value,
    prompt: $("prompt").value,
    annotation: draft,
    narration: $("speechText").value,
    tts: {
      voice: $("speechVoice").value,
      speakerId:Number($("speechSpeaker").value || 0),
      speed: Number($("speechSpeed").value),
      pauseMs: Number($("speechPause").value),
      style: $("speechStyle").value,
    },
  });
  dirty = false;
  $("dirty").textContent = "Đã lưu";
  renderScenes();
  renderMedia();
}
async function job(type, options = {}) {
  await save();
  await api(`/api/projects/${p.id}/jobs`, "POST", { type, options });
  p = await api(`/api/projects/${p.id}`);
  renderStatus();
}
function renderStatus() {
  const j = p.job;
  $("jobPanel").hidden = !j;
  if (j) {
    $("jobMessage").textContent = String(j.message).replace(/Agnes(?: AI)?/gi,"dịch vụ AI");
    $("progress").value = j.progress;
    $("logs").textContent = j.logs
      .map((x) => `${new Date(x.at).toLocaleTimeString("vi-VN")}  ${String(x.message).replace(/Agnes(?: AI)?/gi,"dịch vụ AI")}`)
      .join("\n");
    $("jobPanel").classList.toggle(
      "error",
      ["error", "interrupted", "partial"].includes(j.status),
    );
    $("cancel").hidden = !["queued", "running", "waiting"].includes(j.status);
    $("retry").hidden = ![
      "error",
      "interrupted",
      "cancelled",
      "partial",
    ].includes(j.status);
  }
  const lock = locked();
  document.querySelectorAll('[data-action]').forEach(b=>{b.disabled=b.dataset.action==='cancel'?!['queued','running','waiting'].includes(p.job?.status):lock;});
  const selectedDelete = $("projects").querySelector(`[data-delete="${p.id}"]`);
  if (selectedDelete) selectedDelete.disabled = lock;
  [
    "save",
    "storyboard",
    "storyboardScene",
    "copyScenePrompt",
    "speech",
    "speeches",
    "applyVoice",
    "applyProjectVoice",
    "refreshProjectVoices",
    "annotate",
    "addRegion",
    "finishPolygon",
    "cancelShape",
    "autoTiming",
    "preview",
    "render",
    "checkAI",
    "sceneplan",
    "savePurpose",
    "up",
    "down",
    "removeRegion",
  ].forEach((id) => ($(id).disabled = lock));
  [
    "regionTool",
    "projectVoice",
    "projectSpeaker",
    "sceneCount",
    "contentMode",
    "audience",
    "speechText",
    "speechVoice",
    "speechSpeed",
    "speechPause",
    "speechStyle",
  "speechSpeaker",
    "audioSource",
    "speechTiming",
    "uploadImage",
    "audio",
    "title",
    "prompt",
    "rLabel",
    "rStart",
    "rDuration",
    "rx",
    "ry",
    "rw",
    "rh",
  ].forEach((id) => ($(id).disabled = lock));
}
function renderMedia() {
  $("audioName").textContent = p.audio
    ? "Đã có file lời đọc tải lên"
    : "Chưa tải file lời đọc lên";
  $("removeAudio").hidden = !p.audio;
  $("audioPlayer").hidden = !p.audio;
  if (p.audio) {
    const url = `/media/${p.id}/${p.audio}`;
    if (!$("audioPlayer").src.endsWith(url)) $("audioPlayer").src = url;
  }
  if ($("audioSource").dataset.project !== p.id) {
    $("audioSource").dataset.project = p.id;
    $("audioSource").value = p.audio ? "upload" : "tts";
  }
  subtitleLink();
  $("videos").innerHTML = ["preview", "output"]
    .filter((k) => p[k])
    .map(
      (k) =>
        `<h3>${k === "preview" ? "Bản xem trước" : "Video Full HD"}</h3><video controls preload="metadata" src="/video/${p.id}/${k}?v=${encodeURIComponent(p[k].createdAt)}"></video><a class="button" href="/video/${p.id}/${k}?download=1">Tải ${k === "preview" ? "bản xem trước" : "video MP4"}</a>`,
    )
    .join("");
}
async function upload(file, url) {
  await save();
  if (locked()) throw Error("Chờ tác vụ đang chạy.");
  localBusy = true;
  renderStatus();
  const f = new FormData();
  f.append("file", file);
  toast("Đang tải và xử lý tệp…");
  try {
    p = await api(url, "POST", f);
    renderProject();
    toast("Đã tải lên");
  } finally {
    ((localBusy = false), (deleteTarget = null));
    renderStatus();
  }
}
["newProject", "welcomeNew"].forEach((id) =>
  action(id, () => $("createDialog").showModal()),
);
action("closeDialog", () => $("createDialog").close());
action("demo", () =>
  guard(async () => {
    toast("Đang chuẩn bị bản mẫu…");
    const d = await api("/api/demo", "POST", {});
    await load(d.id);
  }),
);
action("health", async () => {
  toast("Đang kiểm tra Python và bộ render…");
  const d = await api("/api/health");
  toast(
    d.ok
      ? `Sẵn sàng: Python ${d.python}, OpenCV ${d.opencv}, FFmpeg và font tiếng Việt.`
      : d.error,
    !d.ok,
  );
});
$("createForm").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(e.target));
    const d = await api("/api/projects", "POST", data);
    $("createDialog").close();
    await load(d.id);
  } catch (e) {
    toast(e.message, true);
  } finally {
    button.disabled = false;
  }
};
$("textFile").onchange = async (e) => {
  const file = e.target.files[0];
  if (file) {
    try {
      $("sourceText").value = decodeSubtitleFile(await file.arrayBuffer());
    } catch (e) { toast(e.message, true); return; }
    $("kind").value = /\.(srt|vtt)$/i.test(file.name) || looksLikeSubtitle($("sourceText").value) ? "srt" : "text";
    $("srtTiming").value = "original";
    syncSourceDuration();
  }
};
function syncSourceDuration() {
  const srt = $("kind").value === "srt";
  $("seconds").disabled = false;
  $("seconds").min = srt ? "1" : "3";
  $("srtTimingControls").hidden = !srt;
  if (!srt) return;
  try {
    const seconds = parseSrt($("sourceText").value).at(-1).endMs / 1000;
    if ($("srtTiming").value === "original") $("seconds").value = seconds;
    $("srtDurationHint").textContent =
      `SRT gốc: ${seconds} giây. ${$("srtTiming").value === "scale" ? "Toàn bộ mốc và khoảng nghỉ sẽ co/giãn theo thời lượng bạn nhập." : "Giữ nguyên mốc gốc. Sửa số giây để co/giãn toàn bộ SRT."}`;
  } catch (e) {
    if ($("srtTiming").value === "original") $("seconds").value = "";
    $("srtDurationHint").textContent = e.message;
  }
}
$("kind").onchange = () => {
  $("srtTiming").value = "original";
  syncSourceDuration();
};
$("sourceText").oninput = () => {
  if (looksLikeSubtitle($("sourceText").value) && $("kind").value !== 'srt') {
    $("kind").value = 'srt';
    $("srtTiming").value = 'original';
  }
  syncSourceDuration();
};
$("srtTiming").onchange = syncSourceDuration;
$("seconds").oninput = () => {
  if ($("kind").value === "srt") {
    $("srtTiming").value = "scale";
    syncSourceDuration();
  }
};
[
  "title",
  "prompt",
  "speechText",
  "speechVoice",
  "speechSpeed",
  "speechPause",
  "speechStyle",
  "speechSpeaker",
].forEach((id) => ($(id).oninput = changed));
action("save", async () => {
  await save();
  toast("Đã lưu");
});
action("checkAI", () => job("check"));
action("storyboard", () => job("storyboard"));
action("storyboardScene", () => job("storyboard", { sceneId: s().id }));
action("speech", () => job("speech", { sceneId: s().id }));
action("applyVoice", async () => {
  await save();
  const tts = {
    voice: $("speechVoice").value,
      speakerId:Number($("speechSpeaker").value || 0),
    speed: Number($("speechSpeed").value),
    pauseMs: Number($("speechPause").value),
    style: $("speechStyle").value,
  };
  p = await api(`/api/projects/${p.id}/voice-settings`, "PUT", { tts });
  renderProject();
  toast("Đã áp dụng. Bấm Tạo lời đọc còn thiếu / đã sửa để cập nhật âm thanh.");
});
action("speeches", () => job("speech"));
action("annotate", () => job("annotate", { sceneId: s().id }));
action("cancel", async () => {
  await api(`/api/projects/${p.id}/cancel`, "POST", {});
  toast("Đã gửi yêu cầu hủy");
});
action("retry", () => job(p.job.type, { ...p.job.options, retryFailed: true }));
for (const [id, preview] of [
  ["preview", true],
  ["render", false],
])
  action(id, () =>
    job("render", {
      preview,
      audioSource: $("audioSource").value,
      timing: $("speechTiming").value,
      subtitles: $("subtitles").checked,
      hand: $("hand").checked,
      mode: $("mode").value,
    }),
  );
$("uploadImage").onchange = async (e) => {
  try {
    if (e.target.files[0])
      await upload(
        e.target.files[0],
        `/api/projects/${p.id}/scenes/${s().id}/image`,
      );
  } catch (e) {
    toast(e.message, true);
  } finally {
    e.target.value = "";
  }
};
$("audio").onchange = async (e) => {
  try {
    if (e.target.files[0]) {
      await upload(e.target.files[0], `/api/projects/${p.id}/audio`);
      $("audioSource").value = "upload";
      subtitleLink();
    }
  } catch (e) {
    toast(e.message, true);
  } finally {
    e.target.value = "";
  }
};
action("removeAudio", async () => {
  await save();
  p = await api(`/api/projects/${p.id}/audio`, "DELETE");
  $("audioSource").value = p.scenes.some((s) => s.speech) ? "tts" : "none";
  renderMedia();
});
action("addRegion", () => {
  if (!draft) throw Error("Hãy tạo hoặc tải ảnh trước.");
  if (draft.elements.length >= 20) throw Error("Tối đa 20 vùng.");
  draft.elements.push({
    id: crypto.randomUUID(),
    label: "Vùng mới",
    subtitle: "",
    region: { x: 320, y: 180, width: 300, height: 280 },
    reveal: { startMs: 0, durationMs: 100, protectedRegions: [] },
  });
  region = draft.elements.length - 1;
  timing();
});
action("autoTiming", timing);
action("removeRegion", () => {
  if (draft.elements.length === 1) throw Error("Cần giữ ít nhất một vùng.");
  draft.elements.splice(region, 1);
  region = Math.max(0, region - 1);
  timing();
});
for (const [id, step] of [
  ["up", -1],
  ["down", 1],
])
  action(id, () => {
    const to = region + step;
    if (to < 0 || to >= draft.elements.length) return;
    [draft.elements[region], draft.elements[to]] = [
      draft.elements[to],
      draft.elements[region],
    ];
    region = to;
    timing();
  });
for (const id of ["rLabel", "rStart", "rDuration", "rx", "ry", "rw", "rh"])
  $(id).oninput = () => {
    const e = draft.elements[region];
    e.label = $("rLabel").value;
    e.reveal.startMs = Math.round(+$("rStart").value);
    e.reveal.durationMs = Math.round(+$("rDuration").value);
    const target={};["x","y","width","height"].forEach((k,i)=>target[k]=Math.round(+$(["rx","ry","rw","rh"][i]).value));
    if(e.region.points && (target.width<=0||target.height<=0||target.x<0||target.y<0||target.x+target.width>1280||target.y+target.height>720))return;
    e.region=transformRegion(e.region,target);
    changed();
    draw();
  };
$("showBoxes").onchange = draw;
function point(e) {
  const r = $("canvas").getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * 1280) / r.width,
    y: ((e.clientY - r.top) * 720) / r.height,
  };
}
$("canvas").onpointerdown = (e) => {
  if (!draft || locked() || !$("showBoxes").checked) return;
  const pt = boundedPoint(e);
  if($("regionTool").value==='freehand'){
    if(draft.elements.length>=20){toast('Tối đa 20 vùng.',true);return;}
    tracing=[pt];$("canvas").setPointerCapture(e.pointerId);draw();return;
  }
  if($("regionTool").value==='polygon'){
    if(polygonDraft.length<256)polygonDraft.push(pt);draw();return;
  }
  let index = -1;
  for (let i = draft.elements.length - 1; i >= 0; i--) {
    const r = draft.elements[i].region;
    if (insideRegion(r,pt) || (Math.abs(pt.x-r.x-r.width)<25 && Math.abs(pt.y-r.y-r.height)<25)) {
      index = i;
      break;
    }
  }
  if (index < 0) return;
  region = index;
  const r = draft.elements[index].region;
  drag = {
    pt,
    original: structuredClone(r),
    resize:
      Math.abs(pt.x - r.x - r.width) < 25 &&
      Math.abs(pt.y - r.y - r.height) < 25,
  };
  $("canvas").setPointerCapture(e.pointerId);
  renderRegions();
  draw();
};
$("canvas").onpointermove = (e) => {
  if(tracing){const pt=boundedPoint(e),last=tracing.at(-1);if(Math.hypot(pt.x-last.x,pt.y-last.y)>=3){tracing.push(pt);if(tracing.length>512)tracing=tracing.filter((_,i)=>i%2===0);}draw();return;}
  if (!drag) return;
  const pt = point(e),
    dx = Math.round(pt.x - drag.pt.x),
    dy = Math.round(pt.y - drag.pt.y),
    r = draft.elements[region].region,
    o = drag.original;
  if (drag.resize) {
    r.width = Math.max(20, Math.min(1280 - r.x, o.width + dx));
    r.height = Math.max(20, Math.min(720 - r.y, o.height + dy));
  } else {
    r.x = Math.max(0, Math.min(1280 - r.width, o.x + dx));
    r.y = Math.max(0, Math.min(720 - r.height, o.y + dy));
  }
  if(o.points)draft.elements[region].region=transformRegion(o,{x:r.x,y:r.y,width:r.width,height:r.height});
  changed();
  renderRegions();
  draw();
};
function boundedPoint(e){const p=point(e);return {x:Math.round(Math.max(0,Math.min(1280,p.x))),y:Math.round(Math.max(0,Math.min(720,p.y)))};}
function finishShape(points){
 if(!draft||locked())return;
 if(draft.elements.length>=20)throw Error('Tối đa 20 vùng.');
 const list=points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);
 const sampled=list.length>256?list.filter((_,i)=>i%Math.ceil(list.length/256)===0):list;
 const shape=polygonRegion(sampled);
 draft.elements.push({id:crypto.randomUUID(),label:'Vùng tự do',subtitle:'',region:shape,reveal:{startMs:0,durationMs:100,protectedRegions:[]}});
 region=draft.elements.length-1;timing();
}
$("canvas").onpointerup = e => {
 if(tracing){const points=[...tracing,boundedPoint(e)];tracing=null;try{finishShape(points);}catch(err){toast(err.message,true);}draw();}
 drag=null;
};
$("canvas").onpointercancel = () => {drag=null;tracing=null;draw();};
$("regionTool").onchange=()=>{tracing=null;polygonDraft=[];drag=null;$("showBoxes").checked=true;draw();};
action("finishPolygon",()=>{finishShape(polygonDraft);polygonDraft=[];draw();});
action("cancelShape",()=>{tracing=null;polygonDraft=[];drag=null;draw();});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
setInterval(async () => {
  if (!p || polling || localBusy) return;
  polling = true;
  const id = p.id;
  try {
    const next = await api(`/api/projects/${id}`);
    if (!p || p.id !== id) return;
    $("connectionNotice").hidden = true;
    const key = next.job ? `${next.job.id}:${next.job.status}` : "";
    const transitioned = key !== lastJob;
    lastJob = key;
    if (
      transitioned &&
      !["queued", "running", "waiting"].includes(next.job?.status) &&
      !dirty
    ) {
      p = next;
      renderProject();
      refreshList().catch(() => {});
    } else {
      p.job = next.job;
      if (!dirty) {
        p.scenes = next.scenes;
        selected = Math.min(selected, p.scenes.length - 1);
        renderScenes();
        $("sceneTasks").textContent = taskText(s());
      }
      renderStatus();
    }
  } catch (e) {
    if (p?.id === id) {
      $("connectionNotice").textContent = e.message;
      $("connectionNotice").hidden = false;
    }
  } finally {
    polling = false;
  }
}, 1600);
(async () => {
  try {
    const c = await api("/api/config");
    $("models").textContent =
      `${c.keyConfigured ? "Đã cấu hình AI văn bản" : "Chưa cấu hình AI văn bản"}`;
    await refreshList();
  } catch (e) {
    toast(e.message, true);
  }
})();

function subtitleLink() {
  if (p)
    $("srtDownload").href =
      `/api/projects/${p.id}/subtitles?audioSource=${$("audioSource").value}&timing=${$("speechTiming").value}`;
}
$("audioSource").onchange = subtitleLink;
$("speechTiming").onchange = () => {
  subtitleLink();
  syncNote();
};
api("/api/tts")
  .then((x) => {
    $("ttsHealth").textContent = x.ready
      ? "Piper đã sẵn sàng • Thư viện đa ngôn ngữ • Chạy offline trên CPU"
      : x.message ||
        "Chưa có giọng. Mở Quản lý / tải giọng để tải giọng cần dùng.";
  })
  .catch(() => {});

function syncNote() {
  if (!p || !s()?.speech) {
    $("syncNote").textContent = "";
    return;
  }
  try {
    const sc = s(),
      v = timingForSpeech(
        sc.durationMs,
        sc.speech.durationMs,
        $("speechTiming").value,
        Math.max(1000, (sc.annotation?.elements.length || 1) * 100 + 600),
      );
    $("syncNote").textContent =
      `Cảnh gốc: ${(sc.durationMs / 1000).toFixed(1)}s · Tiếng gốc: ${(sc.speech.durationMs / 1000).toFixed(1)}s → Tiếng khi xuất: ${(v.audioDurationMs / 1000).toFixed(1)}s · Cảnh khi xuất: ${(v.durationMs / 1000).toFixed(1)}s. Nghe thử bên dưới là tiếng gốc; Xem trước thật để nghe bản đã đồng bộ.`;
  } catch (e) {
    $("syncNote").textContent = e.message;
  }
}

action("deleteCancel", () => {
  deleteTarget = null;
  $("deleteDialog").close();
});
action("deleteConfirm", async () => {
  if (!deleteTarget) return;
  const id = deleteTarget.id;
  $("deleteConfirm").disabled = true;
  try {
    await api(`/api/projects/${id}`, "DELETE");
    $("deleteDialog").close();
    deleteTarget = null;
    if (p?.id === id) {
      p = null;
      dirty = false;
      $("workspace").hidden = true;
      $("welcome").hidden = false;
      $("heading").textContent = "Kể câu chuyện bằng nét vẽ.";
    }
    await refreshList();
    toast("Đã xóa dự án.");
  } finally {
    $("deleteConfirm").disabled = false;
  }
});
action("sceneplan", () => $("replanDialog").showModal());
action("replanCancel", () => $("replanDialog").close());
action("replanConfirm", async () => {
  const count = Number($("sceneCount").value);
  $("replanDialog").close();
  await job("sceneplan", { count });
});

let voiceCatalog=JSON.parse($("voiceCatalog").textContent);
function renderSpeechVoices(current=$("speechVoice").value){
 const filtered=filterVoices(voiceCatalog,{query:$("speechVoiceSearch").value,language:$("speechLanguage").value});
 const selectedVoice=voiceCatalog.find(v=>v.id===current);
 const list=selectedVoice&&!filtered.some(v=>v.id===current)?[selectedVoice,...filtered]:filtered;
 const groups=new Map();for(const v of list){if(!groups.has(v.languageName))groups.set(v.languageName,[]);groups.get(v.languageName).push(v);}
 $("speechVoice").innerHTML=[...groups].map(([name,vs])=>`<optgroup label="${esc(name)}">${vs.map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}</optgroup>`).join('');
 if(selectedVoice)$("speechVoice").value=current;
}
function syncSpeaker(value=0){const voice=voiceCatalog.find(v=>v.id===$("speechVoice").value);const count=voice?.numSpeakers||1;$("speechSpeakerLabel").hidden=count<=1;$("speechSpeaker").max=count-1;$("speechSpeaker").value=value;$("speechSpeakerHint").textContent=`Chọn từ 0 đến ${count-1}. ${Object.entries(voice?.speakers||{}).slice(0,10).map(([name,id])=>id+': '+name).join(' · ')}`;}
$("speechLanguage").onchange=()=>renderSpeechVoices();
$("speechVoiceSearch").oninput=()=>renderSpeechVoices();
$("speechVoice").onchange=()=>{syncSpeaker();changed();};
const voiceLibrary=initVoiceLibrary({api,toast,getProject:()=>p,locked,onSelect:id=>{$("speechLanguage").value='';$("speechVoiceSearch").value='';renderSpeechVoices(id);syncSpeaker();changed();},onCatalog:list=>{voiceCatalog=list;renderProjectVoices();const before=$("speechLanguage").value;$("speechLanguage").innerHTML='<option value="">Tất cả ngôn ngữ</option>'+[...new Map(list.map(v=>[v.language,v.languageName]))].sort((a,b)=>a[1].localeCompare(b[1],'vi')).map(([code,name])=>`<option value="${esc(code)}">${esc(name)}</option>`).join('');$("speechLanguage").value=before;}});
// Populate language choices immediately without fetching or starting downloads.
$("speechLanguage").innerHTML+=[...new Map(voiceCatalog.map(v=>[v.language,v.languageName]))].sort((a,b)=>a[1].localeCompare(b[1],'vi')).map(([code,name])=>`<option value="${esc(code)}">${esc(name)}</option>`).join('');

action("savePurpose", async () => {
  const body = {
    contentMode: $("contentMode").value,
    audience: $("audience").value,
  };
  await save();
  p = await api(`/api/projects/${p.id}/content-settings`, "PUT", body);
  renderProject();
  toast(
    "Đã cập nhật mục tiêu. Đề xuất minh họa cần cập nhật rồi đồng bộ lại ảnh.",
  );
});

initExternalImages({api,toast,getProject:()=>p,getScene:s,setProject:next=>{p=next;},saveProject:save,locked});

function renderProjectVoices(){
 const select=$("projectVoice"), prior=select.value;
 const list=voiceCatalog.filter(v=>v.installed).sort((a,b)=>a.languageName.localeCompare(b.languageName,'vi')||a.label.localeCompare(b.label,'vi'));
 const projectChanged=select.dataset.project!==p?.id;
 const desired=(projectChanged||!prior)?(p?.projectVoice?.voice||p?.scenes[0]?.tts?.voice):prior;
 const groups=new Map();for(const v of list){if(!groups.has(v.languageName))groups.set(v.languageName,[]);groups.get(v.languageName).push(v);}
 select.innerHTML='<option value="">'+(list.length?'Chọn giọng đã tải…':'Chưa có giọng đã tải — mở Quản lý / tải giọng')+'</option>'+[...groups].map(([name,voices])=>`<optgroup label="${esc(name)}">${voices.map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('')}</optgroup>`).join('');
 select.value=list.some(v=>v.id===desired)?desired:'';
 select.dataset.project=p?.id||'';
 syncProjectSpeaker((projectChanged||!prior)?(p?.projectVoice?.speakerId??p?.scenes[0]?.tts?.speakerId??0):Number($("projectSpeaker").value||0));
}
function syncProjectSpeaker(value=0){
 const v=voiceCatalog.find(v=>v.id===$("projectVoice").value),count=v?.numSpeakers||1;
 $("projectSpeakerLabel").hidden=count<=1;$("projectSpeaker").max=count-1;
 $("projectSpeaker").value=Number.isInteger(value)&&value>=0&&value<count?value:0;
}
$("projectVoice").onchange=()=>syncProjectSpeaker();
action("refreshProjectVoices",async()=>{await voiceLibrary.refresh();toast("Đã cập nhật các giọng đã tải.");});
action("applyProjectVoice",async()=>{
 const voice=$("projectVoice").value,speakerId=Number($("projectSpeaker").value||0);
 if(!voice)throw Error("Hãy chọn một giọng đã tải.");
 await save();
 p=await api(`/api/projects/${p.id}/voice-settings`,"PUT",{voiceOnly:true,tts:{voice,speakerId}});
 renderProject();
 toast("Đã áp dụng giọng cho mọi cảnh. Có thể đổi riêng từng cảnh; bấm tạo lời đọc để cập nhật âm thanh.");
});
