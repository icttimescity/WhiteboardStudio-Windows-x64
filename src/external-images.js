import fs from 'node:fs';
import path from 'node:path';
import {dir} from './store.js';
import {vietnameseScenePrompt,negativeVi} from './vietnamese-prompt.js';
import {zipStore} from './zip.js';
export const defaultNegative=negativeVi;
export function validateExternalSettings(body) {
 const text=(k,max)=>{if(typeof body[k]!=='string'||body[k].length>max)throw Error(`Nội dung ${k} không hợp lệ hoặc quá dài.`);return body[k].trim();};
 const tool=text('tool',40);if(!['generic','chatgpt','gemini','midjourney7','midjourney8'].includes(tool))throw Error('Công cụ không hợp lệ.');
 return {tool,style:text('style',6000),characters:text('characters',14000),environment:body.environment===undefined?'':text('environment',10000),negative:text('negative',3000)};
}
function readAsset(p,file) {
 if(!file||path.basename(file)!==file)return null;
 try{return fs.readFileSync(path.join(dir(p.id),file));}catch{return null;}
}
function hasAsset(p,file){try{return !!file&&path.basename(file)===file&&fs.statSync(path.join(dir(p.id),file)).isFile();}catch{return false;}}
export function externalPlan(p) {
 const settings=p.externalVisual||{},profile=p.visualProfile||{characters:[],purpose:p.contentMode||'story',styleGuide:p.style||'Minh họa giáo dục rõ ràng, nét vẽ và màu sắc nhất quán.'};
 const refs=(p.externalReferences||[]).filter(r=>hasAsset(p,r.file)).map((r,i)=>({...r,exportName:`references/ref-${String(i+1).padStart(2,'0')}.png`}));
 const existing=p.scenes.filter(s=>hasAsset(p,s.image)).map(({id,image,title})=>({id,image,title}));
 const workflowNote=settings.tool==='midjourney7'?'Midjourney V7: tải ảnh nhân vật vào Omni Reference và ảnh phong cách vào Style Reference. Đường dẫn ZIP chỉ là tên tệp đính kèm, không phải URL công khai.':settings.tool==='midjourney8'?'Midjourney V8.x: dùng Edit Model Reference, không dùng tham số --oref của V7.':`Dùng ${settings.tool==='gemini'?'Gemini':settings.tool==='chatgpt'?'ChatGPT':'công cụ tạo ảnh'}: đính kèm các ảnh mẫu gốc có nhãn tên, giữ đúng danh tính, chỉ thay hành động và bối cảnh theo cảnh này; giữ phong cách cố định.`;
 const scenes=p.scenes.map((s,i)=>{
  const previous=p.scenes.slice(0,i).filter(sc=>hasAsset(p,sc.image));
  const anchors=i>0&&previous.length?[previous[0],previous.at(-1)].filter((v,n,a)=>a.findIndex(x=>x.id===v.id)===n):[];
  const attachments=[...refs.map(r=>({file:r.exportName,role:r.role,label:r.label})),...anchors.map((sc,n)=>({file:`scene-images/scene-${String(p.scenes.findIndex(x=>x.id===sc.id)+1).padStart(3,'0')}.png`,role:n===0?'identity/style anchor':'continuity',label:sc.title}))];
  const lockedStyle=settings.style||profile.styleGuide||p.style;
  const prompt=vietnameseScenePrompt(p,profile,s,{style:lockedStyle,characters:settings.characters,environment:settings.environment,attachments,index:i+1,workflowNote,negative:settings.negative});
  return {sceneId:s.id,index:i+1,title:s.title,narration:s.text,prompt,referenceFiles:attachments,hasSceneDescription:!!s.prompt?.trim()};
 });
 return {projectId:p.id,title:p.title,tool:settings.tool||'generic',style:settings.style||profile.styleGuide||p.style,environment:settings.environment||(profile.environments||[]).map(e=>`${e.name}: ${e.appearance}`).join('\n\n'),characters:settings.characters||profile.characters.map(c=>`${c.name}: ${c.appearance}`).join('\n\n'),negative:settings.negative||defaultNegative,references:refs,scenes,existing};
}
const guide=`HƯỚNG DẪN TẠO ẢNH ĐỒNG NHẤT BÊN NGOÀI

1. Chốt hồ sơ trong style-and-characters.txt. Giữ nguyên tên/mã nhân vật, mặt/tóc, màu lông, quần áo, tỷ lệ, nét vẽ và bảng màu giữa mọi cảnh. Không đổi mô hình/phong cách giữa chừng.
2. Tạo một ảnh mẫu rõ ràng cho TỪNG nhân vật bằng character-reference-prompts.txt. Mỗi ảnh mẫu chỉ có một nhân vật. Duyệt ảnh mẫu, tải vào mục ảnh tham chiếu của ứng dụng (nhãn tên nhân vật), rồi tải lại gói này.
3. Giữ hồ sơ bối cảnh trong ENVIRONMENTS: kiến trúc, vị trí đồ vật, địa hình, ánh sáng và thời điểm. Tạo và tải ảnh mẫu bối cảnh nếu địa điểm lặp lại; chỉ gắn địa điểm cần cho cảnh hiện tại. Khi tạo cảnh, dán trọn prompt trong scenes/NNN.txt và đính kèm đúng các file referenceFiles trong prompts.json. Luôn dùng lại các ảnh mẫu gốc; ảnh cảnh trước chỉ bổ sung ngữ cảnh, không thay ảnh mẫu gốc.
4. Không chỉ dán chữ nếu công cụ có hỗ trợ ảnh tham chiếu. Bảo toàn số nhân vật của cảnh hiện tại; không mang toàn bộ nhân vật từ ảnh mẫu vào mọi cảnh. Sơ đồ kiến thức có thể cần lặp đồ vật ở các bước, nhãn, số lượng và mũi tên; hãy đối chiếu lời kể.
5. Tạo thử cảnh 1, tải ảnh về và nhập đúng cảnh 1 bằng nút Tải ảnh lên. Xuất lại gói để ảnh đó trở thành ảnh neo cho các cảnh sau. Có thể tải ảnh mẫu riêng để mạnh hơn so với dùng ảnh cảnh 1.
6. Nhập từng ảnh hoàn thành vào đúng cảnh trong Whiteboard Studio. Duyệt khuôn mặt, quần áo, số người, chữ và sơ đồ trước khi xuất video.

CÔNG CỤ
- Công cụ có chỉnh sửa/ảnh tham chiếu: đính kèm cùng bộ mẫu và mô tả đầy đủ, dùng cùng cuộc hội thoại nếu công cụ cho phép. Seed giống nhau (nếu có) không bảo đảm cùng nhân vật.
- ChatGPT: dán toàn bộ prompt tiếng Việt và đính kèm ảnh mẫu đã duyệt; dùng lại hồ sơ cố định và kiểm tra nhân vật, bối cảnh của từng cảnh.\n- Gemini: gán tên rõ ràng cho từng ảnh tham chiếu, yêu cầu giữ đúng chủ thể và thay đổi bối cảnh/hành động. Mẫu gốc giữ nguyên qua mọi cảnh.
- Midjourney V7: đưa ảnh nhân vật vào Omni Reference, ảnh phong cách vào Style Reference. Chỉ 1 ảnh Omni, nên có thể cần ảnh mẫu chung cho nhiều nhân vật; dùng prompt để chỉ rõ ai hiện diện. URL local trong ZIP không phải URL công khai: hãy upload bằng giao diện Midjourney. Không dán đường dẫn máy tính vào --oref/--sref.
- Midjourney V8.x: dùng Edit Model Reference theo phiên bản, không dùng --oref của V7. Kiểm tra hướng dẫn hiện tại của công cụ.

Giữ prompt nhất quán giúp giảm trôi tạo hình; không công cụ nào được gói này bảo đảm giữ đúng 100%. Gói không tự gọi hoặc đăng nhập công cụ bên ngoài.
Nguồn tham khảo (kiểm tra 19/10/2026):
https://deepmind.google/models/gemini-image/prompt-guide/
https://docs.midjourney.com/hc/en-us/articles/36285124473997-Omni-Reference
https://docs.midjourney.com/hc/en-us/articles/32180011136653-Style-Reference
`;
export function externalZip(p) {
 const plan=externalPlan(p),entries=[{name:'README.txt',data:guide},{name:'style-and-characters.txt',data:`${p.title}\n\nPHONG CÁCH\n${plan.style}\n\nNHÂN VẬT\n${plan.characters}\n\nBỐI CẢNH\n${plan.environment}\n\nCẦN TRÁNH\n${plan.negative}`}];
 const characters=p.visualProfile?.characters||[];
 entries.push({name:'character-reference-prompts.txt',data:characters.length?characters.map(c=>`NHÂN VẬT ${c.id} (${c.name})\nTạo MỘT ảnh mẫu toàn thân trên nền đơn giản, tư thế trung tính. Chỉ một nhân vật, không chia khung hay thêm người. Tạo hình: ${c.appearance}. Phong cách cố định: ${plan.style}. Ghi chú cố định: ${plan.characters}. Không hình mờ. Bỏ qua hồ sơ nhân vật khác, chỉ vẽ nhân vật được chỉ định. Đây là ảnh mẫu nhận diện dùng lại, không phải cảnh truyện.`).join('\n\n---\n\n'):`Tạo một ảnh mẫu cho từng nhân vật trong hồ sơ dưới đây. Mỗi lượt chỉ tạo MỘT nhân vật, nền đơn giản, đầy đủ cơ thể, không chữ; giữ phong cách ${plan.style}. Hồ sơ: ${plan.characters||'Chưa có. Hãy nhập hồ sơ thủ công hoặc đề xuất minh họa bằng AI trước.'}`});
 entries.push({name:'environment-reference-prompts.txt',data:(p.visualProfile?.environments||[]).length?(p.visualProfile.environments.map(e=>`LOCATION ${e.id} (${e.name})\nCreate ONE reusable establishing reference for this location. No people or extra locations. Preserve this exact layout and lighting: ${e.appearance}. Locked style: ${plan.style}. User environment notes: ${plan.environment}. No watermark.`).join('\n\n---\n\n')):`Create a reusable environment reference only for the location named in these locked notes: ${plan.environment||'Chưa có ghi chú bối cảnh; hãy bổ sung trong hồ sơ trước.'}. Style: ${plan.style}. No characters, no invented locations, no watermark.`});
 entries.push({name:'prompts.json',data:JSON.stringify({...plan,existing:undefined,references:plan.references.map(({file,...r})=>r)},null,2)});
 for(const scene of plan.scenes)entries.push({name:`scenes/${String(scene.index).padStart(3,'0')}.txt`,data:`${scene.title}\n\nĐÍNH KÈM: ${scene.referenceFiles.map(r=>r.file+' ('+r.label+', '+r.role+')').join('; ')||'Chưa có ảnh tham chiếu. Nên tạo/đính kèm ảnh mẫu trước.'}\n\n${scene.prompt}`});
 for(const r of plan.references)entries.push({name:r.exportName,data:readAsset(p,r.file)});
 for(const s of plan.existing)entries.push({name:`scene-images/scene-${String(p.scenes.findIndex(x=>x.id===s.id)+1).padStart(3,'0')}.png`,data:readAsset(p,s.image)});
 return zipStore(entries);
}
