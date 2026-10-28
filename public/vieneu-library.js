export function initVieneuLibrary({api,toast,getProject,locked,onSelect,onChange}){
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase();
 let status={},fetching=false,signature='',lastDone='';
 async function task(fn){try{await fn();}catch(e){toast(e.message,true);}}
 function paint(){
  const backend=$('libraryVieneuBackend').value,ready=status.installed&&status.backends?.[backend],running=status.voiceJob?.status==='running'||status.status==='running';
  $('libraryVieneuState').textContent=`${status.message||''} · ${ready?'Bộ đang chọn đã sẵn sàng':'Cần cài bộ CPU/GPU đang chọn'}`;
  $('libraryVoiceJob').textContent=status.voiceJob?.status==='idle'?'':`${({running:'Đang xử lý',done:'Hoàn thành',error:'Lỗi',cancelled:'Đã hủy'})[status.voiceJob?.status]||''}: ${status.voiceJob?.message||''}`;
  $('libraryVoiceJob').classList.toggle('error',status.voiceJob?.status==='error');
  $('libraryInstallCPU').disabled=running;$('libraryInstallGPU').disabled=running||!status.hardware?.nvidia?.length;$('libraryCancelInstall').disabled=status.status!=='running';
  $('cloneSubmit').disabled=!ready||running;$('libraryCancelJob').disabled=status.voiceJob?.status!=='running';
  $('libraryVieneuBackend').querySelector('[value="cuda"]').disabled=!status.hardware?.nvidia?.length;
  const list=(status.voices||[]).filter(v=>(!$('vieneuKind').value||v.kind===$('vieneuKind').value)&&fold(v.label+' '+v.description).includes(fold($('vieneuSearch').value)));
  $('vieneuResult').textContent=`${list.length} giọng · ${(status.voices||[]).filter(v=>v.kind==='preset').length} giọng có sẵn dùng chung bộ model · ${(status.voices||[]).filter(v=>v.kind==='clone').length} giọng đã clone`;
  const key=JSON.stringify([list,ready,running,!!getProject(),locked()]);if(key!==signature){signature=key;
   $('vieneuCards').innerHTML=list.map(v=>`<article class="voiceCard"><div><strong>${esc(v.label)}</strong><small>${v.kind==='clone'?'Giọng đã clone':'Giọng có sẵn'} · ${ready?'Dùng được trên máy':'Cài bộ VieNeu để dùng'}</small><small>${esc(v.description||'')}</small></div><div class="row wrap"><button data-preview="${esc(v.id)}" ${!ready||running?'disabled':''}>Nghe thử</button><button data-use="${esc(v.id)}" ${!ready||running||!getProject()||locked()?'disabled':''}>Dùng cho cảnh</button>${v.kind==='clone'?`<button data-delete-voice="${esc(v.id)}" class="danger" ${running?'disabled':''}>Xóa giọng</button>`:''}</div></article>`).join('')||'<p>Không tìm thấy giọng.</p>';
   $('vieneuCards').querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{onSelect(b.dataset.use,backend);$('voicesDialog').close();});
   $('vieneuCards').querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>task(async()=>{b.disabled=true;await api(`/api/vieneu/voices/${encodeURIComponent(b.dataset.preview)}/preview`,'POST',{backend,text:$('vieneuPreviewText').value});await refresh();}));
   $('vieneuCards').querySelectorAll('[data-delete-voice]').forEach(b=>b.onclick=()=>task(async()=>{const voice=list.find(v=>v.id===b.dataset.deleteVoice);if(!await confirmDelete(voice))return;await api(`/api/vieneu/voices/${encodeURIComponent(voice.id)}`,'DELETE');signature='';await refresh();await onChange();toast('Đã xóa giọng clone.');}));
  }
  const job=status.voiceJob;
  if(job?.status==='done'&&job.id!==lastDone){lastDone=job.id;if(job.previewId){$('libraryVoicePlayer').src=`/api/vieneu/previews/${job.previewId}`;$('libraryVoicePlayer').hidden=false;$('libraryVoicePlayer').play().catch(()=>{});}else if(job.voiceId){$('libraryVoicePlayer').src=`/api/vieneu/voices/${job.voiceId}/sample`;$('libraryVoicePlayer').hidden=false;onChange().catch(()=>{});}}
 }
 async function refresh(){if(fetching)return;fetching=true;try{status=await api('/api/vieneu');paint();}finally{fetching=false;}}
 function show(){const vi=$('libraryEngine').value==='vieneu';$('libraryPiperPanel').hidden=vi;$('libraryVieneuPanel').hidden=!vi;if(vi)task(refresh);}
 $('libraryEngine').onchange=show;$('voiceLibrary').addEventListener('click',()=>{show();task(refresh);});
 for(const id of ['vieneuSearch','vieneuKind','libraryVieneuBackend'])$(id).oninput=paint;
 for(const [id,backend] of [['libraryInstallCPU','onnx'],['libraryInstallGPU','cuda']])$(id).onclick=()=>task(async()=>{await api('/api/vieneu/install','POST',{backend});await refresh();});
 $('libraryCancelInstall').onclick=()=>task(async()=>{await api('/api/vieneu/cancel','POST',{});await refresh();});
 $('libraryCancelJob').onclick=()=>task(async()=>{await api('/api/vieneu/voice-job/cancel','POST',{});await refresh();});
 $('libraryVieneuRefresh').onclick=()=>task(async()=>{signature='';await refresh();await onChange();});
 $('cloneForm').onsubmit=e=>{e.preventDefault();task(async()=>{
  const file=$('cloneFile').files[0];if(!file)throw Error('Chọn âm thanh mẫu.');
  const data=new FormData();data.append('file',file);data.append('name',$('cloneName').value);data.append('description',$('cloneDescription').value);data.append('start',$('cloneStart').value||'0');data.append('backend',$('libraryVieneuBackend').value);
  $('cloneSubmit').disabled=true;try{await api('/api/vieneu/clone','POST',data);await refresh();}catch(e){paint();throw e;}
 });};
 function confirmDelete(v){return new Promise(resolve=>{const d=$('deleteVieneuDialog');$('deleteVieneuName').textContent=v.label;d.showModal();$('deleteVieneuNo').onclick=()=>{d.close();resolve(false);};$('deleteVieneuYes').onclick=()=>{d.close();resolve(true);};d.oncancel=()=>resolve(false);});}
 setInterval(()=>{if($('voicesDialog').open&&$('libraryEngine').value==='vieneu')task(refresh);},1300);
}
