import { speechCurrent } from "./tts.js";
import { list, get, update, uid } from "./store.js";
import { safeError } from "./config.js";
let runner,
  active = null;
const order = [];
let wakeTimer;
let wakeAt = Infinity;
function wakeLater(at = Date.now() + 15000) {
  at = Math.max(Date.now() + 50, at);
  if (wakeTimer && wakeAt <= at) return;
  clearTimeout(wakeTimer);
  wakeAt = at;
  wakeTimer = setTimeout(
    () => {
      wakeTimer = null;
      wakeAt = Infinity;
      setImmediate(pump);
    },
    Math.max(50, at - Date.now()),
  );
  wakeTimer.unref();
}
export function busy(p) {
  return (
    active?.id === p.id ||
    (p.job && ["queued", "running", "waiting"].includes(p.job.status))
  );
}
export function enqueue(id, type, options = {}) {
  if (["image", "images"].includes(type)) throw Error("Đã bỏ tạo ảnh trực tiếp. Hãy tải ảnh từ công cụ bên ngoài.");
  const p = get(id);
  if (busy(p))
    throw Error("Dự án đang có tác vụ. Chờ hoàn tất hoặc hủy trước.");
  options = { ...options };
  if (["storyboard", "image", "images", "speech"].includes(type)) {
    const phase =
      type === "storyboard"
        ? "storyboard"
        : type === "speech"
          ? "speech"
          : "image";
    const previous = p.job;
    const ids =
      options.retryFailed && previous?.sceneIds
        ? previous.sceneIds.filter(
            (id) =>
              p.scenes.find((s) => s.id === id)?.tasks?.[phase]?.status !==
              "done",
          )
        : p.scenes
            .filter((s) =>
              options.sceneId
                ? s.id === options.sceneId
                : phase === "speech"
                  ? !speechCurrent(s)
                  : phase === "image"
                    ? !s.image ||
                      (options.refreshUnverified &&
                        s.imageQuality?.status !== "passed")
                    : !s.prompt?.trim() || s.promptPurposeStale,
            )
            .map((s) => s.id);
    if (!ids.length)
      throw Error("Không có cảnh cần xử lý. Chọn một cảnh để tạo lại riêng.");
    options.sceneIds = ids;
  }
  const job = {
    id: uid(),
    queueVersion: 2,
    type,
    options,
    sceneIds: options.sceneIds,
    status: "queued",
    progress: 0,
    message: "Đang chờ trong hàng đợi",
    logs: [],
    createdAt: new Date().toISOString(),
  };
  update(id, (p) => {
    p.job = job;
    const phase =
      type === "storyboard"
        ? "storyboard"
        : type === "speech"
          ? "speech"
          : "image";
    for (const s of p.scenes.filter((s) => options.sceneIds?.includes(s.id))) {
      s.tasks ||= {};
      s.tasks[phase] = { status: "queued", error: null };
    }
  });
  order.push(id);
  setImmediate(pump);
  return job;
}
export function cancel(id) {
  const p = get(id);
  if (!busy(p)) return;
  update(id, (p) => {
    p.job.status = "cancelled";
    p.job.message = "Đã hủy";
    settlePending(p, "cancelled");
  });
  if (active?.id === id) active.controller.abort();
}
export function startQueue(fn) {
  runner = fn;
  for (const p of list()) {
    if (["image", "images"].includes(p.job?.type) && ["queued", "waiting", "running"].includes(p.job.status)) {
      update(p.id, x => { x.job.status="cancelled"; x.job.message="Đã dừng tác vụ tạo ảnh cũ. Hãy dùng prompt và tải ảnh bên ngoài."; settlePending(x,"cancelled"); });
      continue;
    }
    if (p.job?.status === "running")
      update(p.id, (x) => {
        x.job.status = "interrupted";
        settlePending(x, "interrupted");
        x.job.message =
          "Ứng dụng đã dừng khi đang xử lý. Bấm thử lại để tiếp tục.";
      });
    else if (p.job?.status === "queued") order.push(p.id);
    else if (p.job?.status === "waiting") {
      if (p.job.queueVersion !== 2) {
        update(p.id, (x) => {
          x.job.queueVersion = 2;
          x.job.deferrals = 1;
          x.job.retryAt = Math.min(
            Number.isFinite(x.job.retryAt) ? x.job.retryAt : Date.now(),
            Date.now() + 30000,
          );
          x.job.message =
            "Đã cập nhật hàng đợi cũ. Sẽ kiểm tra phục hồi một lần; không lặp cả chu kỳ chờ.";
        });
      }
      wakeLater(get(p.id).job.retryAt);
    }
  }
  setImmediate(pump);
}
async function pump() {
  if (active || !runner) return;
  for (const p of list().filter((p) => p.job?.status === "waiting")) {
    if (p.job.retryAt <= Date.now()) {
      update(p.id, (x) => {
        x.job.status = "queued";
        x.job.options.resume = true;
      });
      order.push(p.id);
    } else wakeLater(p.job.retryAt);
  }
  const id = order.shift();
  if (!id) return;
  let p;
  try {
    p = get(id);
  } catch {
    setImmediate(pump);
    return;
  }
  if (p.job?.status !== "queued") {
    setImmediate(pump);
    return;
  }
  const controller = new AbortController();
  active = { id, controller };
  const jobId = p.job.id;
  const log = (message, progress) =>
    update(id, (p) => {
      if (p.job.id !== jobId || p.job.status === "cancelled") return;
      message = safeError(message);
      p.job.message = message;
      if (progress !== undefined) p.job.progress = progress;
      p.job.logs.push({ at: new Date().toISOString(), message });
      p.job.logs = p.job.logs.slice(-60);
    });
  update(id, (p) => (p.job.status = "running"));
  try {
    const result = await runner(id, p.job.type, p.job.options, {
      signal: controller.signal,
      retryState: { probe: (p.job.deferrals || 0) > 0 },
      log,
    });
    if (!controller.signal.aborted)
      update(id, (p) => {
        if (result?.deferred) {
          defer(p, result.retryAt);
          return;
        }
        p.job.status = result?.failed ? "partial" : "done";
        p.job.progress = 100;
        p.job.message = result?.notice && !result?.failed ? result.notice : result?.stopped
          ? `Đã dừng gọi API: ${result.error}. Kết quả đã lưu. Bấm thử lại phần lỗi / chưa xong khi kết nối sẵn sàng.`
          : result?.failed
          ? `Có ${result.failed} cảnh lỗi. Các cảnh thành công đã được lưu. Bấm thử lại phần lỗi.`
          : "Hoàn thành";
      });
  } catch (e) {
    if (!controller.signal.aborted)
      update(id, (p) => {
        if (e.retryable) {
          defer(p, e.retryAt);
          return;
        }
        p.job.status = "error";
        p.job.message = safeError(e);
        p.job.logs.push({
          at: new Date().toISOString(),
          message: safeError(e),
        });
      });
  } finally {
    active = null;
    setImmediate(pump);
  }
}

