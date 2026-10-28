import {initPuterAI} from './puter-ai.js';
import {initVieneuLibrary} from './vieneu-library.js';
import {formatOf,canvasOf} from './formats.js';
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
const W=()=>canvasOf(p).width,H=()=>canvasOf(p).height;
let currentTab="script",editVersion=0,autosaveTimer,savePending=null,scriptTimer,scriptDirty=false,scriptPending=null,vieneu={voices:[],backends:{}};
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
  dirty = true;editVersion++;
  $("dirty").textContent="Đang chờ tự lưu…";$("saveState").textContent="Đang chờ lưu…";
  clearTimeout(autosaveTimer);autosaveTimer=setTimeout(()=>save().catch(e=>{$("saveState").textContent="Chưa lưu — thử lại";toast(e.message,true);}),700);
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
  await flushScript();
  if(dirty)await save();
  p = await api(`/api/projects/${id}`);
  selected = 0;
  region = 0;
  dirty = false;
  lastJob = "";
  $("welcome").hidden = true;
  $("workspace").hidden = false;
  $("heading").textContent = p.title;
  hydrateScript();
  renderProject();
  hydrateExport();
  showTab(readTab(p.id));
  await refreshList();
  await Promise.allSettled([voiceLibrary.refresh(),refreshVieneu()]);
}
function renderProject() {
  $("contentMode").value = p.scriptDraft?.contentMode || p.contentMode || "story";
  $("audience").value = p.scriptDraft?.audience || p.audience || "primary";
  selected = Math.max(0,Math.min(selected, p.scenes.length - 1));
  $("sceneCount").value = p.sceneCount || p.scenes.length;
  const duration = (p.cues.at(-1)?.endMs||0) / 1000;
  $("summary").textContent =
    `${p.scenes.length} cảnh · ${duration.toFixed(1)} giây · ${p.sceneTimingEdited ? "Thời lượng đã chỉnh theo cảnh" : p.kind === "srt" ? (p.srtTiming === "scale" ? "Mốc SRT đã co/giãn" : "Mốc thời gian từ SRT") : "Thời gian ước tính từ văn bản"}`;
  renderProjectVoices();
  renderScenes();
  openScene();
  renderStatus();
  renderMedia();
  updateStages();
}
function taskText(sc) {
  if(!sc)return "";
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
            $("scenes").querySelectorAll(".scene").forEach((el,i)=>el.classList.toggle("active",i===selected));
            openScene();
          })),
    );
  $("scenes").querySelectorAll(".scene").forEach(b=>b.ondblclick=e=>{
    if(!e.target.closest('img,.placeholder')||locked())return;
    guard(async()=>{selected=+b.dataset.index;openScene();$("uploadImage").click();});
  });
  $("scenes").scrollTop = scroll.top;
  $("scenes").scrollLeft = scroll.left;
}
function openScene() {
  tracing=null;polygonDraft=[];drag=null;
  const sc = s();
  $("editor").hidden=!sc;$("emptyScenes").classList.toggle("hasScenes",!!sc);
  if(!sc)return;
  $("canvas").width=W();$("canvas").height=H();$("canvas").parentElement.style.aspectRatio=`${W()}/${H()}`;$("canvas").parentElement.style.width=`min(100%, ${Math.round(W()/H()*620)}px)`;
  $("backgroundMode").value=sc.backgroundMode||"auto";$("backgroundColor").value=sc.backgroundColor||sc.detectedBackground||"#f6f1e3";
  $("speechEngine").value=sc.tts?.engine==='vieneu'?'vieneu':'piper';$("speechBackend").value=sc.tts?.backend||"onnx";
  $("sceneImagePreview").hidden=!sc.image;if(sc.image)$("sceneImagePreview").src=`/media/${p.id}/${sc.image}`;
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
  $("sceneSeconds").value = String(sc.durationMs/1000);
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
      : "Mặc định vẽ toàn ảnh. Bạn có thể dùng AI hoặc thêm vùng thủ công. Vùng bao ngoài được tự nhận diện và vẽ sau các vùng nhỏ nằm bên trong, dù đặt trước hay sau trong danh sách. Các vùng giao nhau một phần vẫn theo thứ tự; phần đã vẽ được giữ nguyên, vùng tiếp theo chỉ bổ sung phần còn thiếu. Vùng bị phủ hết được bỏ qua khi xuất và chia lại thời gian cho vùng còn lại.";
  region = Math.min(region, Math.max(0, (draft?.elements.length || 1) - 1));
  renderRegions();
  draw();
}
function draw() {
  const c = $("canvas"),
    ctx = c.getContext("2d");
  ctx.fillStyle = s()?.backgroundMode==="manual"?$("backgroundColor").value:s()?.detectedBackground||"#F6F1E3";
  ctx.fillRect(0, 0, W(), H());
  if (image) ctx.drawImage(image, 0, 0, W(), H());
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
  clearTimeout(autosaveTimer);
  if(savePending){await savePending;if(dirty)return save();return;}
  if (!p || !dirty || !s()) return;
  if (locked()) throw Error("Chờ tác vụ hoàn tất trước khi lưu.");
  const id=p.id,sid=s().id,version=editVersion;
  const body={title:$("title").value,prompt:$("prompt").value,annotation:draft,narration:$("speechText").value,
    backgroundMode:$("backgroundMode").value,backgroundColor:$("backgroundColor").value,
    tts:{engine:$("speechEngine").value,backend:$("speechBackend").value,voice:$("speechVoice").value,speakerId:Number($("speechSpeaker").value||0),speed:Number($("speechSpeed").value),pauseMs:Number($("speechPause").value),style:$("speechStyle").value}};
  $("saveState").textContent="Đang lưu…";
  savePending=(async()=>{const next=await api(`/api/projects/${id}/scenes/${sid}`,"PUT",body);if(p?.id===id){p=next;dirty=editVersion!==version;$("dirty").textContent=dirty?"Đang lưu thay đổi mới…":"Đã tự lưu";$("saveState").textContent=dirty?"Đang chờ lưu…":"Đã lưu";renderScenes();renderMedia();updateStages();}})();
  try{await savePending;}finally{savePending=null;}
  if(dirty)autosaveTimer=setTimeout(()=>save().catch(e=>toast(e.message,true)),500);
}

