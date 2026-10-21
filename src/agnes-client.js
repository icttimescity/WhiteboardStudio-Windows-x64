import { httpAttempt, AgnesRequestError } from "./http-attempt.js";
export { AgnesRequestError } from "./http-attempt.js";
export class AgnesBusyError extends Error {
  constructor(message, status, retryAt) {
    super(message);
    this.name = "AgnesBusyError";
    this.status = status;
    this.retryable = true;
    this.retryAt = retryAt;
  }
}
export function createRequester(o) {
  const now = o.now || Date.now,
    sleep = o.sleep,
    random = o.random || Math.random;
  let tail = Promise.resolve(),
    last = 0;
  const cooldown = { ...(o.initialCooldown || {}) };
  // Old releases could persist 130+ second exponential waits. Normalize once,
  // never move this deadline forward merely because a request checks it.
  for (const kind of Object.keys(cooldown)) {
    if (!Number.isFinite(cooldown[kind])) delete cooldown[kind];
    else if (o.legacyCooldown && cooldown[kind] > now() + 120000)
      cooldown[kind] = now() + 30000;
  }
  if (o.legacyCooldown) o.onCooldown?.(cooldown);
  async function pause(ms, ctx, label) {
    const until = now() + ms;
    while (now() < until) {
      if (ctx.signal?.aborted) throw Error("Đã hủy tác vụ.");
      const left = until - now();
      ctx.log?.(`${label} Chờ ${Math.ceil(left / 1000)} giây; có thể bấm Hủy.`);
      await sleep(Math.min(left, 10000), ctx.signal);
    }
  }
  async function execute(endpoint, body, ctx) {
    if (!o.key) throw new AgnesRequestError("Chưa cấu hình khóa API trong .env.", "CONFIG");
    const image = endpoint === "/images/generations",
      kind = image ? "image" : "text";
    const vision = !image && body.messages?.some(m => Array.isArray(m.content) && m.content.some(x => x.type === "image_url"));
    const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
    const timeoutMs = Math.min(positive(o.timeout, 240000), positive(image ? o.imageTimeout : vision ? o.visionTimeout : o.textTimeout, image ? 180000 : vision ? 120000 : 90000));
    const budgetMs = positive(o.requestBudget, image ? 240000 : vision ? 180000 : 150000);
    const deadline = now() + budgetMs;
    const label = image ? "Tạo ảnh" : vision ? "Kiểm tra ảnh" : "Văn bản / chia cảnh";
    const configured = image ? o.imageRetries : o.retries;
    const retries = ctx.retryState?.probe
      ? 0
      : Math.min(
          image ? 2 : 1,
          Math.max(0, Number.isFinite(configured) ? Math.floor(configured) : 0),
        );
    let waited = 0;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (ctx.signal?.aborted) throw Error("Đã hủy tác vụ.");
      const waitMs = Math.max(
        0,
        last + (image ? o.imageInterval : o.interval) - now(),
        (cooldown[kind] || 0) - now(),
      );
      if (waited + waitMs > 120000 || now() + waitMs >= deadline)
        throw new AgnesRequestError(
          "Agnes yêu cầu chờ quá lâu. Đã dừng thử tự động và giữ kết quả; thử lại phần chưa xong sau.", "WAIT_LIMIT",
        );
      if (waitMs) {
        waited += waitMs;
        await pause(
          waitMs,
          ctx,
          (cooldown[kind] || 0) > now()
            ? "Nghỉ sau phản hồi quá tải từ Agnes."
            : "Giãn cách lượt gửi Agnes.",
        );
      }
      if (ctx.signal?.aborted) throw Error("Đã hủy tác vụ.");
      const remaining = deadline - now();
      if (remaining <= 0) throw new AgnesRequestError("Đã hết giới hạn thời gian gọi Agnes. Kết quả đã lưu.", "DEADLINE");
      last = now();
      ctx.log?.(
        `Đang gửi yêu cầu ${image ? "tạo ảnh" : vision ? "kiểm tra ảnh" : "văn bản / chia cảnh"} tới Agnes (${attempt + 1}/${retries + 1}); chờ phản hồi...`,
      );
      let res, raw, elapsedMs;
      try {
        ({res,raw,elapsedMs} = await httpAttempt({
          fetch:o.fetch, url:o.base + endpoint, body, key:o.key,
          signal:ctx.signal, timeoutMs:Math.min(timeoutMs, remaining),
          label:`${label} (${attempt+1}/${retries+1})`, log:ctx.log,
          maxBytes:image ? 64*1024*1024 : 2*1024*1024,
          heartbeatMs:o.heartbeatMs || 10000,
        }));
      } catch (e) {
        if (ctx.signal?.aborted) throw new AgnesRequestError("Đã hủy tác vụ.", "CANCELLED");
        if (e instanceof AgnesRequestError) {
          if (image && e.code === "TIMEOUT") e.message += " Chưa xác định Agnes đã tạo ảnh hay chưa; không tự gửi lại ảnh.";
          throw e;
        }
        // Only text may retry a definite connection error, once and within budget.
        if (!image && attempt < retries) {
          ctx.log?.(`${label}: kết nối bị gián đoạn; sẽ thử lại một lần trong giới hạn thời gian.`);
          cooldown[kind] = now() + Math.min(30000, 3000 * 2 ** attempt);
          o.onCooldown?.(cooldown);
          continue;
        }
        const networkCode = String(e.cause?.code || e.code || "");
        const networkHint = /^[A-Z_]{3,40}$/.test(networkCode) ? ` (${networkCode})` : "";
        throw new AgnesRequestError(
          (image
            ? "Yêu cầu ảnh bị đứt mạng/quá thời gian; chưa xác định Agnes đã xử lý hay chưa. Thử lại riêng cảnh này sau khi kiểm tra mạng."
            : "Không kết nối được Agnes hoặc đường truyền bị ngắt. Đã giữ kết quả, dừng chuỗi gọi để tránh lỗi liên tiếp.") + networkHint,
          "NETWORK");
      }
      let data,
        malformed = false;
      try {
        data = JSON.parse(raw);
      } catch {
        malformed = true;
        data = { error: { message: raw.slice(0, 300) || "Phản hồi trống" } };
      }
      if ((res.ok && malformed) || !data || typeof data !== "object" || Array.isArray(data)) {
        throw new AgnesRequestError(image
          ? "Agnes trả phản hồi ảnh không đọc được; chưa xác định ảnh đã tạo hay chưa. Không tự gửi lại ảnh."
          : `Agnes trả dữ liệu không phải đối tượng JSON (HTTP ${res.status}). Đã dừng; thử lại phần chưa xong.`, "INVALID_RESPONSE");
      }
      if (res.ok && !data.error) {
        ctx.log?.(`${label}: đã nhận và đọc xong dữ liệu trong ${(elapsedMs/1000).toFixed(1)} giây.`);
        if (ctx.retryState) ctx.retryState.probe = false;
        cooldown[kind] = 0;
        o.onCooldown?.(cooldown);
        return data;
      }
      const detail =
        data.error?.message || data.error || data.message || res.statusText;
      const msg = `Agnes (${res.status}): ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
      const transient =
        [429, 502, 503, 504].includes(res.status) ||
        (res.ok &&
          data.error &&
          !(
            typeof detail === "string" &&
            /invalid token|unauthorized|quota|insufficient|invalid model|not found/i.test(
              detail,
            )
          ));
      if (!transient) throw new AgnesRequestError(msg, "HTTP_ERROR", {status:res.status, stopBatch:[401,403,404,408,500].includes(res.status) || /invalid token|unauthorized|quota|insufficient|invalid model|not found/i.test(String(detail))});
      const header = res.headers.get("retry-after");
      const provided = header
        ? Number.isFinite(Number(header))
          ? Number(header) * 1000
          : Date.parse(header) - now()
        : 0;
      const base = image ? 15000 : 5000;
      const ms = Math.max(
        1000,
        Number.isFinite(provided) && provided > 0
          ? provided
          : Math.min(30000, base * 2 ** attempt) * (1 + random() * 0.15),
      );
      cooldown[kind] = now() + Math.ceil(ms);
      if (provided > 120000) {
        o.onCooldown?.(cooldown);
        throw new AgnesRequestError(
          `Agnes yêu cầu nghỉ ${Math.ceil(provided / 1000)} giây theo Retry-After. Đã dừng thử tự động; kết quả đã lưu. Thử lại phần chưa xong sau thời gian này.`, "WAIT_LIMIT",
        );
      }
      o.onCooldown?.(cooldown);
      ctx.log?.(
        `Agnes đang quá tải (${res.status}), lần ${attempt + 1}/${retries + 1}. Giữ nguyên kết quả đã có.`,
      );
      if (attempt === retries)
        throw new AgnesBusyError(msg, res.status, cooldown[kind]);
    }
  }
  return function request(endpoint, body, ctx = {}) {
    if (ctx.signal?.aborted) return Promise.reject(new AgnesRequestError("Đã hủy tác vụ.", "CANCELLED"));
    let cancelled = false, rejectAbort;
    const stopped = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = () => { cancelled = true; rejectAbort(new AgnesRequestError("Đã hủy tác vụ.", "CANCELLED")); };
    ctx.signal?.addEventListener("abort", abort, {once:true});
    const result = tail.catch(() => {}).then(() => {
      if (cancelled) throw new AgnesRequestError("Đã hủy tác vụ.", "CANCELLED");
      return execute(endpoint, body, ctx);
    });
    tail = result.catch(() => {});
    return Promise.race([result,stopped]).finally(() => ctx.signal?.removeEventListener("abort",abort));
  };
}
