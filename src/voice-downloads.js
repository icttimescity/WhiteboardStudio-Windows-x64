import fs from 'node:fs';
import path from 'node:path';
import {ttsPython} from './tts.js';
import {voices,getVoice,rawVoice} from './voice-catalog.js';
import {config,safeError} from './config.js';
import {run} from './process.js';
export const modelsDir=()=>path.resolve(process.env.PIPER_MODELS_DIR||path.join(config.root,'models','piper'));
export function modelInstalled(v) {
 try {
  const onnx=path.join(modelsDir(),v.model+'.onnx'),json=onnx+'.json';
  if(v.id.startsWith('vi_Cake-'))return fs.statSync(onnx).size===77100991&&JSON.parse(fs.readFileSync(json,'utf8')).num_speakers===5;
  const meta=rawVoice(v.id);return ['.onnx','.onnx.json'].every(s=>fs.statSync(path.join(modelsDir(),v.model+s)).size===Object.entries(meta.files).find(([k])=>k.endsWith('/'+v.model+s))[1].size_bytes);
 }catch{return false;}
}
export function createDownloadManager({getVoices,installed,download}) {
 const state=new Map(),queue=[];let active=null;
 function enqueue(id) {
  const v=getVoices().find(v=>v.id===id);if(!v)throw Error('Giọng không hợp lệ.');
  const old=state.get(v.model);if(old&&['queued','running'].includes(old.status))return old;
  if(installed(v))return {voiceId:id,status:'done',message:'Đã lưu trên máy'};
  const job={voiceId:id,model:v.model,status:'queued',message:'Đang chờ tải',sizeBytes:v.sizeBytes};
  state.set(v.model,job);queue.push(job);setImmediate(pump);return job;
 }
 async function pump() {
  if(active)return;const job=queue.shift();if(!job)return;
  const controller=new AbortController();active={job,controller};job.status='running';job.message='Đang kết nối máy chủ tải giọng...';
  try {
   await download(job.voiceId,{signal:controller.signal,onLine:line=>{
    if(job.status!=='running')return;
    if(line.startsWith('PROGRESS ')){try{const p=JSON.parse(line.slice(9));job.received=p.received;job.total=p.total;job.message=`${p.file}: ${(p.received/1048576).toFixed(1)} / ${(p.total/1048576).toFixed(1)} MB`;}catch{} }
    else job.message=line.slice(-300);
   }});
   if(controller.signal.aborted)throw Error('Đã dừng tải.');
   job.status='done';job.message='Đã tải và kiểm tra file trên máy';
  }catch(e){job.status=controller.signal.aborted?'cancelled':'error';job.message=controller.signal.aborted?'Đã dừng; có thể tải tiếp.':safeError(e);
   if(/ENOSPC|No space left|not enough space|disk full|Permission denied|EACCES|Access is denied|URLError|NameResolutionError|getaddrinfo failed|Network is unreachable|timed out|CERTIFICATE_VERIFY_FAILED/i.test(job.message))
    for(const pending of queue.splice(0)){pending.status='cancelled';pending.message='Đã dừng do kết nối/ổ đĩa/quyền ghi. Khắc phục rồi tải tiếp.';}
  }
  finally{active=null;setImmediate(pump);}
 }
 return {
  enqueue,
  list:()=>getVoices().map(v=>({...v,installed:installed(v),download:state.get(v.model)||{status:installed(v)?'done':'missing'}})),
  bulk(ids) {
   const valid=getVoices();if(!Array.isArray(ids)||ids.length>5000||ids.some(id=>!valid.some(v=>v.id===id)))throw Error('Danh sách giọng không hợp lệ.');
   const unique=[...new Map(ids.map(id=>{const v=valid.find(v=>v.id===id);return [v.model,v];})).values()];
   let queued=0,skipped=0,bytes=0;
   for(const v of unique){const old=state.get(v.model);if(installed(v)||['queued','running'].includes(old?.status)){skipped++;continue;}enqueue(v.id);queued++;bytes+=v.sizeBytes;}
   return {queued,skipped,bytes};
  },
  stop(){for(const job of queue.splice(0)){job.status='cancelled';job.message='Đã dừng; có thể tải tiếp.';}if(active){active.job.status='cancelled';active.job.message='Đã dừng; có thể tải tiếp.';active.controller.abort();}},
 };
}
const manager=createDownloadManager({getVoices:()=>voices,installed:modelInstalled,download:(id,ctx)=>run(ttsPython(),['scripts/piper_tts.py','download',id],{...ctx,timeout:1800000})});
export const voiceList=()=>manager.list();
export const downloadVoice=id=>manager.enqueue(id);
export const downloadVoices=ids=>{
 if(!Array.isArray(ids)||ids.some(id=>!getVoice(id)))throw Error('Danh sách giọng không hợp lệ.');
 const needed=[...new Map(ids.map(id=>{const v=getVoice(id);return [v.model,v];})).values()].filter(v=>!modelInstalled(v));
 let free;try{const stat=fs.statfsSync(fs.existsSync(modelsDir())?modelsDir():config.root);free=stat.bavail*stat.bsize;}catch{}
 const bytes=needed.reduce((n,v)=>n+v.sizeBytes,0);
 if(Number.isFinite(free)&&bytes>free)throw Error(`Ổ đĩa còn ${(free/1073741824).toFixed(2)} GB; nhóm giọng cần khoảng ${(bytes/1073741824).toFixed(2)} GB. Chọn nhóm nhỏ hơn hoặc dọn ổ đĩa.`);
 return manager.bulk(ids);
};
export const stopVoiceDownloads=()=>manager.stop();
export function voiceSummary(){
 const list=voiceList(),unique=[...new Map(list.map(v=>[v.model,v])).values()];
 return {voices:list.length,models:unique.length,languages:new Set(list.map(v=>v.language)).size,installed:unique.filter(v=>v.installed).length,queued:unique.filter(v=>v.download.status==='queued').length,running:unique.filter(v=>v.download.status==='running').length,errors:unique.filter(v=>v.download.status==='error').length,totalBytes:unique.reduce((n,v)=>n+v.sizeBytes,0),remainingBytes:unique.filter(v=>!v.installed).reduce((n,v)=>n+v.sizeBytes,0)};
}
