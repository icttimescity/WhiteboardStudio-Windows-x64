import {pollPuter,resolvePuter,validatePuter} from './puter-bridge.js';
import {changeSceneDuration} from './scene-duration.js';
import {voiceJob,startClone,startVoicePreview,cancelVoiceJob} from './vieneu-voice-jobs.js';
import {cloneFolder,cloneId,voiceHome} from './vieneu-catalog.js';
import {vieneuStatus,vieneuInstallation,installVieneu,stopVieneuInstall,vieneuHardware} from './vieneu-runtime.js';
import os from 'node:os';
import {parseScript,scriptDraft,planningChoice} from './project-script.js';
import {canvasOf,formatOf,validFormat,mapAnnotation,reframeAnnotation} from '../public/formats.js';
import {normalizeImage} from './image.js';
import {videoFilename} from './video-filename.js';
import {applyProjectVoice} from './project-voice.js';
import {externalPlan,externalZip,validateExternalSettings} from "./external-images.js";
import {looksLikeSubtitle} from '../public/srt-timing.js';
import sharp from "sharp";
import {refreshCatalog} from "./voice-catalog.js";
import { validateContentSettings } from "./content-purpose.js";
import {
  voiceList,
  downloadVoice,
  stopVoiceDownloads,
  downloadVoices,voiceSummary,
} from "./voice-downloads.js";
import { sceneCount } from "./scene-plan.js";
import {
  voices,
  settings,
  validateSettings,
  speechCurrent,
  speechTimeline,
  ttsPython,
  synthesize,
} from "./tts.js";
import { run } from "./process.js";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { config, safeError } from "./config.js";
import {
  uid,
  save,
  get,
  list,
  dir,
  update,
  invalidate,
  publicProject,
} from "./store.js";
import {
  parseSrt,
  scaleSrt,
  chunks,
  timedText,
  fallbackAnnotation,
  validateAnnotation,
  srtText,
} from "./domain.js";
import { busy, enqueue, cancel, startQueue } from "./queue.js";
import { workflow, uploadImage } from "./workflow.js";
import { python } from "./process.js";
const app = express();
app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(config.root, "views"));
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && new URL(origin).host !== req.get("host"))
    return res
      .status(403)
      .json({ error: "Không chấp nhận yêu cầu từ website khác." });
  next();
});
app.use("/static", express.static(path.join(config.root, "public")));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 40) * 1024 * 1024,
    files: 1,
  },
});
const uploadsInProgress = new Set();
function editable(id) {
  const p = get(id);
  if (busy(p) || uploadsInProgress.has(id))
    throw Error("Dự án đang xử lý. Hãy chờ hoặc hủy tác vụ trước khi sửa.");
  return p;
}
function scene(p, id) {
  const s = p.scenes.find((s) => s.id === id);
  if (!s) throw Error("Không tìm thấy cảnh.");
  return s;
}
app.get("/", (req, res) => res.render("index", { voices }));
const desktopAuthorized=req=>process.env.DESKTOP_MODE==='1'&&!!process.env.DESKTOP_SHUTDOWN_TOKEN&&req.get('X-Desktop-Token')===process.env.DESKTOP_SHUTDOWN_TOKEN;
app.get("/api/desktop", (req, res) =>
  res.json({ app: "whiteboard-studio", version: "2.2.2", desktop:process.env.DESKTOP_MODE==='1',owned:desktopAuthorized(req) }),
);
app.post("/api/desktop/shutdown", (req, res) => {
  if (
    process.env.DESKTOP_MODE !== "1" ||
    !process.env.DESKTOP_SHUTDOWN_TOKEN ||
    req.get("X-Desktop-Token") !== process.env.DESKTOP_SHUTDOWN_TOKEN
  )
    return res.sendStatus(403);
  res.json({ ok: true });
  setImmediate(() => process.emit("SIGTERM"));
});
app.get("/api/config", (req, res) =>
  res.json({
    textModel: config.textModel,
    keyConfigured: !!config.key,
  }),
);
app.get("/api/voices", (req, res) => res.json(voiceList()));
app.get("/api/voices/summary",(req,res)=>res.json(voiceSummary()));
app.post("/api/voices/refresh",async(req,res)=>res.json(await refreshCatalog()));
app.post("/api/voices/download-batch",(req,res)=>res.status(202).json(downloadVoices(req.body.ids)));
app.post("/api/voices/stop",(req,res)=>{stopVoiceDownloads();res.json({ok:true});});
app.post("/api/voices/:voice/download", (req, res) =>
  res.status(202).json(downloadVoice(req.params.voice)),
);
app.get('/api/vieneu',async(req,res)=>res.json({...vieneuInstallation(),voiceJob:voiceJob(),ramGB:Math.round(os.totalmem()/1073741824),hardware:await vieneuHardware()}));
app.post('/api/vieneu/install',async(req,res)=>{if(voiceJob().status==='running')throw Error('Chờ tác vụ giọng hiện tại hoặc hủy trước.');if(list().some(p=>busy(p)))throw Error('Chờ tác vụ hiện tại hoàn tất trước khi cài VieNeu.');if(req.body.backend==='cuda'&&!(await vieneuHardware()).nvidia.length)throw Error('Không tìm thấy GPU NVIDIA. Chọn bộ VieNeu CPU.');res.status(202).json(installVieneu(req.body.backend||'onnx'));});
app.post('/api/vieneu/cancel',(req,res)=>{stopVieneuInstall();res.json({ok:true});});
function canManageVieneu(){if(list().some(p=>busy(p))||uploadsInProgress.size)throw Error('Chờ tác vụ hiện tại hoàn tất trước khi xử lý giọng.');}
app.post('/api/vieneu/clone',upload.single('file'),(req,res)=>{
 canManageVieneu();if(!req.file)throw Error('Chọn âm thanh mẫu của giọng cần lưu.');
 res.status(202).json(startClone({buffer:req.file.buffer,name:req.body.name,description:req.body.description,backend:req.body.backend||'onnx',start:req.body.start||0}));
});
app.get('/api/vieneu/voice-job',(req,res)=>res.json(voiceJob()));
app.post('/api/vieneu/voice-job/cancel',(req,res)=>{cancelVoiceJob();res.json({ok:true});});
app.post('/api/vieneu/voices/:voice/preview',(req,res)=>{canManageVieneu();res.status(202).json(startVoicePreview({voice:req.params.voice,backend:req.body.backend||'onnx',text:req.body.text}));});
app.get('/api/vieneu/previews/:id',(req,res)=>{
 if(!/^[a-f0-9-]{36}$/.test(req.params.id))return res.sendStatus(404);const file=path.join(voiceHome(),'previews',req.params.id+'.wav');if(!fs.existsSync(file))return res.sendStatus(404);res.sendFile(file);
});
app.get('/api/vieneu/voices/:voice/sample',(req,res)=>{const folder=cloneFolder(req.params.voice),file=path.join(folder,'sample.wav');if(!fs.existsSync(path.join(folder,'metadata.json'))||!fs.existsSync(file))return res.sendStatus(404);res.sendFile(file);});
app.delete('/api/vieneu/voices/:voice',(req,res)=>{
 canManageVieneu();if(voiceJob().status==='running')throw Error('Đang xử lý giọng. Hãy chờ hoặc hủy.');
 const id=req.params.voice,folder=cloneFolder(id);if(!fs.existsSync(path.join(folder,'metadata.json')))throw Error('Không tìm thấy giọng clone.');
 const used=list().filter(p=>p.projectVoice?.voice===id||p.scenes.some(s=>s.tts?.engine==='vieneu'&&s.tts?.voice===id));
 if(used.length)throw Error('Giọng đang được dùng trong dự án '+used.slice(0,3).map(p=>p.title).join(', ')+'. Hãy đổi giọng của các cảnh và giọng chung trước khi xóa.');
 fs.rmSync(folder,{recursive:true,force:true});res.json({ok:true});
});
app.get("/api/tts", async (req, res) => {
  try {
    const raw = await run(ttsPython(), ["scripts/piper_tts.py", "doctor"], {
      timeout: 30000,
    });
    res.json({ ...JSON.parse(raw.trim()), voices });
  } catch (e) {
    res.json({
      ready: false,
      voices,
      message:
        safeError(e) +
        " Chạy npm run setup hoặc npm run setup:tts, sau đó thử lại.",
    });
  }
});
app.get("/api/health", async (req, res) => {
  try {
    const d = await python(["scripts/media.py", "doctor"], { timeout: 30000 });
    res.json({ ok: true, ...JSON.parse(d.trim()) });
  } catch (e) {
    res.json({ ok: false, error: safeError(e) });
  }
});
app.get("/api/projects", (req, res) => res.json(list().map(publicProject)));
app.get("/api/projects/:id", (req, res) =>
  res.json(publicProject(get(req.params.id))),
);
app.get('/api/projects/:id/external-images',(req,res)=>res.json(externalPlan(get(req.params.id))));
app.put('/api/projects/:id/external-images',(req,res)=>{const p=editable(req.params.id);p.externalVisual=validateExternalSettings(req.body);res.json(publicProject(save(p)));});
app.get('/api/projects/:id/external-images.zip',(req,res)=>res.type('application/zip').attachment('Whiteboard-External-Images.zip').send(externalZip(get(req.params.id))));
app.post('/api/projects/:id/references',upload.single('image'),async(req,res)=>{
 const p=editable(req.params.id);if(!req.file)throw Error('Chọn ảnh tham chiếu.');
 if((p.externalReferences||[]).length>=8)throw Error('Mỗi dự án tối đa 8 ảnh tham chiếu.');
 const label=String(req.body.label||'Ảnh mẫu').trim().slice(0,120),role=['style','environment'].includes(req.body.role)?req.body.role:'character';
 uploadsInProgress.add(p.id);const file=`reference-${uid()}.png`;
 try {
  const bytes=await sharp(req.file.buffer,{limitInputPixels:40000000,failOn:'error'}).rotate().resize(1536,1536,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
  fs.writeFileSync(path.join(dir(p.id),file),bytes);
  const latest=get(p.id);latest.externalReferences||=[];latest.externalReferences.push({id:uid(),file,label,role});res.json(publicProject(save(latest)));
 }finally{uploadsInProgress.delete(p.id);}
});
app.delete('/api/projects/:id/references/:rid',(req,res)=>{const p=editable(req.params.id),ref=p.externalReferences?.find(r=>r.id===req.params.rid);if(!ref)throw Error('Không tìm thấy ảnh mẫu.');p.externalReferences=p.externalReferences.filter(r=>r.id!==ref.id);save(p);if(path.basename(ref.file)===ref.file)fs.rmSync(path.join(dir(p.id),ref.file),{force:true});res.json(publicProject(p));});
app.delete("/api/projects/:id", (req, res) => {
  const p = editable(req.params.id);
  fs.rmSync(dir(p.id), { recursive: true });
  res.json({ ok: true });
});
app.post("/api/projects", (req, res) => {
  const title = String(req.body.title || "Video của tôi")
      .trim()
      .slice(0, 120),
    text = String(req.body.text || "").trim();
  if(!text){
    const p={id:uid(),title,planningEngine:planningChoice(req.body.planningEngine),titleOnly:true,kind:'text',text:'',cues:[],scenes:[],aspectRatio:'16:9',revision:0,createdAt:new Date().toISOString(),audio:null,job:null,...validateContentSettings(req.body)};
    return res.status(201).json(publicProject(save(p)));
  }
  if (!text || text.length > 30000)
    throw Error("Nhập nội dung từ 1 đến 30.000 ký tự.");
  const isSrt = req.body.kind === "srt" || looksLikeSubtitle(text);
  const seconds = Number(req.body.seconds || 60);
  const scaling = isSrt && req.body.srtTiming === "scale";
  if (
    (!isSrt || scaling) &&
    (!Number.isFinite(seconds) || seconds < (isSrt ? 1 : 3) || seconds > 600)
  )
    throw Error(`Thời lượng cần từ ${isSrt ? 1 : 3} đến 600 giây.`);
  const originalCues = isSrt ? parseSrt(text) : null;
  const cues = isSrt
    ? scaling
      ? scaleSrt(originalCues, Math.round(seconds * 1000))
      : originalCues
    : timedText(text, Math.round(seconds * 1000));
  const requestedCount = req.body.sceneCount
    ? sceneCount(req.body.sceneCount, cues)
    : null;
  const scenes = chunks(cues);
  if (scenes.some((s) => s.durationMs < 1000))
    throw Error("Cảnh ngắn hơn 1 giây; hãy điều chỉnh SRT.");
  const p = {
    id: uid(),
    planningEngine:planningChoice(req.body.planningEngine),
    title,
    text: isSrt ? originalCues.map(c => c.text).join('\n') : text,
    ...(isSrt ? {sourceSubtitle:text} : {}),
    kind: isSrt ? "srt" : "text",
    ...(isSrt
      ? {
          srtTiming: scaling ? "scale" : "original",
          sourceDurationMs: originalCues.at(-1).endMs,
        }
      : {}),
    ...validateContentSettings(req.body),
    style: String(
      req.body.style ||
        "Tranh phác đơn giản, nền giấy kem, nét đen, điểm màu xanh và cam.",
    ).slice(0, 2000),
    cues,
    scenes,
    revision: 0,
    createdAt: new Date().toISOString(),
    audio: null,
    job: null,
  };
  save(p);
  if (requestedCount) enqueue(p.id, "sceneplan", { count: requestedCount });
  res.status(201).json(publicProject(get(p.id)));
});
app.put('/api/projects/:id/script',(req,res)=>{
 const p=editable(req.params.id),draft=scriptDraft(req.body);
 if(req.body.apply){
  const next=parseScript(req.body);
  if(p.scenes.length&&req.body.confirmReplace!==true)throw Error('Xác nhận chia lại để thay các cảnh hiện tại.');
  p.previousScenes={scenes:p.scenes,at:new Date().toISOString()};
  if(p.projectVoice)for(const sc of next.scenes)sc.tts={...p.projectVoice};
  Object.assign(p,next);p.titleOnly=false;delete p.visualProfile;invalidate(p);
 }
 p.scriptDraft=draft;
 if(req.body.title!==undefined){const title=String(req.body.title).trim().slice(0,120);if(!title)throw Error('Tên dự án không được trống.');p.title=title;}
 res.json(publicProject(save(p)));
});
app.put('/api/projects/:id/export-settings',(req,res)=>{
 const p=editable(req.params.id),b=req.body;
 if(!['skeleton','grid'].includes(b.mode)||!['tts','upload','none'].includes(b.audioSource)||!['fit','voice','fixed'].includes(b.speechTiming))throw Error('Thiết lập xuất không hợp lệ.');
 p.exportSettings={mode:b.mode,audioSource:b.audioSource,speechTiming:b.speechTiming,hand:b.hand!==false,subtitles:b.subtitles===true};
 res.json(publicProject(save(p)));
});
app.put('/api/projects/:id/format',async(req,res)=>{
 const p=editable(req.params.id),ratio=validFormat(req.body.aspectRatio),fit=req.body.fit==='cover'?'cover':'contain';
 const position=['centre','north','south','east','west'].includes(req.body.position)?req.body.position:'centre';
 if(ratio===(p.aspectRatio||'16:9')&&fit===(p.imageFit||'contain')&&position===(p.imagePosition||'centre'))return res.json(publicProject(p));
 const next={...p,aspectRatio:ratio,imageFit:fit,imagePosition:position};uploadsInProgress.add(p.id);const created=[];
 try{
  next.scenes=await Promise.all(p.scenes.map(async s=>{
   if(!s.image)return s;
   const file='format-'+uid()+'.png';created.push(path.join(dir(p.id),file));
   // Convert the saved image with an explicit affine fit. Original uploads remain available to reframe without data loss.
   const sourceFile=s.originalImage||s.image,bytes=fs.readFileSync(path.join(dir(p.id),sourceFile)),metadata=await sharp(bytes).metadata();
   await normalizeImage(bytes,path.join(dir(p.id),file),{...canvasOf(next),fit,position,color:s.backgroundMode==='manual'?s.backgroundColor:undefined});
   return {...s,originalImage:sourceFile,image:file,annotation:reframeAnnotation(s.annotation,{width:metadata.width,height:metadata.height},canvasOf(next),fit,position,p.imageFit||'contain',p.imagePosition||'centre'),annotationNeedsReview:true};
  }));
  invalidate(next);res.json(publicProject(save(next)));
 }catch(e){for(const f of created)fs.rmSync(f,{force:true});throw e;}finally{uploadsInProgress.delete(p.id);}
});
app.post("/api/demo", async (req, res) => {
  const p = {
    id: uid(),
    title: "Bản mẫu • Câu chuyện ở vườn thú",
    kind: "text",
    text: "Chú khỉ nhỏ cầm quả chuối. Chú khỉ lớn chạy tới. Các bạn nhỏ đứng xem.",
    style: "Tranh nét nền kem",
    cues: timedText(
      "Chú khỉ nhỏ cầm quả chuối. Chú khỉ lớn chạy tới. Các bạn nhỏ đứng xem.",
      8600,
    ),
    scenes: [
      {
        id: "scene-1",
        title: "Câu chuyện ở vườn thú",
        text: "Chú khỉ nhỏ cầm quả chuối. Chú khỉ lớn chạy tới. Các bạn nhỏ đứng xem.",
        prompt: "Monkeys and children at the zoo",
        startMs: 0,
        durationMs: 8600,
      },
    ],
    revision: 0,
    createdAt: new Date().toISOString(),
    audio: null,
    job: null,
  };
  save(p);
  await uploadImage(
    p.id,
    "scene-1",
    fs.readFileSync(
      path.join(
        config.root,
        "vendor/whiteboard/examples/scene-01-monkey-mountain-banana.png",
      ),
    ),
  );
  res.json(publicProject(get(p.id)));
});
app.put("/api/projects/:id/scenes/:sid", (req, res) => {
  const p = editable(req.params.id),
    s = scene(p, req.params.sid);
  s.title = String(req.body.title ?? s.title).slice(0, 120);
  const nextPrompt = String(req.body.prompt ?? s.prompt).slice(0, 6000);
  if (nextPrompt !== s.prompt) {
    delete s.cast;
    delete s.promptPurposeStale;
  }
  s.prompt = nextPrompt;
  if (req.body.narration !== undefined || req.body.tts !== undefined) {
    const proposed = {
      ...s,
      narration: req.body.narration ?? s.narration,
      tts: req.body.tts ?? s.tts,
    };
    const v = validateSettings(settings(proposed));
    s.narration = v.text;
    s.tts = {
      ...(v.engine?{engine:v.engine,model:v.model,backend:v.backend}:{}),
      voice: v.voice,
      speed: v.speed,
      pauseMs: v.pauseMs,
      style: v.style,
      ...(v.speakerId!==undefined ? {speakerId:v.speakerId} : {}),
    };
    if (!speechCurrent(s)) {
      s.tasks ||= {};
      s.tasks.speech = { status: "stale", error: null };
    }
  }
  if (req.body.annotation) {
    s.annotation = validateAnnotation(req.body.annotation, s.durationMs,canvasOf(p));
    s.annotationSource = "manual";
    s.annotationNeedsReview=false;
  }
  if(req.body.backgroundMode!==undefined){
    if(!['auto','manual'].includes(req.body.backgroundMode))throw Error('Chế độ nền không hợp lệ.');
    if(req.body.backgroundMode==='manual'&&!/^#[0-9a-f]{6}$/i.test(req.body.backgroundColor||''))throw Error('Màu nền cần mã #RRGGBB.');
    s.backgroundMode=req.body.backgroundMode;s.backgroundColor=req.body.backgroundColor;
  }
  invalidate(p);
  res.json(publicProject(save(p)));
});
app.put('/api/projects/:id/scenes/:sid/duration',(req,res)=>{
 const p=editable(req.params.id);changeSceneDuration(p,req.params.sid,req.body.durationMs);invalidate(p);res.json(publicProject(save(p)));
});
app.put("/api/projects/:id/content-settings", (req, res) => {
  const p = editable(req.params.id),
    v = validateContentSettings(req.body);
  if (
    v.contentMode !== (p.contentMode || "story") ||
    v.audience !== (p.audience || "primary")
  ) {
    Object.assign(p, v);
    delete p.visualProfile;
    for (const s of p.scenes) {
      delete s.cast;
      delete s.visualPlan;
      s.promptPurposeStale = true;
      s.imageQuality = { status: "stale" };
      s.tasks ||= {};
      s.tasks.storyboard = { status: "stale", error: null };
    }
    invalidate(p);
  }
  res.json(publicProject(save(p)));
});
app.post('/api/projects/:id/speech-preview',async(req,res)=>{
 if(list().some(p=>busy(p))||voiceJob().status==='running')throw Error('Chờ tác vụ hiện tại hoàn tất trước khi nghe thử.');
 const p=editable(req.params.id),sc=scene(p,req.body.sceneId),file='sample-'+uid()+'.wav';
 const signal=new AbortController(),timer=setTimeout(()=>signal.abort(),110000);
 const disconnect=()=>{if(!res.writableEnded)signal.abort();};res.on('close',disconnect);uploadsInProgress.add(p.id);
 try{
  const text=settings(sc).text.split(/(?<=[.!?。])\s/)[0].slice(0,200);
  await synthesize({...sc,narration:text},path.join(dir(p.id),file),{signal:signal.signal,log:()=>{}});
  const latest=get(p.id);latest.samples=[...(latest.samples||[]),file].slice(-5);save(latest);res.json({file});
 }catch(e){fs.rmSync(path.join(dir(p.id),file),{force:true});throw e;}
 finally{clearTimeout(timer);res.off('close',disconnect);uploadsInProgress.delete(p.id);}
});
app.put("/api/projects/:id/voice-settings", (req, res) => {
  const p = editable(req.params.id);
  if(req.body.voiceOnly!==undefined && typeof req.body.voiceOnly!=='boolean')throw Error('Thiết lập giọng không hợp lệ.');
  applyProjectVoice(p,req.body.tts,{voiceOnly:req.body.voiceOnly===true,installed:(id,engine,backend)=>engine==='vieneu'?!!vieneuStatus().backends?.[backend]:voiceList().some(v=>v.id===id&&v.installed)});
  invalidate(p);
  res.json(publicProject(save(p)));
});
app.post(
  "/api/projects/:id/scenes/:sid/image",
  upload.single("file"),
  async (req, res) => {
    const p = editable(req.params.id);
    scene(p, req.params.sid);
    if (!req.file) throw Error("Chọn một ảnh.");
    uploadsInProgress.add(p.id);
    try {
      res.json(
        publicProject(await uploadImage(p.id, req.params.sid, req.file.buffer)),
      );
    } finally {
      uploadsInProgress.delete(p.id);
    }
  },
);
app.post("/api/projects/:id/audio", upload.single("file"), async (req, res) => {
  const p = editable(req.params.id);
  if (!req.file) throw Error("Chọn file âm thanh.");
  const name = `audio-${uid()}.m4a`,
    raw = path.join(dir(p.id), name + ".upload");
  uploadsInProgress.add(p.id);
  fs.writeFileSync(raw, req.file.buffer);
  try {
    await python(
      ["scripts/media.py", "audio", raw, path.join(dir(p.id), name)],
      { timeout: 180000 },
    );
  } finally {
    fs.rmSync(raw, { force: true });
    uploadsInProgress.delete(p.id);
  }
  update(p.id, (p) => {
    p.audio = name;
    invalidate(p);
  });
  res.json(publicProject(get(p.id)));
});
app.delete("/api/projects/:id/audio", (req, res) => {
  const p = editable(req.params.id);
  p.audio = null;
  invalidate(p);
  res.json(publicProject(save(p)));
});
app.get('/api/puter/requests',(req,res)=>{res.set('Cache-Control','no-store').json(pollPuter(req.query.client));});
app.post('/api/puter/results/:rid',(req,res)=>{res.set('Cache-Control','no-store');if(!resolvePuter(req.body.client,req.params.rid,req.body))return res.status(409).json({error:'Yêu cầu đã kết thúc hoặc không thuộc phiên này.'});res.json({ok:true});});
app.post("/api/projects/:id/jobs", (req, res) => {
  const { type, options = {} } = req.body;
  if (
    ![
      "check",
      "storyboard",
      "annotate",
      "render",
      "speech",
      "sceneplan",
    ].includes(type)
  )
    throw Error("Loại tác vụ không hợp lệ.");
  const p = get(req.params.id);
  if(options.engine!==undefined)planningChoice(options.engine);
  if(options.ai)options.ai={...validatePuter(options.ai),client:String(options.ai.client||'').slice(0,80)};
  if(type==='speech'&&voiceJob().status==='running'&&p.scenes.some(s=>s.tts?.engine==='vieneu'))throw Error('Đang xử lý giọng VieNeu. Hãy chờ hoặc hủy trước.');
  if(type==='speech'&&vieneuInstallation().status==='running'&&p.scenes.some(s=>s.tts?.engine==='vieneu'))throw Error('Đang cài VieNeu. Hãy chờ cài xong trước khi tạo lời đọc.');
  if(!p.scenes.length&&type!=="check")throw Error("Hãy nhập kịch bản ở tab Kịch bản trước.");
  if (uploadsInProgress.has(p.id)) throw Error("Đang xử lý tệp tải lên.");
  if (type === "sceneplan") sceneCount(options.count, p.cues);
  if (
    type === "annotate" ||
    (["storyboard", "speech"].includes(type) && options.sceneId)
  )
    scene(p, options.sceneId);
  res.status(202).json(enqueue(p.id, type, options));
});
app.post("/api/projects/:id/cancel", (req, res) => {
  cancel(req.params.id);
  res.json({ ok: true });
});
app.get("/api/projects/:id/subtitles", (req, res) => {
  const p = speechTimeline(get(req.params.id), {
    audioSource: req.query.audioSource,
    timing: req.query.timing,
  });
  res.type("text/plain").attachment("phu-de.srt").send(srtText(p.cues));
});
// Expose only media, never project manifests, secrets, or arbitrary filesystem paths.
app.get("/media/:id/:file", (req, res) => {
  const p = get(req.params.id),
    file = req.params.file;
  if (
    !p.scenes.some((s) => s.image === file || s.originalImage === file || s.speech?.file === file) &&
    p.audio !== file && !(p.samples||[]).includes(file) && !(p.externalReferences||[]).some(r=>r.file===file)
  )
    return res.sendStatus(404);
  res.sendFile(path.join(dir(p.id), file));
});
app.get("/video/:id/:kind", (req, res) => {
  const p = get(req.params.id),
    v = p[req.params.kind === "preview" ? "preview" : "output"];
  if (!v) return res.sendStatus(404);
  if (req.query.download)
    res.attachment(
      videoFilename(p, v, req.params.kind === "preview"),
    );
  res.sendFile(path.join(dir(p.id), v.file));
});
app.use((err, req, res, next) =>
  res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
    error:
      err.code === "LIMIT_FILE_SIZE"
        ? "Tệp vượt giới hạn upload."
        : safeError(err),
  }),
);
startQueue(workflow);
const server = app.listen(config.port, config.host, () =>
  console.log(`Whiteboard Studio: http://${config.host}:${config.port}`),
);
let closing = false;
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    stopVoiceDownloads();
    stopVieneuInstall();
    cancelVoiceJob();
    server.close();
    for (const p of list()) if (p.job?.status === "running") cancel(p.id);
    setTimeout(() => process.exit(0), 1500).unref();
  });
