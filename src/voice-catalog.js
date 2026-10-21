import fs from 'node:fs';
import path from 'node:path';
import {config} from './config.js';
export const catalogURL='https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json';
export const catalogPath=path.join(config.data,'piper-catalog.json');
const snapshot=path.join(config.root,'assets','piper-voices.json');
export function validateCatalog(data) {
 if(!data||typeof data!=='object'||Array.isArray(data)) throw Error('Catalog Piper không hợp lệ.');
 const entries=Object.entries(data);if(!entries.length||entries.length>5000)throw Error('Số model trong catalog không hợp lệ.');
 for(const [id,v] of entries) {
  if(!/^[\p{L}\p{N}_]+-[\p{L}\p{N}_-]+$/u.test(id)||v.key!==id||!v.language?.code||!v.language?.family||!Number.isInteger(v.num_speakers)||v.num_speakers<1||v.num_speakers>10000)throw Error('Catalog có model không hợp lệ.');
  for(const suffix of ['.onnx','.onnx.json']) {
   const pair=Object.entries(v.files||{}).find(([key])=>key.endsWith('/'+id+suffix));
   if(!pair||!pair[0].split('/').every(p=>/^[\p{L}\p{N}_.-]+$/u.test(p)&&p!=='.'&&p!=='..')||!Number.isSafeInteger(pair[1].size_bytes)||pair[1].size_bytes<1||!/^[a-f0-9]{32}$/i.test(pair[1].md5_digest))throw Error('Catalog thiếu file model/checksum.');
  }
 }
 return data;
}
let raw;try{raw=validateCatalog(JSON.parse(fs.readFileSync(catalogPath,'utf8')));}catch{raw=validateCatalog(JSON.parse(fs.readFileSync(snapshot,'utf8')));}
const names=new Intl.DisplayNames(['vi'],{type:'language'});
const legacy={'vi_VN-vais1000-medium':'Việt — Nữ VAIS1000 (bản cũ)','en_US-lessac-medium':'English (US) — Lessac','en_US-hfc_male-medium':'English (US) — Male HFC'};
export function buildVoices(data) {
 const list=Object.entries(data).map(([id,v])=>({id,model:id,name:v.name,label:legacy[id]||`${names.of(v.language.family)||v.language.name_english} — ${v.name} · ${v.quality} (${v.language.code})`,language:v.language.family,locale:v.language.code,languageName:names.of(v.language.family)||v.language.name_english,nativeName:v.language.name_native,englishName:v.language.name_english,quality:v.quality,numSpeakers:v.num_speakers,speakers:v.speaker_id_map||{},sizeBytes:Object.entries(v.files).filter(([key])=>key.endsWith('.onnx')||key.endsWith('.onnx.json')).reduce((n,[,m])=>n+m.size_bytes,0),licenseURL:'https://huggingface.co/rhasspy/piper-voices/blob/main/'+Object.keys(v.files).find(k=>k.endsWith('/'+id+'.onnx')).replace(/[^/]+$/,'MODEL_CARD')}));
 list.push(...[['vi_Cake-male','Việt — Nam Quang Huy',2],['vi_Cake-female','Việt — Nữ Ngọc Lan',0]].map(([id,label,speaker])=>({id,label,model:'vi_VN-csa-voice-piper-v3-medium',name:label,language:'vi',locale:'vi_VN',languageName:'Tiếng Việt',nativeName:'Tiếng Việt',englishName:'Vietnamese',quality:'medium',numSpeakers:1,fixedSpeaker:speaker,sizeBytes:77106000,licenseURL:'https://huggingface.co/CakeByVPBank/piper-pgl-v4-vi_VN-version39_epoch39'})));
 const priorities=['vi_VN-vais1000-medium','vi_Cake-male','vi_Cake-female','en_US-lessac-medium','en_US-hfc_male-medium'];
 return list.sort((a,b)=>{const ia=priorities.indexOf(a.id),ib=priorities.indexOf(b.id);return ia>=0||ib>=0?(ia<0?999:ia)-(ib<0?999:ib):a.languageName.localeCompare(b.languageName,'vi')||a.locale.localeCompare(b.locale)||a.label.localeCompare(b.label);});
}
export const voices=buildVoices(raw);
export const getVoice=id=>voices.find(v=>v.id===id);
export const rawVoice=id=>raw[id];
let refreshing;
export function refreshCatalog() {
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  const r=await fetch(catalogURL,{signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error(`Không cập nhật được catalog Piper (HTTP ${r.status}). Danh sách cũ vẫn dùng được.`);
  const text=await r.text();if(Buffer.byteLength(text)>8*1024*1024)throw Error('Catalog quá lớn.');
  const next=validateCatalog(JSON.parse(text));
  // Retain known entries so old projects/models continue to work after upstream removals.
  const merged={...raw,...next};const nextVoices=buildVoices(merged);
  fs.mkdirSync(config.data,{recursive:true});fs.writeFileSync(catalogPath+'.tmp',JSON.stringify(merged));fs.renameSync(catalogPath+'.tmp',catalogPath);
  raw=merged;voices.splice(0,voices.length,...nextVoices);
  return {count:voices.length,languages:new Set(voices.map(v=>v.language)).size};
 })().finally(()=>refreshing=null);
 return refreshing;
}
