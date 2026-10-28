import {vieneuVoices,defaultVieneuVoice} from './vieneu-catalog.js';
import fs from 'node:fs';import path from 'node:path';import {config} from './config.js';import {run} from './process.js';
export const vieneuHome=()=>path.join(config.data,'vieneu');
export const vieneuPython=()=>path.join(vieneuHome(),'env',process.platform==='win32'?'Scripts/python.exe':'bin/python');
export function vieneuStatus(){let state={};try{state=JSON.parse(fs.readFileSync(path.join(vieneuHome(),'ready.json'),'utf8'));}catch{}return {installed:fs.existsSync(vieneuPython()),...state,defaultVoice:state.defaultVoice||defaultVieneuVoice,voices:vieneuVoices(state)};}
let installation={status:'idle',message:'Chưa cài VieNeu. Piper vẫn dùng bình thường.'},controller;
export const vieneuInstallation=()=>{const ready=vieneuStatus();return {...installation,...ready,...(installation.status==='idle'&&Object.values(ready.backends||{}).some(Boolean)?{message:'VieNeu '+Object.keys(ready.backends).filter(k=>ready.backends[k]).map(k=>k==='onnx'?'CPU':'GPU').join(' / ')+' đã sẵn sàng offline.'}:{} )};};
export function installVieneu(backend='onnx'){
 if(!['onnx','cuda'].includes(backend))throw Error('Chế độ VieNeu không hợp lệ.');
 if(installation.status==='running')throw Error('VieNeu đang cài đặt.');
 controller=new AbortController();installation={status:'running',backend,message:'Đang chuẩn bị môi trường VieNeu riêng...'};
 run(process.execPath,['scripts/setup-vieneu.mjs',backend],{signal:controller.signal,timeout:3600000,onLine:line=>{installation.message=line.slice(-500);}}).then(()=>{installation.status='done';installation.message='Đã cài và tải bộ giọng VieNeu.';}).catch(e=>{installation.status=controller.signal.aborted?'cancelled':'error';installation.message=e.message;});
 return installation;
}
export const stopVieneuInstall=()=>{controller?.abort();};
// One worker per speech batch keeps the model loaded; queue and cancellation own its lifetime.
export async function withVieneuWorker(ctx,fn,{allowDownloads=false}={}){
 const {spawn}=await import('node:child_process');const readline=await import('node:readline');
 if(!fs.existsSync(vieneuPython()))throw Error('Chưa cài VieNeu. Mở tab Lời đọc và cài bộ CPU/GPU.');
 const child=spawn(vieneuPython(),['-u','scripts/vieneu_worker.py'],{cwd:config.root,windowsHide:true,env:{...process.env,VIENEU_HOME:vieneuHome(),HF_HOME:path.join(vieneuHome(),'models'),HF_HUB_OFFLINE:allowDownloads?'0':'1',TRANSFORMERS_OFFLINE:allowDownloads?'0':'1',PYTHONUTF8:'1',PYTHONNOUSERSITE:'1',PYTHONPATH:''},stdio:['pipe','pipe','pipe']});
 let pending=null,buffer='',closed=false;
 const kill=()=>{if(process.platform==='win32'){spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true});}else child.kill('SIGKILL');};
 const stop=()=>{pending?.reject(Error('Đã hủy tác vụ.'));kill();};ctx.signal?.addEventListener('abort',stop,{once:true});
 const lines=readline.createInterface({input:child.stdout});lines.on('line',line=>{
  if(!line.startsWith('RESULT ')){ctx.log?.(line.slice(-300));return;}
  let result;try{result=JSON.parse(line.slice(7));}catch{return;}
  if(pending&&result.id===pending.id){result.error?pending.reject(Error(result.error)):pending.resolve(result);pending=null;}
 });
 child.stderr.on('data',b=>{buffer=(buffer+b).slice(-1500);});child.on('error',e=>pending?.reject(e));child.on('close',()=>{closed=true;pending?.reject(Error(buffer||'VieNeu đã dừng.'));});
 let seq=0;
 async function request(spec){
  if(ctx.signal?.aborted)throw Error('Đã hủy tác vụ.');if(closed)throw Error('VieNeu đã dừng.');
  if(pending)throw Error('VieNeu chỉ nhận một cảnh mỗi lần.');
  return new Promise((resolve,reject)=>{
   const id=++seq,timer=setTimeout(()=>{reject(Error('VieNeu quá thời gian 10 phút cho một cảnh.'));kill();},600000);
   pending={id,resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}};
   child.stdin.write(JSON.stringify({...spec,id})+'\n',e=>{if(e)pending?.reject(e);});
  });
 }
 try{return await fn(request);}finally{ctx.signal?.removeEventListener('abort',stop);lines.close();child.stdin.end();if(!closed)kill();}
}
let hardwarePromise;
export function vieneuHardware(){
 if(!hardwarePromise)hardwarePromise=run('nvidia-smi',['--query-gpu=name,memory.total,driver_version','--format=csv,noheader,nounits'],{timeout:5000}).then(raw=>({nvidia:raw.trim().split('\n').filter(Boolean).map(line=>{const [name,memory,driver]=line.split(',').map(x=>x.trim());return {name,memoryMB:Number(memory),driver};})})).catch(()=>({nvidia:[]}));
 return hardwarePromise;
}
