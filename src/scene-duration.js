export function changeSceneDuration(p, id, durationMs) {
 const index=p.scenes.findIndex(s=>s.id===id);if(index<0)throw Error('Không tìm thấy cảnh.');
 const s=p.scenes[index], old=s.durationMs, start=s.startMs, end=start+old, delta=durationMs-old;
 const elements=s.annotation?.elements||[],min=Math.max(1000,elements.length*100+600);
 if(!Number.isInteger(durationMs)||durationMs<min)throw Error(`Cảnh cần dài ít nhất ${min/1000} giây để đủ thời gian vẽ.`);
 if(p.scenes.at(-1).startMs+p.scenes.at(-1).durationMs+delta>600000)throw Error('Video tối đa 10 phút.');
 const map=t=>t<=start?t:t>=end?t+delta:Math.round(start+(t-start)*durationMs/old);
 p.cues=p.cues.map(c=>({...c,startMs:map(c.startMs),endMs:map(c.endMs)}));
 for(const later of p.scenes.slice(index+1))later.startMs+=delta;
 s.durationMs=durationMs;
 if(elements.length){
  const weights=elements.reduce((n,e)=>n+e.reveal.durationMs,0),available=durationMs-600-elements.length*100;let cursor=100;
  elements.forEach((e,i)=>{e.reveal.startMs=cursor;e.reveal.durationMs=i===elements.length-1?durationMs-500-cursor:100+Math.floor(available*e.reveal.durationMs/weights);cursor+=e.reveal.durationMs;});
  s.annotation.sceneDurationMs=durationMs;
 }
 p.sceneTimingEdited=true;return p;
}
