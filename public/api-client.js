export function createApiClient(fetcher = (...args) => fetch(...args), timeoutMs = 15000) {
  return async function api(url, method = 'GET', body) {
    const form = body instanceof FormData;
    const controller = new AbortController();
    let rejectTimeout;
    const timeout = new Promise((_,reject) => {rejectTimeout=reject;});
    const timer = setTimeout(()=>{
      controller.abort();
      rejectTimeout(Error(method === 'GET'
        ? 'Chưa cập nhật được trạng thái từ ứng dụng. Đang thử kết nối lại; tác vụ có thể vẫn đang chạy.'
        : 'Chưa nhận được xác nhận từ ứng dụng. Hãy kiểm tra trạng thái trước khi bấm lại để tránh tạo hai tác vụ.'));
    },method==='GET'?timeoutMs:Math.max(timeoutMs,120000));
    try {
      return await Promise.race([(async()=>{
        const r = await fetcher(url,{method,headers:form?{}:body?{'Content-Type':'application/json'}:{},
          body:form?body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store'});
        let d;
        try { d=await r.json(); } catch { throw Error(`Ứng dụng trả dữ liệu không đọc được (HTTP ${r.status}). Kiểm tra trạng thái trước khi thử lại.`); }
        if (!r.ok) throw Error(d?.error || `Yêu cầu thất bại (HTTP ${r.status})`);
        return d;
      })(),timeout]);
    } finally {clearTimeout(timer);controller.abort();}
  };
}
