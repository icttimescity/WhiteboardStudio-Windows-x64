export function polygonArea(points){return Math.abs(points.reduce((n,p,i)=>{const q=points[(i+1)%points.length];return n+p.x*q.y-q.x*p.y;},0))/2;}
export function polygonRegion(points,canvas={width:1280,height:720}){
 if(!Array.isArray(points)||points.length<3||points.length>256||points.some(p=>!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.y<0||p.x>canvas.width||p.y>canvas.height)||polygonArea(points)<25)throw Error('Vùng tự do cần 3–256 điểm, diện tích ít nhất 25 px² và nằm trong ảnh.');
 const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
 return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y,points:points.map(p=>({x:p.x,y:p.y}))};
}
export function transformRegion(r, target){
 return {...target,...(r.points?{points:r.points.map(p=>({x:Math.round(target.x+(p.x-r.x)*target.width/r.width),y:Math.round(target.y+(p.y-r.y)*target.height/r.height)}))}:{})};
}
export function insideRegion(r,p){
 if(!r.points)return p.x>=r.x&&p.y>=r.y&&p.x<=r.x+r.width&&p.y<=r.y+r.height;
 let inside=false;for(let i=0,j=r.points.length-1;i<r.points.length;j=i++){const a=r.points[i],b=r.points[j];if(((a.y>p.y)!==(b.y>p.y))&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;
}
