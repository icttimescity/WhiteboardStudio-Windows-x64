import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {config,safeError} from './config.js';import {run} from './process.js';import {withVieneuWorker,vieneuStatus,vieneuInstallation} from './vieneu-runtime.js';
import {voiceHome,cloneFolder,cloneId} from './vieneu-catalog.js';
let job={status:'idle',message:'Chưa có tác vụ giọng.'},controller;
export const voiceJob=()=>job;
function set(values){job={...job,...values,updatedAt:new Date().toISOString()};}
function available(backend){if(!['onnx','cuda'].includes(backend))throw Error('Chế độ đọc không hợp lệ.');if(vieneuInstallation().status==='running')throw Error('Chờ cài VieNeu xong.');if(!vieneuStatus().backends?.[backend])throw Error('Hãy cài / tải bộ VieNeu '+(backend==='onnx'?'CPU':'GPU')+' trước.');if(job.status==='running')throw Error('Đang xử lý giọng khác. Hãy chờ hoặc hủy.');}
function begin(type,backend,label){available(backend);controller=new AbortController();job={id:crypto.randomUUID(),type,backend,label,status:'running',message:'Đang chuẩn bị...',startedAt:new Date().toISOString()};return controller;}
export function cancelVoiceJob(){controller?.abort();}
export function startClone({buffer,name,description='',backend='onnx',start=0}){
 name=String(name||'').trim();description=String(description).slice(0,500);start=Number(start);
 if(vieneuStatus().voices.some(v=>v.id.toLocaleLowerCase()===name.toLocaleLowerCase()||v.label.toLocaleLowerCase()===name.toLocaleLowerCase()||(v.aliases||[]).some(a=>a.toLocaleLowerCase()===name.toLocaleLowerCase())))throw Error('Tên giọng đã có. Hãy dùng tên khác.');
 if(!name||name.length>80||/[\x00-\x1f]/.test(name))throw Error('Tên giọng cần 1–80 ký tự.');if(!buffer?.length||buffer.length>20*1024*1024)throw Error('Tải âm thanh mẫu không quá 20 MB.');if(!Number.isFinite(start)||start<0||start>600)throw Error('Mốc bắt đầu cần từ 0–600 giây.');
 const control=begin('clone',backend,name),id='wb_clone_'+crypto.randomUUID(),base=path.join(voiceHome(),'clones'),stage=path.join(base,'.pending-'+id),destination=cloneFolder(id);
 const raw=path.join(stage,'source.upload');try{fs.mkdirSync(stage,{recursive:true});fs.writeFileSync(raw,buffer);}catch(e){set({status:'error',message:safeError(e)});fs.rmSync(stage,{recursive:true,force:true});throw e;}
 (async()=>{try{
  set({message:'Chuyển mẫu về WAV mono, lấy tối đa 8 giây từ mốc đã chọn...'});
  await run(config.python,['scripts/media.py','voice-reference',raw,path.join(stage,'reference.wav'),String(start)],{signal:control.signal,timeout:120000});fs.rmSync(raw,{force:true});
  await withVieneuWorker({signal:control.signal,log:message=>set({message})},request=>request({op:'clone',voiceId:id,reference:path.join(stage,'reference.wav'),outputDir:stage,backend,description}),{allowDownloads:true});
  if(control.signal.aborted)throw Error('Đã hủy.');
  const profile=fs.readFileSync(path.join(stage,'voices_v3_turbo.json'));
  const metadata={id,label:name,description,backend,createdAt:new Date().toISOString(),revision:crypto.createHash('sha256').update(profile).digest('hex')};
  fs.writeFileSync(path.join(stage,'metadata.json'),JSON.stringify(metadata,null,2));fs.renameSync(stage,destination);
  set({status:'done',voiceId:id,message:'Đã clone và lưu giọng vào thư viện. Có thể nghe mẫu và dùng cho mọi cảnh.'});
 }catch(e){set({status:control.signal.aborted?'cancelled':'error',message:safeError(e)});}finally{fs.rmSync(stage,{recursive:true,force:true});}})();
 return job;
}
export function startVoicePreview({voice,backend='onnx',text}){
 if(!vieneuStatus().voices.some(v=>v.id===voice))throw Error('Không tìm thấy giọng.');
 text=String(text||'Xin chào các bạn, chúc các bạn một ngày học tập vui vẻ.').trim();if(!text||text.length>500)throw Error('Nội dung nghe thử cần 1–500 ký tự.');
 const control=begin('preview',backend,voice),id=crypto.randomUUID(),folder=path.join(voiceHome(),'previews'),file=path.join(folder,id+'.wav');fs.mkdirSync(folder,{recursive:true});
 (async()=>{try{
  await withVieneuWorker({signal:control.signal,log:message=>set({message})},request=>request({text,voice,backend,output:file,pauseMs:450}));
  if(control.signal.aborted)throw Error('Đã hủy.');set({status:'done',previewId:id,message:'Đã tạo mẫu nghe thử.'});
  for(const old of fs.readdirSync(folder).filter(f=>/^[a-f0-9-]{36}\.wav$/.test(f)).map(f=>({f,t:fs.statSync(path.join(folder,f)).mtimeMs})).sort((a,b)=>b.t-a.t).slice(10))fs.rmSync(path.join(folder,old.f),{force:true});
 }catch(e){fs.rmSync(file,{force:true});set({status:control.signal.aborted?'cancelled':'error',message:safeError(e)});}})();return job;
}
