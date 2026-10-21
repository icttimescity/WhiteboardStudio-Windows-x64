// One deadline covers connection, response headers AND body. Always detach
// listeners/timers so a completed request cannot abort a later operation.
export class AgnesRequestError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.name = 'AgnesRequestError';
    this.code = code;
    this.transport = true;
    this.stopBatch = true;
    Object.assign(this, extra);
  }
}
export async function httpAttempt({fetch, url, body, key, signal, timeoutMs,
  label, log, maxBytes, heartbeatMs = 10000}) {
  const controller = new AbortController();
  const started = Date.now();
  let timer, heartbeat, phase = 'chờ máy chủ phản hồi', received = 0;
  let rejectAbort;
  const cancelled = () => new AgnesRequestError('Đã hủy tác vụ.', 'CANCELLED');
  const abort = () => {
    controller.abort();
    rejectAbort?.(cancelled());
  };
  const interrupted = new Promise((_, reject) => { rejectAbort = reject; });
  signal?.addEventListener('abort', abort, {once:true});
  const run = async () => {
    if (signal?.aborted) throw cancelled();
    const res = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
      body:JSON.stringify(body),signal:controller.signal});
    if (controller.signal.aborted) throw cancelled();
    phase = `đang nhận dữ liệu HTTP ${res.status}`;
    log?.(`${label}: đã nhận HTTP ${res.status}; đang đọc dữ liệu...`);
    const length = Number(res.headers?.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes)
      throw new AgnesRequestError('Phản hồi Agnes vượt giới hạn dung lượng. Kết quả cũ đã giữ; thử riêng cảnh này.', 'RESPONSE_TOO_LARGE');
    let raw;
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      const parts = [];
      const stopReader = () => { reader.cancel().catch(()=>{}); };
      controller.signal.addEventListener('abort',stopReader,{once:true});
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          received += part.value.byteLength;
          if (received > maxBytes) throw new AgnesRequestError('Phản hồi Agnes vượt giới hạn dung lượng.', 'RESPONSE_TOO_LARGE');
          parts.push(Buffer.from(part.value));
        }
        if (controller.signal.aborted) throw cancelled();
      } finally {
        controller.signal.removeEventListener('abort',stopReader);
        if (controller.signal.aborted || received > maxBytes) reader.cancel().catch(()=>{});
        reader.releaseLock();
      }
      raw = Buffer.concat(parts).toString('utf8');
    } else {
      raw = await res.text();
      if (Buffer.byteLength(raw) > maxBytes) throw new AgnesRequestError('Phản hồi Agnes vượt giới hạn dung lượng.', 'RESPONSE_TOO_LARGE');
    }
    return {res,raw,elapsedMs:Date.now()-started};
  };
  try {
    timer = setTimeout(() => {
      controller.abort();
      rejectAbort(new AgnesRequestError(`${label}: quá thời gian ${Math.ceil(timeoutMs/1000)} giây (${phase}). Đã dừng lượt chờ; kết quả đã lưu.`, 'TIMEOUT'));
    },timeoutMs);
    heartbeat = setInterval(() => {
      try { log?.(`${label}: ${phase}; đã chờ ${Math.floor((Date.now()-started)/1000)} giây, giới hạn ${Math.ceil(timeoutMs/1000)} giây${received ? `; đã nhận ${Math.ceil(received/1024)} KB` : ''}. Có thể bấm Hủy.`); }
      catch { /* Heartbeats must not break the request. */ }
    },heartbeatMs);
    // Race also releases the caller if an injected transport ignores AbortSignal.
    return await Promise.race([run(),interrupted]);
  } finally {
    clearTimeout(timer);clearInterval(heartbeat);
    signal?.removeEventListener('abort',abort);
    controller.abort();
  }
}

// Include DNS lookups and image downloads in the same cancellation deadline.
export function abortable(task, signal) {
  if (signal.aborted) return Promise.reject(signal.reason || Error('Đã hủy.'));
  let abort;
  const stopped = new Promise((_,reject)=> {
    abort = () => reject(signal.reason || Error('Đã hủy.'));
    signal.addEventListener('abort',abort,{once:true});
  });
  return Promise.race([Promise.resolve().then(task),stopped]).finally(()=>signal.removeEventListener('abort',abort));
}