async function job(type, options = {}) {
  await save();
  await flushScript();
  const routing=['sceneplan','storyboard','check'].includes(type)?await puterAI.options():{engine:$("planningEngine").value};
  await api(`/api/projects/${p.id}/jobs`, "POST", { type, options:{...options,...routing} });
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
    "applyScript",
    "applyFormat",
    "up",
    "down",
    "removeRegion",
  ].forEach((id) => ($(id).disabled = lock));
  [
    "aspectRatio",
    "imageFit",
    "imagePosition",
    "projectEngine",
    "projectBackend",
    "speechEngine",
    "speechBackend",
    "backgroundMode",
    "backgroundColor",
    "planningEngine",
    "sourceText",
    "projectTitle",
    "seconds",
    "kind",
    "srtTiming",
    "scriptStyle",
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
    "sceneSeconds",
    "applySceneSeconds",
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
  updateStages();
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
        `<h3>${k === "preview" ? "Bản xem trước" : "Video hoàn chỉnh"}</h3><video controls preload="metadata" src="/video/${p.id}/${k}?v=${encodeURIComponent(p[k].createdAt)}"></video><a class="button" href="/video/${p.id}/${k}?download=1">Tải ${k === "preview" ? "bản xem trước" : "video MP4"}</a>`,
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
    scriptChanged();
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
  "backgroundMode",
  "backgroundColor",
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
action("checkAI", async () => {await job("check");$("aiDialog").close();});
action("storyboard", () => job("storyboard"));
action("storyboardScene", () => job("storyboard", { sceneId: s().id }));
action("speech", () => job("speech", { sceneId: s().id }));
action("applyVoice", async () => {
  await save();
  const tts = {
    engine:$("speechEngine").value,backend:$("speechBackend").value,
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
    if(e.region.points && (target.width<=0||target.height<=0||target.x<0||target.y<0||target.x+target.width>W()||target.y+target.height>H()))return;
    e.region=transformRegion(e.region,target);
    changed();
    draw();
  };
$("showBoxes").onchange = draw;
function point(e) {
  const r = $("canvas").getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * W()) / r.width,
    y: ((e.clientY - r.top) * H()) / r.height,
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
    r.width = Math.max(20, Math.min(W() - r.x, o.width + dx));
    r.height = Math.max(20, Math.min(H() - r.y, o.height + dy));
  } else {
    r.x = Math.max(0, Math.min(W() - r.width, o.x + dx));
    r.y = Math.max(0, Math.min(H() - r.height, o.y + dy));
  }
  if(o.points)draft.elements[region].region=transformRegion(o,{x:r.x,y:r.y,width:r.width,height:r.height});
  changed();
  renderRegions();
  draw();
};
function boundedPoint(e){const p=point(e);return {x:Math.round(Math.max(0,Math.min(W(),p.x))),y:Math.round(Math.max(0,Math.min(H(),p.y)))};}
function finishShape(points){
 if(!draft||locked())return;
 if(draft.elements.length>=20)throw Error('Tối đa 20 vùng.');
 const list=points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);
 const sampled=list.length>256?list.filter((_,i)=>i%Math.ceil(list.length/256)===0):list;
 const shape=polygonRegion(sampled,canvasOf(p));
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
  if (dirty || scriptDirty) {
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
        selected = Math.max(0,Math.min(selected, p.scenes.length - 1));
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
$("audioSource").onchange = () => {subtitleLink();syncNote();};
$("speechTiming").onchange = () => {
  subtitleLink();
  syncNote();
};
api("/api/tts")
  .then((x) => {
    $("ttsHealth").textContent = x.ready
      ? "Piper đã sẵn sàng • Thư viện đa ngôn ngữ • Chạy offline trên CPU"
      : x.message ||
        "Mở Quản lý / tải giọng để tải giọng cần dùng.";
  })
  .catch(() => {});

function syncNote() {
  const descriptions={
    fit:'Tự điều chỉnh (đề xuất): đổi nhẹ tốc độ giọng trong khoảng 0,85–1,10 lần. Nếu vẫn chưa khớp, kéo dài hoặc rút ngắn cảnh theo lời đọc. Tổng thời lượng video có thể thay đổi.',
    voice:'Giữ tốc độ giọng: giữ nguyên tốc độ của file lời đọc đã tạo. Mỗi cảnh dài bằng lời đọc cộng 0,5 giây nghỉ cuối; tổng thời lượng video có thể thay đổi.',
    fixed:'Giữ độ dài cảnh: giữ nguyên thời gian đã đặt (kể cả mốc SRT), đổi tốc độ giọng để vừa cảnh và chừa 0,5 giây nghỉ cuối. Chỉ cho phép tốc độ 0,70–1,20 lần; nếu lệch nhiều hơn sẽ báo để bạn chỉnh lại, không tự cắt lời đọc.'
  };
  $("timingHelp").textContent=$("audioSource").value==='tts'?descriptions[$("speechTiming").value]:'Lựa chọn này chỉ dùng cho lời đọc tạo theo từng cảnh. File âm thanh tải lên được phát từ đầu video, cắt phần dư hoặc thêm im lặng nếu thiếu.';
  $("speechTiming").disabled=$("audioSource").value!=='tts';
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
 const vi=$("speechEngine").value==='vieneu';$("ttsHealth").hidden=vi;for(const id of ['speechLanguage','speechVoiceSearch'])$(id).closest('label').hidden=vi;$("speechBackend").closest('label').hidden=!vi;
 if($("speechEngine").value==='vieneu'){
  const list=vieneu.voices||[];$("speechVoice").innerHTML=(list.length?list:[{id:'Minh Quân Pro',label:'Minh Quân Pro — cài VieNeu để dùng'}]).map(v=>`<option value="${esc(v.id)}">${esc(v.label)}</option>`).join('');
  if(list.some(v=>v.id===current))$("speechVoice").value=current;else if(list.some(v=>v.id===vieneu.defaultVoice))$("speechVoice").value=vieneu.defaultVoice;return;
 }
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
const voiceLibrary=initVoiceLibrary({api,toast,getProject:()=>p,locked,onSelect:id=>{$("speechEngine").value='piper';$("speechLanguage").value='';$("speechVoiceSearch").value='';renderSpeechVoices(id);syncSpeaker();changed();},onCatalog:list=>{voiceCatalog=list;renderProjectVoices();const before=$("speechLanguage").value;$("speechLanguage").innerHTML='<option value="">Tất cả ngôn ngữ</option>'+[...new Map(list.map(v=>[v.language,v.languageName]))].sort((a,b)=>a[1].localeCompare(b[1],'vi')).map(([code,name])=>`<option value="${esc(code)}">${esc(name)}</option>`).join('');$("speechLanguage").value=before;}});
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
 const list=($("projectEngine").value==="vieneu"?(vieneu.installed&&vieneu.backends?.[$("projectBackend").value]?(vieneu.voices||[]):[]).map(v=>({...v,languageName:"Tiếng Việt",installed:true})):voiceCatalog).filter(v=>v.installed).sort((a,b)=>a.languageName.localeCompare(b.languageName,'vi')||a.label.localeCompare(b.label,'vi'));
 const projectChanged=select.dataset.project!==p?.id;
 if(projectChanged){$("projectEngine").value=p?.projectVoice?.engine||"piper";$("projectBackend").value=p?.projectVoice?.backend||"onnx";}
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
 p=await api(`/api/projects/${p.id}/voice-settings`,"PUT",{voiceOnly:true,tts:{voice,speakerId,engine:$("projectEngine").value,backend:$("projectBackend").value}});
 renderProject();
 toast("Đã áp dụng giọng cho mọi cảnh. Có thể đổi riêng từng cảnh; bấm tạo lời đọc để cập nhật âm thanh.");
});

function showTab(tab){
 currentTab=['script','images','voices','drawing','export'].includes(tab)?tab:'script';
 document.querySelectorAll('[data-stage],[data-stages]').forEach(el=>{const values=el.dataset.stages?.split(' ')||[el.dataset.stage];el.hidden=!values.includes(currentTab);});
 document.querySelectorAll('[data-tab]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.tab===currentTab));b.tabIndex=b.dataset.tab===currentTab?0:-1;});
 $('stageHeading').textContent=({script:'Kịch bản',images:'Phân cảnh & hình ảnh',voices:'Lời đọc',drawing:'Hiệu ứng vẽ',export:'Xuất video'})[currentTab];
 if(p)try{localStorage.setItem('wb-tab-'+p.id,currentTab);}catch{}updateStages();
}
document.querySelectorAll('[data-tab]').forEach(b=>{
 b.onclick=()=>guard(async()=>{await flushScript();showTab(b.dataset.tab);});
 b.onkeydown=e=>{if(['ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();const list=[...document.querySelectorAll('[data-tab]')],i=list.indexOf(b),next=list[(i+(e.key==='ArrowRight'?1:4))%5];next.focus();next.click();}};
});
function updateStages(){
 if(!p)return;const n=p.scenes.length;const local=$('planningEngine').value==='local';$('sceneplan').textContent=local?'Chia cảnh trên máy':'AI chia lại phân cảnh';$('storyboardScene').textContent=local?'Tạo lại prompt cảnh này':'AI đề xuất lại cảnh này';$('annotate').textContent=local||$('planningEngine').value==='puter'?'Tự tìm vùng nét trên máy':'AI đề xuất vùng vẽ';$('checkAI').hidden=local;
 $('count-script').textContent=p.text?'Đã có nội dung':'Bản nháp';$('count-images').textContent=`${p.scenes.filter(s=>s.image).length}/${n} ảnh`;$('count-voices').textContent=`${p.scenes.filter(s=>s.speech&&s.tasks?.speech?.status!=='stale').length}/${n} lời đọc`;$('count-drawing').textContent=`${p.scenes.filter(s=>s.annotation).length}/${n} cảnh`;$('count-export').textContent=p.output?'Có video':'';
 $('sceneStudio').classList.toggle('empty',!n);$('emptyScenes').classList.toggle('hasScenes',!!n);
 for(const id of ['storyboard','speeches','sceneplan','preview','render'])if(!n)$(id).disabled=true;
 $('exportSummary').textContent=`${formatOf(p).label} · ${formatOf(p).output.join(' × ')} px · ${n} cảnh`;
 $('formatNote').textContent=`Khung hiện tại: ${formatOf(p).label}. ${s()?.annotationNeedsReview?'Bố cục đã đổi — kiểm tra lại vùng vẽ.':''}`;
}
function hydrateScript(){
 const d=p.scriptDraft||{title:p.title,planningEngine:p.planningEngine||"local",text:p.sourceSubtitle||p.text,kind:p.kind,seconds:(p.cues.at(-1)?.endMs||60000)/1000,srtTiming:p.srtTiming,contentMode:p.contentMode,audience:p.audience,style:p.style};
 $('planningEngine').value=d.planningEngine||p.planningEngine||'local';puterAI.hydrate(d.puterSettings||p.puterSettings);$('projectTitle').value=p.title;$('sourceText').value=d.text||'';$('kind').value=d.kind||'text';$('seconds').value=d.seconds||60;$('srtTiming').value=d.srtTiming||'original';$('scriptStyle').value=d.style||'';$('contentMode').value=d.contentMode||'story';$('audience').value=d.audience||'primary';
 $('aspectRatio').value=p.aspectRatio||'16:9';$('imageFit').value=p.imageFit||'contain';$('imagePosition').value=p.imagePosition||'centre';scriptDirty=false;syncSourceDuration();
}
function scriptBody(){return {planningEngine:$('planningEngine').value,puterSettings:puterAI.settings(),title:$('projectTitle').value,text:$('sourceText').value,kind:$('kind').value,seconds:Number($('seconds').value),srtTiming:$('srtTiming').value,style:$('scriptStyle').value,contentMode:$('contentMode').value,audience:$('audience').value};}
let scriptVersion=0;
function scriptChanged(){scriptDirty=true;scriptVersion++;$('saveState').textContent='Đang chờ lưu…';clearTimeout(scriptTimer);scriptTimer=setTimeout(()=>flushScript().catch(e=>toast(e.message,true)),800);}
async function flushScript(){
 clearTimeout(scriptTimer);if(scriptPending){await scriptPending;if(scriptDirty)return flushScript();return;}
 if(!p||!scriptDirty||locked())return;
 const id=p.id,body=scriptBody(),version=scriptVersion;
 scriptPending=api(`/api/projects/${id}/script`,'PUT',body).then(next=>{if(p?.id===id){p.scriptDraft=next.scriptDraft;p.title=next.title;$('heading').textContent=p.title;scriptDirty=version!==scriptVersion;$('saveState').textContent=scriptDirty?'Đang chờ lưu…':'Đã lưu';}});
 try{await scriptPending;}finally{scriptPending=null;}if(scriptDirty)return flushScript();
}
for(const id of ['planningEngine','projectTitle','sourceText','kind','seconds','srtTiming','scriptStyle','contentMode','audience'])$(id).addEventListener('input',scriptChanged);

action('applyScript',async()=>{
 await save();await flushScript();
 if(p.scenes.length&&!await confirmReplace())return;
 p=await api(`/api/projects/${p.id}/script`,'PUT',{...scriptBody(),apply:true,confirmReplace:true});
 hydrateScript();selected=0;renderProject();await refreshList();showTab('images');toast('Đã tạo phân cảnh. Có thể chọn tỷ lệ và đề xuất prompt.');
});
function confirmReplace(){return new Promise(resolve=>{const d=$('replaceScriptDialog');d.showModal();$('replaceScriptYes').onclick=()=>{d.close();resolve(true);};$('replaceScriptNo').onclick=()=>{d.close();resolve(false);};d.oncancel=()=>resolve(false);});}
action('applyFormat',async()=>{
 await save();const ratio=$('aspectRatio').value,fit=$('imageFit').value,position=$('imagePosition').value;
 if(p.scenes.some(s=>s.image)&&!await confirmFormat())return;
 localBusy=true;renderStatus();try{p=await api(`/api/projects/${p.id}/format`,'PUT',{aspectRatio:ratio,fit,position});renderProject();toast('Đã đổi khung hình. Kiểm tra lại bố cục và các vùng vẽ.');}finally{localBusy=false;renderStatus();}
});
function confirmFormat(){return new Promise(resolve=>{const d=$('formatDialog');d.showModal();$('formatYes').onclick=()=>{d.close();resolve(true);};$('formatNo').onclick=()=>{d.close();resolve(false);};d.oncancel=()=>resolve(false);});}
async function refreshVieneu(){
 vieneu=await api('/api/vieneu');$('vieneuStatus').textContent=`${vieneu.message||''} · RAM máy: ${vieneu.ramGB} GB`;
 $('installVieneuCPU').disabled=vieneu.status==='running';$('installVieneuGPU').disabled=vieneu.status==='running'||!vieneu.hardware?.nvidia?.length;for(const id of ['projectBackend','speechBackend'])$(id).querySelector('[value="cuda"]').disabled=!vieneu.hardware?.nvidia?.length;$('cancelVieneu').disabled=vieneu.status!=='running';
 renderProjectVoices();if(s())renderSpeechVoices($("speechVoice").value||s().tts?.voice);
}
action('refreshVieneu',refreshVieneu);
for(const [id,backend] of [['installVieneuCPU','onnx'],['installVieneuGPU','cuda']])action(id,async()=>{await api('/api/vieneu/install','POST',{backend});await refreshVieneu();});
action('cancelVieneu',async()=>{await api('/api/vieneu/cancel','POST',{});await refreshVieneu();});
setInterval(()=>{if(currentTab==='voices'&&p)refreshVieneu().catch(()=>{});},3000);
$('speechEngine').onchange=()=>{renderSpeechVoices();syncSpeaker();changed();};$('speechBackend').onchange=changed;
$('projectEngine').onchange=()=>{renderProjectVoices();syncProjectSpeaker();};$('projectBackend').onchange=()=>renderProjectVoices();
$('backgroundMode').addEventListener('change',draw);$('backgroundColor').addEventListener('input',()=>{$('backgroundMode').value='manual';draw();});
action('speechPreview',async()=>{if(!s())return;await save();localBusy=true;renderStatus();try{const result=await api(`/api/projects/${p.id}/speech-preview`,'POST',{sceneId:s().id});$('samplePlayer').hidden=false;$('samplePlayer').src=`/media/${p.id}/${result.file}`;await $('samplePlayer').play();}finally{localBusy=false;renderStatus();}});

function hydrateExport(){const e=p?.exportSettings;if(!e)return;for(const key of ['mode','audioSource','speechTiming'])if(e[key])$(key).value=e[key];$('hand').checked=e.hand!==false;$('subtitles').checked=e.subtitles===true;subtitleLink();}
let exportTimer;
for(const id of ['mode','audioSource','speechTiming','hand','subtitles'])$(id).addEventListener('change',()=>{
 clearTimeout(exportTimer);const projectId=p?.id,body={mode:$('mode').value,audioSource:$('audioSource').value,speechTiming:$('speechTiming').value,hand:$('hand').checked,subtitles:$('subtitles').checked};
 exportTimer=setTimeout(()=>{if(projectId&&!locked())api(`/api/projects/${projectId}/export-settings`,'PUT',body).then(r=>{if(p?.id===projectId)p.exportSettings=r.exportSettings;}).catch(e=>toast(e.message,true));},400);
});

function readTab(id){try{return localStorage.getItem('wb-tab-'+id)||'script';}catch{return 'script';}}

$('planningEngine').addEventListener('change',updateStages);

initVieneuLibrary({api,toast,getProject:()=>p,locked,onSelect:async(id,backend)=>{try{if(locked())throw Error('Chờ tác vụ hiện tại hoàn tất.');await refreshVieneu();if(!s())return;if(locked())throw Error('Chờ tác vụ hiện tại hoàn tất.');$("speechEngine").value='vieneu';$("speechBackend").value=backend;vieneu.voices ||= [];renderSpeechVoices(id);changed();toast('Đã chọn giọng VieNeu cho cảnh. Có thể áp dụng cho tất cả cảnh trong tab Lời đọc.');}catch(e){toast(e.message,true);}},onChange:refreshVieneu});

action('applySceneSeconds',async()=>{
 if(!s()||locked())return;
 const id=s().id,seconds=Number($("sceneSeconds").value);await save();
 p=await api(`/api/projects/${p.id}/scenes/${id}/duration`,'PUT',{durationMs:Math.round(seconds*1000)});renderProject();await refreshList();toast('Đã đổi thời lượng và cập nhật mốc các cảnh phía sau.');
});

const puterAI=initPuterAI({api,toast,changed:scriptChanged,locked});

action('aiModels',()=>{
 $('aiProjectHint').textContent=p?'Đang áp dụng cho dự án: '+p.title:'Hãy tạo hoặc mở một dự án để chọn mô hình AI.';
 $('aiControls').disabled=!p;
 $('aiDialog').showModal();
});
async function closeAI(){try{await flushScript();$('aiDialog').close();}catch(e){toast(e.message,true);}}
$('aiClose').onclick=closeAI;
$('aiDialog').addEventListener('cancel',e=>{e.preventDefault();void closeAI();});
