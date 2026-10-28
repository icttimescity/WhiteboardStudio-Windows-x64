import {validatePuter} from './puter-bridge.js';
import {parseSrt,scaleSrt,timedText,chunks} from './domain.js';
import {looksLikeSubtitle} from '../public/srt-timing.js';
import {validateContentSettings} from './content-purpose.js';
export function planningChoice(value){if(value===undefined)return 'local';if(!['local','agnes','puter'].includes(value))throw Error('Cơ chế xử lý không hợp lệ.');return value;}
export function parseScript(body){
 const text=String(body.text||'').trim();if(!text||text.length>30000)throw Error('Nhập kịch bản từ 1–30.000 ký tự.');
 const kind=body.kind==='srt'||looksLikeSubtitle(text)?'srt':'text',seconds=Number(body.seconds||60),scaling=kind==='srt'&&body.srtTiming==='scale';
 if((kind==='text'||scaling)&&(!Number.isFinite(seconds)||seconds<(kind==='srt'?1:3)||seconds>600))throw Error('Thời lượng cần từ 3–600 giây (SRT co giãn từ 1 giây).');
 const source=kind==='srt'?parseSrt(text):null;
 const cues=source?(scaling?scaleSrt(source,Math.round(seconds*1000)):source):timedText(text,Math.round(seconds*1000));
 if(cues.at(-1).endMs>600000)throw Error('Video tối đa 10 phút.');
 const scenes=chunks(cues);if(scenes.some(s=>s.durationMs<1000))throw Error('Cảnh cần dài ít nhất 1 giây.');
 return {planningEngine:planningChoice(body.planningEngine),puterSettings:validatePuter(body.puterSettings),...validateContentSettings(body),text:source?source.map(c=>c.text).join('\n'):text,kind,cues,scenes,...(source?{sourceSubtitle:text,sourceDurationMs:source.at(-1).endMs,srtTiming:scaling?'scale':'original'}:{sourceSubtitle:null}),style:String(body.style||'Tranh phác đơn giản, nền giấy kem, nét đen, điểm màu xanh và cam.').slice(0,2000)};
}
export function scriptDraft(body){
 const text=String(body.text||'');if(text.length>30000)throw Error('Kịch bản quá dài.');
 return {planningEngine:planningChoice(body.planningEngine),puterSettings:validatePuter(body.puterSettings),...validateContentSettings(body),text,kind:body.kind==='srt'?'srt':'text',seconds:Number(body.seconds)||60,srtTiming:body.srtTiming==='scale'?'scale':'original',style:String(body.style||'').slice(0,2000)};
}
