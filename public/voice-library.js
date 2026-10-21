import {filterVoices,bytesLabel,uniqueSize} from './voice-filters.js';
export function initVoiceLibrary({api,toast,getProject,locked,onSelect,onCatalog}) {
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let all=[],fetching=false;
 const filtered=()=>filterVoices(all,{query:$('voiceSearch').value,language:$('voiceLanguage').value,status:$('voiceStatus').value,quality:$('voiceQuality').value});
 function paint(){
  const list=filtered(),before=$('voiceCards').scrollTop;
  $('voiceResultCount').textContent=`${list.length} / ${all.length} bản giọng · Chưa tải trong bộ lọc: ${bytesLabel(uniqueSize(list.filter(v=>!v.installed)))}`;
  $('downloadFiltered').disabled=!list.some(v=>!v.installed&&!['queued','running'].includes(v.download?.status));
  $('downloadAll').textContent=`Tải tất cả còn thiếu (${bytesLabel(uniqueSize(all.filter(v=>!v.installed)))})`;
  $('downloadAll').disabled=!all.some(v=>!v.installed&&!['queued','running'].includes(v.download?.status));
  const unique=[...new Map(all.map(v=>[v.model,v])).values()];
  $('voiceQueue').textContent=`Đã tải ${unique.filter(v=>v.installed).length}/${unique.length} model · Đang tải ${unique.filter(v=>v.download?.status==='running').length} · Chờ ${unique.filter(v=>v.download?.status==='queued').length} · Lỗi ${unique.filter(v=>v.download?.status==='error').length}`;
  $('voiceCards').innerHTML=list.length?list.map(v=>`<article class="voiceCard"><div><strong>${esc(v.label)}</strong><small>${esc(v.languageName)} · ${esc(v.locale)} · ${esc(v.quality)} · ${bytesLabel(v.sizeBytes)}${v.numSpeakers>1?` · ${v.numSpeakers} người nói`:''}</small><small>${esc(v.download?.status==='error'?v.download.message:v.installed?'Đã lưu trên máy':v.download?.message||'Chưa tải')}</small><a href="${esc(v.licenseURL)}" target="_blank" rel="noopener">Thông tin và giấy phép giọng</a></div><div class="row wrap"><button data-voice="${esc(v.id)}" ${v.installed||['running','queued'].includes(v.download?.status)?'disabled':''}>${v.installed?'Đã tải':v.download?.status==='error'?'Thử lại':v.download?.status==='queued'?'Đang chờ':v.download?.status==='running'?'Đang tải…':'Tải về'}</button><button data-select="${esc(v.id)}" ${!v.installed||!getProject()||locked()?'disabled':''}>Dùng giọng</button></div></article>`).join(''):'<p>Không tìm thấy giọng phù hợp.</p>';
  $('voiceCards').scrollTop=before;
  $('voiceCards').querySelectorAll('[data-voice]').forEach(b=>b.onclick=()=>task(async()=>{b.disabled=true;await api(`/api/voices/${encodeURIComponent(b.dataset.voice)}/download`,'POST',{});await refresh();}));
  $('voiceCards').querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>{onSelect(b.dataset.select);$('voicesDialog').close();});
 }
 async function refresh(){
  if(fetching)return;fetching=true;
  try{all=await api('/api/voices');onCatalog(all);const old=$('voiceLanguage').value;
   const languages=[...new Map(all.map(v=>[v.language,v.languageName])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'vi'));
   $('voiceLanguage').innerHTML='<option value="">Tất cả ngôn ngữ</option>'+languages.map(([id,name])=>`<option value="${esc(id)}">${esc(name)} (${id})</option>`).join('');$('voiceLanguage').value=old;paint();
  }finally{fetching=false;}
 }
 async function task(fn){try{await fn();}catch(e){toast(e.message,true);}}
 for(const id of ['voiceSearch','voiceLanguage','voiceStatus','voiceQuality'])$(id).oninput=paint;
 $('downloadFiltered').onclick=()=>task(async()=>{const r=await api('/api/voices/download-batch','POST',{ids:filtered().map(v=>v.id)});toast(`Đã xếp hàng ${r.queued} model; bỏ qua ${r.skipped} model đã có/đang tải.`);await refresh();});
 $('downloadAll').onclick=()=>task(async()=>{const r=await api('/api/voices/download-batch','POST',{ids:all.map(v=>v.id)});toast(`Đã xếp hàng ${r.queued} model (${bytesLabel(r.bytes)}). Tải lần lượt.`);await refresh();});
 $('stopDownloads').onclick=()=>task(async()=>{await api('/api/voices/stop','POST',{});await refresh();});
 $('refreshVoices').onclick=()=>task(async()=>{const b=$('refreshVoices');b.disabled=true;try{await api('/api/voices/refresh','POST',{});await refresh();toast('Đã cập nhật catalog.');}finally{b.disabled=false;}});
 $('voiceLibrary').onclick=()=>task(async()=>{$('voicesDialog').showModal();await refresh();});
 $('voicesClose').onclick=()=>$('voicesDialog').close();
 setInterval(()=>{if($('voicesDialog').open)task(refresh);},1800);
 return {refresh};
}
