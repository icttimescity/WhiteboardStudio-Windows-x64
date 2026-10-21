import {sceneGap} from './scene-gap.js';
import crypto from "node:crypto";
import {
  purposeInstruction,
  visualPlan,
} from "./content-purpose.js";
import {
  ensureVisualProfile,
  validateCast,
  noDuplicates,
} from "./visual-consistency.js";
import { sceneCount, sourceUnits, scenesFromRanges } from "./scene-plan.js";
import { synthesize, speechTimeline, speechCurrent } from "./tts.js";
import fs from "node:fs";
import path from "node:path";
import { config, safeError } from "./config.js";
import { get, dir, update, invalidate, uid } from "./store.js";
import { chat } from "./agnes.js";
import { python } from "./process.js";
import { normalizeImage } from "./image.js";
import {
  fallbackAnnotation,
  validateAnnotation,
  timedText,
  srtText,
} from "./domain.js";
const style =
  "Minimal educational hand-drawn whiteboard illustration. Warm flat paper background #F6F1E3, dark clean sketch lines, small accents of red orange blue. 16:9 composition. Large separate objects with generous space and minimal overlaps. No lettering, no labels, no numbers, no watermark. Child-friendly. Consistent simple cartoon people.";
function checked(ctx) {
  if (ctx.signal.aborted) throw Error("Đã hủy.");
}
async function normalize(id, buffer, name, ctx) {
  await normalizeImage(buffer, path.join(dir(id), name), ctx);
}

