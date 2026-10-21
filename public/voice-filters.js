export const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
export function filterVoices(list,{query='',language='',status='',quality=''}={}) {
 const words=fold(query).split(/\s+/).filter(Boolean);
 return list.filter(v=>(!language||v.language===language)&&(!quality||v.quality===quality)&&(!status||(status==='installed'?v.installed:!v.installed))&&words.every(w=>fold([v.id,v.label,v.languageName,v.nativeName,v.englishName,v.locale,v.quality].join(' ')).includes(w)));
}
export const bytesLabel=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(1)+' MB';
export function uniqueSize(list){return [...new Map(list.map(v=>[v.model,v])).values()].reduce((n,v)=>n+v.sizeBytes,0);}
