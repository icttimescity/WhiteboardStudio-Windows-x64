import crypto from 'node:crypto';
const requests=new Map(),clients=new Map();
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
export function validatePuter(value={}){
 const {model='',provider='',family='gemini',fallback=true}=value;
 if(typeof model!=='string'||model.length>200||typeof provider!=='string'||provider.length>100||!['gemini','gpt','other'].includes(family)||typeof fallback!=='boolean')throw Error('Thiết lập Puter không hợp lệ.');
 return {model,provider,family,fallback};
}
export function pollPuter(client){
 if(!uuid(client))throw Error('Phiên xử lý không hợp lệ.');
 const now=Date.now();for(const [id,t] of clients)if(now-t>120000)clients.delete(id);
 clients.set(client,now);
 return [...requests.values()].filter(r=>r.client===client).map(r=>({id:r.id,prompt:r.prompt,model:r.model,provider:r.provider,maxTokens:r.maxTokens,deadline:r.deadline,media:r.media}));
}
export function resolvePuter(client,id,result){
 const r=requests.get(id);if(!r||r.client!==client)return false;
 if(result.error){const e=Error('Puter: '+String(result.error.message||'Yêu cầu không thành công.').slice(0,400));e.code=String(result.error.code||'PUTER_ERROR').slice(0,80);e.noFallback=/content_filter|safety|blocked_content|moderation/i.test(e.code);r.finish(e);}
 else if(typeof result.text==='string'&&result.text.length>0&&result.text.length<=100000)r.finish(null,result.text);
 else r.finish(Error('Puter trả nội dung không hợp lệ.'));
 return true;
}
export function requestPuter(prompt,ai,ctx,{timeout=100000,offlineMs=12000,media}={}){
 if(ctx.signal.aborted)return Promise.reject(Error('Đã hủy.'));
 if(!uuid(ai.client)||Date.now()-(clients.get(ai.client)||0)>offlineMs)return Promise.reject(Error('Trang Puter chưa kết nối hoặc đã đóng.'));
 return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),started=Date.now();let settled=false,lastReport=started;
  const finish=(error,text)=>{if(settled)return;settled=true;clearTimeout(timer);clearInterval(heartbeat);ctx.signal.removeEventListener('abort',abort);requests.delete(id);error?reject(error):resolve(text);};
  const abort=()=>finish(Error('Đã hủy.'));
  const timer=setTimeout(()=>finish(Error('Puter quá thời gian chờ; không tự gửi lại để tránh tính phí trùng.')),timeout);
  const heartbeat=setInterval(()=>{if(Date.now()-(clients.get(ai.client)||0)>offlineMs)finish(Error('Mất kết nối với trang đang xử lý Puter.'));else if(Date.now()-lastReport>=5000){lastReport=Date.now();ctx.log?.('Đang chờ Puter · '+Math.floor((lastReport-started)/1000)+' giây; có thể bấm Hủy.');}},Math.min(2000,offlineMs));
  requests.set(id,{id,media,client:ai.client,prompt,model:ai.model,provider:ai.provider,maxTokens:ctx.maxTokens||5000,deadline:Date.now()+timeout,finish});
  ctx.signal.addEventListener('abort',abort,{once:true});
 });
}