export async function workflow(id, type, opts, ctx) {
  if (["image", "images"].includes(type)) throw Error("Đã bỏ tạo ảnh trực tiếp. Sao chép prompt đầy đủ và tải ảnh tạo bên ngoài vào cảnh.");
  if (type === "sceneplan") {
    const p = get(id),
      count = sceneCount(opts.count, p.cues),
      units = sourceUnits(p.cues, count);
    ctx.log(`AI đang chia kịch bản thành đúng ${count} cảnh...`, 5);
    const prompt = `Chia toàn bộ nội dung sau thành ĐÚNG ${count} phân cảnh liên tiếp theo ý nghĩa. Mỗi đơn vị có số thứ tự 1-based. Chỉ trả JSON {"ranges":[{"start":1,"end":3,"title":"Tên cảnh tiếng Việt"},...]}. Mỗi đơn vị phải xuất hiện đúng một lần, không bỏ sót, không lặp, không đảo thứ tự. Các range liên tiếp từ 1 đến ${units.length}. Mỗi cảnh ít nhất 1 giây. Đây là các đơn vị nội dung (mốc ms):\n${units.map((u, i) => `${i + 1} [${u.startMs}ms]: ${u.text}`).join("\n")}`;
    let scenes, lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const answer = await chat(
          prompt +
            (lastError
              ? `\nLần trước sai: ${lastError}. Hãy sửa cấu trúc.`
              : ""),
          ctx,
        );
        scenes = scenesFromRanges(p.cues, count, answer.ranges);
        break;
      } catch (e) {
        checked(ctx);
        if (e.transport || e.retryable || /^Agnes \(/.test(e.message)) throw e;
        lastError = safeError(e);
        if (attempt === 1) throw e;
        ctx.log(
          "Kiểm tra số cảnh và nội dung chưa đạt; yêu cầu AI sửa lại...",
          10,
        );
      }
    }
    checked(ctx);
    const ids = scenes.map((s) => s.id);
    update(id, (x) => {
      x.previousScenes = { scenes: x.scenes, at: new Date().toISOString() };
      x.scenes = scenes;
      x.sceneCount = count;
      for (const s of x.scenes)
        s.tasks = { storyboard: { status: "queued", error: null } };
      x.job.type = "storyboard";
      x.job.sceneIds = ids;
      x.job.options = { sceneIds: ids };
      invalidate(x);
    });
    return workflow(id, "storyboard", { sceneIds: ids }, ctx);
  }

  if (
    ["storyboard", "speech"].includes(type) &&
    !opts.single
  ) {
    const phase =
      type === "storyboard"
        ? "storyboard"
        : type === "speech"
          ? "speech"
          : "image";
    const ids =
      opts.sceneIds ||
      get(id)
        .scenes.filter((s) =>
          opts.sceneId
            ? s.id === opts.sceneId
            : phase === "speech"
              ? !speechCurrent(s)
              : phase === "image"
                ? !s.image
                : !s.prompt?.trim() || s.promptPurposeStale,
        )
        .map((s) => s.id);
    const previousErrors = opts.resume
      ? get(id).scenes.filter(
          (s) => ids.includes(s.id) && s.tasks?.[phase]?.status === "error",
        ).length
      : 0;
    let failed = previousErrors;
    let processed = false;
    for (let i = 0; i < ids.length; i++) {
      checked(ctx);
      const sceneId = ids[i];
      if (opts.sceneIds) {
        const status = get(id).scenes.find((s) => s.id === sceneId)?.tasks?.[
          phase
        ]?.status;
        if (status === "done" || (opts.resume && status === "error")) continue;
      }
      const setTask = (status, error = null) =>
        update(id, (p) => {
          const s = p.scenes.find((s) => s.id === sceneId);
          s.tasks ||= {};
          s.tasks[phase] = {
            status,
            error,
            updatedAt: new Date().toISOString(),
          };
        });
      if(phase === "storyboard" && processed) await sceneGap(ctx);
      checked(ctx);
      processed = true;
      setTask("running");
      const sub = {
        ...ctx,
        log: (message) =>
          ctx.log(
            `[${i + 1}/${ids.length}] ${message}`,
            Math.round((i / ids.length) * 100),
          ),
      };
      try {
        await workflow(id, phase, { sceneId, single: true }, sub);
        checked(ctx);
        setTask("done");
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        if (e.retryable) {
          setTask("queued");
          ctx.log(
            "Dịch vụ còn quá tải. Tạm dừng hàng đợi và giữ kết quả để tiếp tục tự động.",
          );
          return {
            deferred: true,
            retryAt: Math.max(Date.now() + 1000, e.retryAt || 0),
          };
        }
        failed++;
        setTask("error", safeError(e));
        if (e.stopBatch) {
          sub.log(`Đã dừng chuỗi gọi: ${safeError(e)}. Giữ các cảnh còn lại để thử lại sau.`);
          return { failed, stopped:true, error:safeError(e) };
        }
        sub.log(`Cảnh lỗi: ${safeError(e)}. Tiếp tục cảnh kế tiếp.`);
      }
    }
    return { failed };
  }
  if (type === "speech") {
    const sc = get(id).scenes.find((s) => s.id === opts.sceneId);
    if (!sc) throw Error("Không tìm thấy cảnh.");
    ctx.log(`Piper đang đọc: ${sc.title}`);
    const file = `speech-${uid()}.wav`;
    const speech = await synthesize(sc, path.join(dir(id), file), ctx);
    checked(ctx);
    update(id, (p) => {
      const s = p.scenes.find((s) => s.id === sc.id);
      s.speech = speech;
      s.tasks ||= {};
      s.tasks.speech = { status: "done", error: null };
      invalidate(p);
    });
    return;
  }
  if (type === "check") {
    ctx.log("Kiểm tra model văn bản...", 10);
    await chat('Trả về {"ok":true}.', {...ctx,maxTokens:128});
    ctx.log(
      "Kết nối AI văn bản hoạt động.",
      100,
    );
    return;
  }
  if (type === "storyboard") {
    const profile = await ensureVisualProfile(id, ctx);
    const p = get(id);
    const targets = p.scenes.filter((s) => s.id === opts.sceneId);
    for (let i = 0; i < targets.length; i++) {
      const sc = targets[i];
      ctx.log(
        `AI đang đề xuất riêng cảnh ${p.scenes.findIndex(s=>s.id===sc.id)+1}/${p.scenes.length}: ${sc.title}...`,
        Math.round((i / p.scenes.length) * 95),
      );
      const prompt = `Chỉ thiết kế MỘT ảnh cho cảnh hiện tại. Giữ nguyên ý nghĩa lời kể. ${purposeInstruction(p)} Đặt title tiếng Việt ngắn và prompt tiếng Việt có dấu, chi tiết để người dùng dán sang ChatGPT hoặc Gemini tạo ảnh. Không tự dịch chữ cần xuất hiện trong ảnh sang tiếng Anh. Chỉ các chủ thể cần thiết, không ép số người. Cùng một nhân vật riêng lẻ chỉ xuất hiện một lần. Chỉ trả một đối tượng JSON đúng dạng {"title":"...","prompt":"...","cast":[{"id":"mã nhân vật trong hồ sơ","count":1}],"visualPlan":{"type":"concept/process/comparison/cause-effect/structure/counting","goal":"Mục tiêu kiến thức của cảnh","labels":[]}}. ${p.contentMode === "explain" ? "visualPlan bắt buộc, type chọn một giá trị; không phải chuỗi chứa dấu /. Nhãn tối đa 6, chỉ lấy thuật ngữ ngắn có trong lời kể." : "visualPlan có thể bỏ qua."} Không chia thêm cảnh. Hồ sơ nhân vật và bối cảnh bất biến: ${JSON.stringify(profile)}. Ghi chú người dùng ưu tiên: ${JSON.stringify(p.externalVisual||{})}. Giữ kiến trúc, vị trí vật thể chính, địa hình, thời điểm và ánh sáng của cùng một địa điểm; chỉ dùng bối cảnh cần cho cảnh hiện tại. Ràng buộc: ${p.contentMode === "explain" ? "Sơ đồ nhiều bước/so sánh được phép khi cần giảng kiến thức; không lặp nhân vật riêng lẻ." : noDuplicates}. Phong cách: ${p.style || style}. Nội dung toàn dự án để tham khảo: ${p.scenes
        .map((s) => s.text)
        .join(" ")
        .slice(0, 12000)}. CẢNH HIỆN TẠI: ${sc.text}`;
      let answer,
        cast,
        plan,
        correction = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        answer = await chat(prompt + correction, {...ctx,maxTokens:3000});
        try {
          if (typeof answer.prompt !== "string" || !answer.prompt.trim())
            throw Error(
              "title và prompt phải là chuỗi; không dùng mảng scenes.",
            );
          cast = validateCast(answer.cast, profile);
          plan = visualPlan(answer.visualPlan, p.contentMode, sc.text);
          break;
        } catch (e) {
          if (attempt === 1) throw e;
          correction = `\nSửa phản hồi riêng cảnh này. Lỗi kiểm tra: ${safeError(e)}. Phản hồi trước: ${JSON.stringify(answer).slice(0, 6000)}`;
          ctx.log(
            "Mô tả cảnh chưa đúng cấu trúc; yêu cầu AI sửa riêng cảnh này...",
          );
        }
      }
      checked(ctx);
      update(id, (p) => {
        const s = p.scenes.find((s) => s.id === sc.id);
        s.cast = cast;
        s.visualPlan = plan;
        delete s.promptPurposeStale;
        s.title = String(answer.title || s.title).slice(0, 120);
        s.prompt = answer.prompt.slice(0, 6000);
        s.tasks ||= {};
        s.tasks.storyboard = { status: "done", error: null };
        invalidate(p);
      });
    }
    return;
  }
  if (type === "annotate") {
    const p = get(id),
      s = p.scenes.find((s) => s.id === opts.sceneId);
    if (!s?.image) throw Error("Cảnh chưa có ảnh.");
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
    const url =
      process.env.AGNES_VISION_INPUT === "url"
        ? base
          ? `${base}/media/${id}/${s.image}`
          : null
        : "data:image/png;base64," +
          fs.readFileSync(path.join(dir(id), s.image)).toString("base64");
    if (!url)
      throw Error(
        "Chế độ vision URL cần PUBLIC_BASE_URL. Để chạy local, dùng AGNES_VISION_INPUT=data_uri.",
      );
    ctx.log("Agnes đang xem ảnh và đề xuất các vùng vẽ...", 20);
    const data = await chat(
      `Look at this actual image. Return JSON {"elements":[{"label":"Vietnamese object name","subtitle":"related Vietnamese narration","region":{"x":0,"y":0,"width":100,"height":100}}]}. Find 2–6 distinct visible objects in ${p.contentMode === "explain" ? "LEARNING order: introduce parts, show relationships, then process steps or comparison. Include meaningful arrows/labels with their related diagram parts" : "NARRATIVE order, not arbitrary left to right"}. Bounds must be in normalized integer coordinates 0–1000 for both axes. No invented objects. Keep bounding boxes tight, avoid overlaps. Narration: ${s.text}`,
      ctx,
      url,
    );
    if (
      !Array.isArray(data.elements) ||
      !data.elements.length ||
      data.elements.length > 10
    )
      throw Error(
        "AI chưa trả các vùng hợp lệ. Hãy thử lại hoặc chỉnh thủ công.",
      );
    // A small background pass covers all pixels not claimed by later object regions.
    const objs = data.elements.map((e, i) => {
      const r = e.region;
      if (
        !r ||
        !["x", "y", "width", "height"].every((k) => Number.isFinite(r[k])) ||
        r.x < 0 ||
        r.y < 0 ||
        r.width <= 0 ||
        r.height <= 0 ||
        r.x + r.width > 1000 ||
        r.y + r.height > 1000
      )
        throw Error("Tọa độ AI không hợp lệ.");
      return {
        id: `object-${i}`,
        label: String(e.label || `Vùng ${i + 1}`),
        subtitle: String(e.subtitle || ""),
        region: {
          x: Math.round(r.x * 1.28),
          y: Math.round(r.y * 0.72),
          width: Math.max(
            1,
            Math.min(1280 - Math.round(r.x * 1.28), Math.round(r.width * 1.28)),
          ),
          height: Math.max(
            1,
            Math.min(720 - Math.round(r.y * 0.72), Math.round(r.height * 0.72)),
          ),
        },
      };
    });
    const all = [
      {
        id: "background",
        label: "Nền và nét phụ",
        subtitle: "",
        region: { x: 0, y: 0, width: 1280, height: 720 },
      },
      ...objs,
    ];
    const available = s.durationMs - 600;
    if (available < all.length * 100)
      throw Error("Cảnh quá ngắn để chia nhiều vùng.");
    let t = 100;
    all.forEach((e, i) => {
      const durationMs =
        i === all.length - 1
          ? s.durationMs - 500 - t
          : Math.floor(available / all.length);
      e.sequence = i + 1;
      e.reveal = { startMs: t, durationMs, protectedRegions: [] };
      t += durationMs;
    });
    const annotation = validateAnnotation(
      { canvas: { width: 1280, height: 720 }, elements: all },
      s.durationMs,
    );
    checked(ctx);
    update(id, (p) => {
      const sc = p.scenes.find((x) => x.id === s.id);
      sc.annotation = annotation;
      sc.annotationSource = "ai";
      invalidate(p);
    });
    return;
  }
  if (type === "render") {
    const p = speechTimeline(get(id), opts);
    for (const s of p.scenes) {
      if (!s.image) throw Error(`Thiếu ảnh: ${s.title}.`);
      s.annotation = validateAnnotation(s.annotation, s.durationMs);
    }
    const jobName = `render-${uid()}`,
      work = path.join(dir(id), jobName);
    fs.mkdirSync(work);
    const manifest = {
      project: p,
      output: path.join(work, "video.mp4"),
      width: opts.preview ? 640 : 1920,
      height: opts.preview ? 360 : 1080,
      fps: opts.preview ? 15 : 30,
      subtitles: opts.subtitles === true,
      hand: opts.hand !== false,
      mode: opts.mode === "grid" ? "grid" : "skeleton",
      projectDir: dir(id),
    };
    fs.writeFileSync(
      path.join(work, "manifest.json"),
      JSON.stringify(manifest),
    );
    ctx.log("Đang chuẩn bị render...", 1);
    await python(
      ["scripts/media.py", "render", path.join(work, "manifest.json")],
      {
        ...ctx,
        onLine: (line) => {
          if (line.startsWith("PROGRESS ")) {
            try {
              const d = JSON.parse(line.slice(9));
              ctx.log(d.message, d.percent);
            } catch {}
          }
        },
      },
    );
    checked(ctx);
    update(id, (x) => {
      x[opts.preview ? "preview" : "output"] = {
        file: `${jobName}/video.mp4`,
        createdAt: new Date().toISOString(),
        revision: p.revision,
        width: manifest.width,
        height: manifest.height,
      };
    });
    return;
  }
  throw Error("Tác vụ không được hỗ trợ.");
}
export async function uploadImage(id, sceneId, buffer, ctx = {}) {
  const name = `${sceneId}-${uid()}.png`;
  await normalize(id, buffer, name, ctx);
  return update(id, (p) => {
    const s = p.scenes.find((x) => x.id === sceneId);
    s.image = name;
    s.imageQuality = { status: "uploaded" };
    s.imageReferences = [];
    s.remoteUrl = null;
    s.annotation = fallbackAnnotation(s);
    s.annotationSource = "full-image";
    invalidate(p);
  });
}
