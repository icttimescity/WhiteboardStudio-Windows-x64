import {sceneCount} from './scene-plan.js';import {uid} from './store.js';
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
export function shortTitle(text,index=0){const words=clean(text).split(' ');return `Cảnh ${index+1}: ${words.slice(0,9).join(' ')}${words.length>9?'…':''}`.slice(0,120);}
// No model, network or Python. Every original word is assigned once, in order.
export function localScenes(cues,count){
 count=sceneCount(count,cues);const units=[];
 cues.forEach((cue,ci)=>{const words=clean(cue.text).split(' ');words.forEach((text,i)=>units.push({text,start:cue.startMs+Math.round((cue.endMs-cue.startMs)*i/words.length),cue:ci}));});
 const total=cues.at(-1).endMs,n=units.length,time=i=>i===0?0:i===n?total:units[i].start;
 // Backward feasibility guards ensure the greedy semantic choice leaves room for every later scene.
 const latest=[n];let j=n-1;
 for(let k=1;k<count;k++){while(j>0&&time(latest[k-1])-time(j)<1000)j--;if(j<1)throw Error('Không đủ mốc lời kể để chia số cảnh này. Hãy giảm số cảnh.');latest[k]=j;j--;}
 const cuts=[0];let start=0;
 for(let part=0;part<count-1;part++){
  const remaining=count-part-1,max=latest[remaining],ideal=time(start)+(total-time(start))/(remaining+1),wordsIdeal=(n-start)/(remaining+1);let best=-1,score=Infinity;
  for(let end=start+1;end<=max;end++){
   if(time(end)-time(start)<1000)continue;
   const sentence=/[.!?…][”'"»)]?$/.test(units[end-1].text),cueBreak=units[end].cue!==units[end-1].cue;
   const cost=Math.abs(time(end)-ideal)/Math.max(1000,(total-time(start))/(remaining+1))+.2*Math.abs((end-start)-wordsIdeal)/Math.max(1,wordsIdeal)-(sentence?.35:0)-(cueBreak?.2:0);
   if(cost<score){score=cost;best=end;}
  }
  if(best<0)throw Error('Mốc thời gian quá sát để chia đủ cảnh. Hãy giảm số cảnh hoặc co giãn SRT.');cuts.push(best);start=best;
 }
 cuts.push(n);
 return cuts.slice(0,-1).map((first,i)=>{const end=cuts[i+1],text=units.slice(first,end).map(u=>u.text).join(' ');return {id:uid(),title:shortTitle(text,i),text,startMs:time(first),durationMs:time(end)-time(first),prompt:'',image:null,annotation:null};});
}
export function localProfile(p){
 if(p.visualProfile)return p.visualProfile;
 const characters=String(p.externalVisual?.characters||'').split(/\n+/).map(line=>line.match(/^\s*([^:：]{1,70})[:：]\s*(.+)$/)).filter(Boolean).map((m,i)=>({id:'local-character-'+(i+1),name:m[1].trim(),appearance:m[2].trim(),kind:'individual'}));
 return {purpose:p.contentMode||'story',audience:p.audience||'primary',source:'local',styleGuide:p.externalVisual?.style||p.style||'Minh họa nét đen rõ ràng, màu sắc nhất quán.',characters,environments:[]};
}
export function localStoryboard(p,s){
 const text=clean(s.text);if(!text)throw Error('Cảnh chưa có lời kể.');
 let type='concept';
 if(/bước|đầu tiên|tiếp theo|sau đó|cuối cùng|quy trình/iu.test(text))type='process';
 else if(/so sánh|khác nhau|giống nhau|trước và sau/iu.test(text))type='comparison';
 else if(/nguyên nhân|kết quả|bởi vì|do đó/iu.test(text))type='cause-effect';
 else if(/cấu tạo|bộ phận|cấu trúc/iu.test(text))type='structure';
 else if(/đếm|số lượng|có \d+/iu.test(text))type='counting';
 const forms={concept:'một ví dụ trực quan',process:'sơ đồ các bước theo đúng trình tự',comparison:'bố cục so sánh rõ các trường hợp', 'cause-effect':'sơ đồ nguyên nhân và kết quả',structure:'hình cấu tạo với các bộ phận liên quan',counting:'nhóm đồ vật thể hiện đúng số lượng'};
 const profile=localProfile(p);
 return {title:shortTitle(text,p.scenes.findIndex(x=>x.id===s.id)),prompt:`Minh họa duy nhất nội dung nguyên văn sau:\n“${text}”\n${p.contentMode==='explain'?`Dùng ${forms[type]}. Giữ đúng mọi số liệu, quan hệ và thuật ngữ trong lời kể; không tự thêm kiến thức hoặc số liệu.`:'Chọn một khoảnh khắc chính thể hiện hành động và cảm xúc trong lời kể. Không ghép nhiều thời điểm hoặc thêm người không có trong nội dung.'}\nTỷ lệ ${p.aspectRatio||'16:9'}. Bố cục dễ đọc, đúng hồ sơ phong cách/nhân vật/bối cảnh dùng chung. Nếu lời kể thiếu ngoại hình hoặc địa điểm, không tự khẳng định chi tiết mới; dùng hồ sơ người dùng cung cấp.`,visualPlan:p.contentMode==='explain'?{type,goal:text.slice(0,1000),labels:[]}:null,profile};
}
