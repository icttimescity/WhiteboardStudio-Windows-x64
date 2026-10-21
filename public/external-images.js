export function initExternalImages({api,toast,getProject,getScene,setProject,saveProject,locked}) {
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let plan=null,projectId=null;
 $('copyScenePrompt').onclick=()=>task(async()=>{
  if(!getProject())return;
  await saveProject();
  const current=await api(`/api/projects/${getProject().id}/external-images`);
  const row=current.scenes.find(s=>s.sceneId===getScene()?.id);
  if(!row)throw Error('Chọn một cảnh trước khi sao chép prompt.');
  try{await navigator.clipboard.writeText(row.prompt);toast('Đã sao chép prompt đầy đủ: nhân vật, bối cảnh, phong cách và cảnh hiện tại.');}
  catch{$('externalImages').click();toast('Mở Prompt đầy đủ, bấm Sao chép hoặc Ctrl+C.');}
 });
 async function task(fn){try{await fn();}catch(e){toast(e.message,true);}}
 function preview(){const row=plan?.scenes.find(s=>s.sceneId===$('externalScene').value);$('externalPrompt').value=row?.prompt||'';$('externalAttachments').textContent=row?.referenceFiles.length?'Đính kèm: '+row.referenceFiles.map(r=>r.file+' — '+r.label).join('; '):'Chưa có ảnh tham chiếu. Nên tải ảnh mẫu hoặc nhập ảnh cảnh 1 rồi xuất lại gói.';}
 async function refresh(){
  const before=$('externalScene').value;
  plan=await api(`/api/projects/${projectId}/external-images`);
  $('externalScene').innerHTML=plan.scenes.map(s=>`<option value="${esc(s.sceneId)}">${s.index}. ${esc(s.title)}</option>`).join('');
  if(plan.scenes.some(sc=>sc.sceneId===before))$('externalScene').value=before;
  else if(plan.scenes.some(sc=>sc.sceneId===getScene()?.id))$('externalScene').value=getScene().id;preview();
  $('referenceCards').innerHTML=plan.references.map(r=>`<div class="referenceCard"><img alt="${esc(r.label)}" src="/media/${projectId}/${encodeURIComponent(r.file)}"><strong>${esc(r.label)}</strong><small>${r.role==='style'?'Phong cách':r.role==='environment'?'Bối cảnh':'Nhân vật'}</small><button data-reference="${esc(r.id)}">Bỏ ảnh mẫu</button></div>`).join('')||'<p class="hint">Chưa có ảnh mẫu riêng. Có thể tải mẫu nhân vật/phong cách hoặc dùng ảnh cảnh đã duyệt làm neo.</p>';
  $('referenceCards').querySelectorAll('[data-reference]').forEach(b=>b.onclick=()=>task(async()=>{const p=await api(`/api/projects/${projectId}/references/${b.dataset.reference}`,'DELETE');setProject(p);await refresh();}));
 }
 $('externalImages').onclick=()=>task(async()=>{
  if(!getProject())return;
  await saveProject();projectId=getProject().id;$('externalScene').innerHTML='';await refresh();
  $('externalTool').value=plan.tool;$('externalStyle').value=plan.style||'';$('externalCharacters').value=plan.characters||'';$('externalEnvironment').value=plan.environment||'';$('externalNegative').value=plan.negative||'';
  $('externalDialog').showModal();
 });
 async function persist(){
  if(locked())throw Error('Chờ tác vụ hoàn tất trước khi sửa hồ sơ.');
  const p=await api(`/api/projects/${projectId}/external-images`,'PUT',{tool:$('externalTool').value,style:$('externalStyle').value,characters:$('externalCharacters').value,environment:$('externalEnvironment').value,negative:$('externalNegative').value});setProject(p);await refresh();
 }
 $('externalSave').onclick=()=>task(async()=>{await persist();toast('Đã lưu hồ sơ và cập nhật prompt.');});
 $('externalCopy').onclick=()=>task(async()=>{await persist();const text=$('externalPrompt').value;try{await navigator.clipboard.writeText(text);toast('Đã sao chép prompt đầy đủ.');}catch{$('externalPrompt').select();toast('Đã chọn prompt. Nhấn Ctrl+C để sao chép.');}});
 $('externalDownload').onclick=()=>task(async()=>{await persist();if(window.__WHITEBOARD_NATIVE__){const a=document.createElement('a');a.href=`/api/projects/${projectId}/external-images.zip`;a.download='Whiteboard-External-Images.zip';document.body.appendChild(a);a.click();a.remove();return;}const response=await fetch(`/api/projects/${projectId}/external-images.zip`,{signal:AbortSignal.timeout(120000)});if(!response.ok){const e=await response.json();throw Error(e.error||'Không tạo được gói ảnh.');}const blob=await response.blob();const signature=new Uint8Array(await blob.slice(0,4).arrayBuffer());if(signature[0]!==0x50||signature[1]!==0x4b)throw Error('Gói tải về không phải ZIP hợp lệ. Hãy thử lại.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Whiteboard-External-Images.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);});
 $('referenceUpload').onchange=()=>task(async()=>{const file=$('referenceUpload').files[0];if(!file)return;const f=new FormData();f.append('image',file);f.append('label',$('referenceLabel').value||file.name);f.append('role',$('referenceRole').value);$('referenceUpload').disabled=true;try{const p=await api(`/api/projects/${projectId}/references`,'POST',f);setProject(p);$('referenceUpload').value='';await refresh();toast('Đã lưu ảnh mẫu, không gọi AI.');}finally{$('referenceUpload').disabled=false;}});
 $('externalScene').onchange=preview;
 $('externalClose').onclick=()=>$('externalDialog').close();
}
