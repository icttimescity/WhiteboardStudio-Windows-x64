import fs from 'node:fs';import path from 'node:path';import {config} from './config.js';
const catalog=JSON.parse(fs.readFileSync(path.join(config.root,'assets/vieneu-voices.json'),'utf8'));const presets=catalog.voices;
export const defaultVieneuVoice=catalog.defaultVoice||presets[0].id;
export const voiceHome=()=>path.join(config.data,'vieneu');
export const cloneId=id=>/^wb_clone_[a-f0-9-]{36}$/.test(id);
export function cloneFolder(id){if(!cloneId(id))throw Error('Mã giọng clone không hợp lệ.');return path.join(voiceHome(),'clones',id);}
export function clonedVoices(){
 const base=path.join(voiceHome(),'clones');if(!fs.existsSync(base))return [];
 return fs.readdirSync(base).filter(cloneId).flatMap(id=>{try{const dir=cloneFolder(id),m=JSON.parse(fs.readFileSync(path.join(dir,'metadata.json'),'utf8'));if(m.id!==id||!fs.existsSync(path.join(dir,'voices_v3_turbo.json')))return [];return [{id,label:String(m.label).slice(0,80),description:String(m.description||'').slice(0,500),kind:'clone',engine:'vieneu',revision:m.revision,createdAt:m.createdAt,hasSample:fs.existsSync(path.join(dir,'sample.wav'))}];}catch{return [];}});
}
export function vieneuVoices(ready={}){
 const provided=(ready.voices||[]).filter(v=>!cloneId(v.id)),extra=provided.filter(v=>!presets.some(p=>p.id===v.id||(p.aliases||[]).includes(v.id)));
 return [...presets.map(v=>{const installed=provided.find(p=>p.id===v.id);return {...v,...installed};}),...extra.map(v=>({...v,kind:'preset',engine:'vieneu'})),...clonedVoices()];
}
