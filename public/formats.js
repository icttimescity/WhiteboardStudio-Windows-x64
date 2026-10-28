export const formats={
 '16:9':{label:'Ngang 16:9',width:1280,height:720,output:[1920,1080],preview:[640,360]},
 '9:16':{label:'Dọc 9:16',width:720,height:1280,output:[1080,1920],preview:[360,640]},
 '1:1':{label:'Vuông 1:1',width:960,height:960,output:[1080,1080],preview:[640,640]},
 '4:3':{label:'Ngang 4:3',width:1280,height:960,output:[1440,1080],preview:[640,480]},
 '3:4':{label:'Dọc 3:4',width:960,height:1280,output:[1080,1440],preview:[480,640]},
};
export const formatOf=p=>formats[p?.aspectRatio||'16:9']||formats['16:9'];
export function validFormat(value){if(!formats[value])throw Error('Tỷ lệ khung hình không hợp lệ.');return value;}
export function canvasOf(p){const {width,height}=formatOf(p);return {width,height};}
export function mapAnnotation(a,from,to,fit='contain'){
 if(!a)return null;
 const scale=(fit==='cover'?Math.max:Math.min)(to.width/from.width,to.height/from.height),dx=(to.width-from.width*scale)/2,dy=(to.height-from.height*scale)/2;
 const pt=p=>({x:Math.max(0,Math.min(to.width,Math.round(p.x*scale+dx))),y:Math.max(0,Math.min(to.height,Math.round(p.y*scale+dy)))});
 const rect=r=>{const a=pt(r),b=pt({x:r.x+r.width,y:r.y+r.height});return {...r,x:a.x,y:a.y,width:Math.max(1,b.x-a.x),height:Math.max(1,b.y-a.y),...(r.points?{points:r.points.map(pt)}:{})};};
 return {...a,canvas:to,elements:a.elements.map(e=>({...e,region:rect(e.region),reveal:{...e.reveal,protectedRegions:(e.reveal.protectedRegions||[]).map(rect)}}))};
}
export function placement(source,canvas,fit='contain',position='centre'){
 const scale=(fit==='cover'?Math.max:Math.min)(canvas.width/source.width,canvas.height/source.height);
 const fraction={north:[.5,0],south:[.5,1],west:[0,.5],east:[1,.5],centre:[.5,.5]}[position]||[.5,.5];
 return {scale,x:(canvas.width-source.width*scale)*fraction[0],y:(canvas.height-source.height*scale)*fraction[1]};
}
export function reframeAnnotation(a,source,to,fit='contain',position='centre',oldFit='contain',oldPosition='centre'){
 if(!a)return null;const from=a.canvas,old=placement(source,from,oldFit,oldPosition),next=placement(source,to,fit,position),ratio=next.scale/old.scale;
 const clamp=(n,max)=>Math.max(0,Math.min(max,Math.round(n)));
 const point=p=>({x:clamp((p.x-old.x)*ratio+next.x,to.width),y:clamp((p.y-old.y)*ratio+next.y,to.height)});
 const rect=r=>{
  if(!r.points&&r.x===0&&r.y===0&&r.width===from.width&&r.height===from.height)return {x:0,y:0,...to};
  const first=point(r),last=point({x:r.x+r.width,y:r.y+r.height}),x=Math.min(to.width-1,first.x),y=Math.min(to.height-1,first.y);
  const shape={x,y,width:Math.max(1,last.x-x),height:Math.max(1,last.y-y)};
  if(r.points){const pts=r.points.map(point);const area=Math.abs(pts.reduce((n,p,i)=>{const q=pts[(i+1)%pts.length];return n+p.x*q.y-q.x*p.y;},0))/2;if(area>=25)shape.points=pts;}
  return shape;
 };
 return {...a,canvas:to,elements:a.elements.map(e=>({...e,region:rect(e.region),reveal:{...e.reveal,protectedRegions:(e.reveal.protectedRegions||[]).map(rect)}}))};
}
