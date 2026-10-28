import {settings, validateSettings, speechCurrent} from './tts.js';
// Validate every scene first so an invalid request never partially changes a project.
export function applyProjectVoice(p, tts, {voiceOnly=false, installed=()=>true}={}) {
 if(!tts||typeof tts!=='object'||Array.isArray(tts))throw Error('Chọn một giọng đọc hợp lệ.');
 if(voiceOnly&&!installed(tts.voice,tts.engine||"piper",tts.backend||"onnx"))throw Error('Giọng chưa tải trên máy. Hãy tải giọng hoặc làm mới danh sách.');
 const next=p.scenes.map(s=>{
  const proposed=voiceOnly?{...s.tts,voice:tts.voice,engine:tts.engine||"piper",backend:tts.backend||"onnx",speakerId:tts.speakerId??0}:tts;
  const {text,...validated}=validateSettings(settings({...s,tts:proposed}));
  return validated;
 });
 p.scenes.forEach((s,i)=>{
  s.tts=next[i];
  if(!speechCurrent(s)){s.tasks||={};s.tasks.speech={status:'stale',error:null};}
 });
 if(voiceOnly)p.projectVoice={engine:tts.engine||"piper",backend:tts.backend||"onnx",voice:tts.voice,speakerId:next[0]?.speakerId??0};
}
