// Puter owns authentication in the browser. Tokens/passwords never reach the local server.
export function initPuterAI({api,toast,changed,locked}){
 const $=id=>document.getElementById(id),client=crypto.randomUUID();
 let settings={model:'',provider:'',family:'gemini',fallback:true},sdkPromise,models=[],signed=false,fetching=false,lastChoice='local',authBusy=false;
 const running=new Map(),finished=new Set();
 const info=text=>{$('puterStatus').textContent=text;};
 function bounded(promise,ms=20000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Puter quá thời gian tải thông tin. Bấm Làm mới để thử lại.')),ms);})]).finally(()=>clearTimeout(timer));}
 function abortable(promise,signal){
  if(signal.aborted)return Promise.reject(Error('Đã hủy.'));
  let abort;const cancelled=new Promise((_,reject)=>{abort=()=>reject(Error('Đã hủy.'));signal.addEventListener('abort',abort,{once:true});});
  return Promise.race([promise,cancelled]).finally(()=>signal.removeEventListener('abort',abort));
 }
 function paint(){
  const enabled=$('planningEngine').value==='puter';$('puterPanel').hidden=!enabled;
  $('puterFamily').value=settings.family;$('puterFallback').checked=settings.fallback;
  $('puterLogin').disabled=!window.puter||authBusy||locked();$('puterSwitch').disabled=!signed||authBusy||locked();$('puterLogout').disabled=!signed||authBusy||locked();
  $('puterRefresh').disabled=!window.puter||authBusy||locked();$('puterModel').disabled=!signed||locked();$('puterFamily').disabled=locked();$('puterFallback').disabled=locked();
 }
 function loadSDK(){
  if(window.puter)return Promise.resolve(window.puter);if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');script.src='https://js.puter.com/v2/';script.async=true;
   const timer=setTimeout(()=>{script.remove();reject(Error('Không tải được Puter sau 15 giây. Có thể dùng Agnes hoặc code trên máy.'));},15000);
   script.onload=()=>{clearTimeout(timer);window.puter?resolve(window.puter):reject(Error('Puter chưa sẵn sàng.'));};
   script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Không kết nối được Puter.'));};document.head.append(script);
  }).catch(e=>{sdkPromise=null;throw e;});return sdkPromise;
 }
 function modelList(){
  const family=settings.family;
  const list=models.filter(m=>{
   const name=(m.id+' '+(m.name||'')).toLowerCase();
   return (family==='other'||(family==='gemini'?/gemini/.test(name):/gpt|chatgpt|o[134](?:-|$)/.test(name)));
  });
  const select=$('puterModel');select.replaceChildren(new Option('Chọn model để dùng…',''));
  for(const m of list){const option=new Option(`${m.name||m.id} · ${m.provider}`,JSON.stringify([m.id,m.provider]));select.add(option);}
  const value=JSON.stringify([settings.model,settings.provider]);if([...select.options].some(o=>o.value===value))select.value=value;
  else if(settings.model){select.add(new Option(settings.model+' — đã lưu; kiểm tra khả dụng khi gọi',value));select.value=value;}
  $('puterModelCount').textContent=`${list.length} model phù hợp. Giá/hạn mức theo tài khoản Puter; có tên trong danh sách chưa bảo đảm gọi thành công.`;
 }
 async function refresh(){
  if(!window.puter)return; signed=!!window.puter.auth.isSignedIn();
  if(!signed){info('Chưa đăng nhập Puter. Mặc định không mở đăng nhập; khi cần hãy bấm Đăng nhập.');paint();return;}
  const user=await bounded(window.puter.auth.getUser());info(`Puter: ${user.username||'đã đăng nhập'}. Chọn model muốn sử dụng.`);
  const catalog=await bounded(window.puter.ai.listModels());if(!Array.isArray(catalog))throw Error('Danh sách model không hợp lệ.');
  models=catalog.filter(m=>typeof m.id==='string'&&typeof m.provider==='string');modelList();paint();
 }
 async function selected(){
  paint();if($('planningEngine').value!=='puter'){lastChoice=$('planningEngine').value;return;}
  info('Đang tải bộ kết nối Puter, chưa gửi kịch bản hoặc gọi AI...');
  try{await loadSDK();await refresh();}catch(e){info(e.message);}paint();
 }
 function auth(switchAccount=false){
  if(!window.puter||authBusy||locked())return;
  if(!switchAccount&&window.puter.auth.isSignedIn()){void refresh().catch(e=>info(errorOf(e).message));return;}
  // Start synchronously in the actual click handler; no await before opening the popup.
  let promise;try{promise=window.puter.auth.signIn({attempt_temp_user_creation:false,...(switchAccount?{request_auth:true}:{})});}catch(e){info(errorOf(e).message);return;}
  authBusy=true;paint();Promise.resolve(promise).then(refresh).then(()=>changed()).catch(e=>{
   const error=errorOf(e);info(error.message);if(!switchAccount&&!signed){$('planningEngine').value=lastChoice;changed();paint();toast('Chưa đăng nhập. Giữ chế độ trước đó.');}
  }).finally(()=>{authBusy=false;paint();});
 }
 function errorOf(e){
  const code=String(e?.code||e?.error?.code||(typeof e?.error==='string'?e.error:'')||e?.name||'PUTER_ERROR');
  const labels={popup_blocked:'Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép popup và bấm lại.',auth_window_closed:'Đã đóng đăng nhập.',insufficient_funds:'Tài khoản Puter hết hạn mức hoặc số dư.',too_many_requests:'Puter đang giới hạn tốc độ.',AUTH_REQUIRED:'Phiên Puter đã hết hạn. Bấm Đăng nhập để dùng lại.'};
  return {code,message:labels[code]||String(e?.message||e?.msg||e?.error?.message||'Puter không phản hồi hợp lệ.').slice(0,400)};
 }
 async function execute(request){
  const controller=new AbortController();running.set(request.id,controller);let timer;
  try{
   if(!window.puter||!window.puter.auth.isSignedIn())throw {code:'AUTH_REQUIRED'};
   timer=setTimeout(()=>controller.abort(),Math.max(1,request.deadline-Date.now()-500));
   let result;
   for(let attempt=0;attempt<2;attempt++){
    try{
     result=await abortable(window.puter.ai.chat([{role:'system',content:'Bạn là trợ lý thiết kế video giáo dục. Chỉ trả một đối tượng JSON đúng cấu trúc được yêu cầu, không markdown. Giữ nguyên dữ kiện, tiếng Việt và lời kể.'},{role:'user',content:request.media?[{type:'text',text:request.prompt},...(Array.isArray(request.media)?request.media:[request.media]).map(url=>({type:'image_url',image_url:{url}}))]:request.prompt}],{model:request.model,provider:request.provider||undefined,normalize:true,stream:false,max_tokens:request.maxTokens,signal:controller.signal}),controller.signal);break;
    }catch(e){
     if(controller.signal.aborted)throw e;
     if(attempt||!['429','too_many_requests'].includes(errorOf(e).code))throw e;
     await new Promise((resolve,reject)=>{const cancel=()=>{clearTimeout(t);reject(Error('Đã hủy.'));};const t=setTimeout(()=>{controller.signal.removeEventListener('abort',cancel);resolve();},1500);controller.signal.addEventListener('abort',cancel,{once:true});});
    }
   }
   if(['content_filter','safety'].includes(result?.finish_reason))throw {code:'content_filter',message:'Model từ chối nội dung; hãy sửa yêu cầu.'};
   if(result?.finish_reason==='length')throw Error('Phản hồi bị cắt vì quá dài. Hãy giảm nội dung hoặc số cảnh.');
   let text=result?.message?.content;if(Array.isArray(text))text=text.map(b=>b.text||'').join('');
   if(typeof text!=='string'||!text.trim()||text.length>100000)throw Error('Model không trả nội dung văn bản hợp lệ.');
   if(controller.signal.aborted)return;
   await api('/api/puter/results/'+request.id,'POST',{client,text});
  }catch(e){if(!controller.signal.aborted)await api('/api/puter/results/'+request.id,'POST',{client,error:errorOf(e)}).catch(()=>{});}
  finally{clearTimeout(timer);running.delete(request.id);finished.add(request.id);if(finished.size>200)finished.delete(finished.values().next().value);}
 }
 async function poll(){
  if(fetching)return;fetching=true;
  try{
   const pending=await api('/api/puter/requests?client='+client),ids=new Set(pending.map(r=>r.id));
   for(const [id,c] of running)if(!ids.has(id))c.abort();
   for(const request of pending)if(!running.has(request.id)&&!finished.has(request.id))void execute(request);
  }catch{}finally{fetching=false;}
 }
 $('planningEngine').addEventListener('change',()=>void selected());
 $('puterLogin').onclick=()=>auth();$('puterSwitch').onclick=()=>auth(true);
 $('puterLogout').onclick=()=>{if(locked())return;void Promise.resolve(window.puter?.auth.signOut()).then(()=>{signed=false;info('Đã đăng xuất Puter. Tác vụ mới sẽ dùng dự phòng nếu được bật.');paint();}).catch(e=>info(errorOf(e).message));};
 $('puterRefresh').onclick=()=>void refresh().catch(e=>{info(errorOf(e).message);paint();});
 $('puterFamily').onchange=()=>{settings.family=$('puterFamily').value;settings.model='';settings.provider='';modelList();changed();};
 $('puterModel').onchange=()=>{[settings.model,settings.provider]=$('puterModel').value?JSON.parse($('puterModel').value):['',''];changed();};
 $('puterFallback').onchange=()=>{settings.fallback=$('puterFallback').checked;changed();};
 setInterval(()=>{if($('planningEngine').value==='puter'||running.size)void poll();paint();},900);
 return {
  settings:()=>({...settings}),
  hydrate(value){settings={model:'',provider:'',family:'gemini',fallback:true,...value};modelList();if($('planningEngine').value==='puter')void selected();else paint();},
  async options(){
   if($('planningEngine').value!=='puter')return {engine:$('planningEngine').value};
   signed=!!window.puter?.auth.isSignedIn();
   if(!signed||!settings.model){
    if(!settings.fallback)throw Error('Hãy đăng nhập Puter và chọn model, hoặc bật dự phòng.');
    toast('Puter chưa sẵn sàng. Sẽ dùng Agnes hoặc xử lý trên máy.');return {engine:'agnes',ai:{...settings}};
   }
   await poll();return {engine:'puter',ai:{...settings,client}};
  }
 };
}