function settlePending(p, status) {
  const phase =
    p.job.type === "storyboard"
      ? "storyboard"
      : p.job.type === "speech"
        ? "speech"
        : "image";
  for (const s of p.scenes) {
    const task = s.tasks?.[phase];
    if (
      p.job.sceneIds?.includes(s.id) &&
      ["queued", "running"].includes(task?.status)
    )
      task.status = status;
  }
}

function defer(p, retryAt) {
  p.job.deferrals = (p.job.deferrals || 0) + 1;
  if (p.job.deferrals > 1) {
    p.job.status = "error";
    p.job.message =
      "Dịch vụ AI vẫn quá tải sau lượt kiểm tra phục hồi. Đã dừng thử tự động; kết quả đã lưu. Thử lại phần chưa xong sau.";
    return;
  }
  p.job.status = "waiting";
  p.job.retryAt = Math.max(Date.now() + 1000, retryAt || 0);
  p.job.message = `Đang chờ dịch vụ AI phục hồi. Tự tiếp tục sau ${new Date(p.job.retryAt).toLocaleTimeString("vi-VN")}. Kết quả đã lưu; có thể Hủy.`;
  p.job.logs.push({ at: new Date().toISOString(), message: p.job.message });
  p.job.logs = p.job.logs.slice(-60);
  wakeLater(p.job.retryAt);
}
