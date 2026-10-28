"""Detect visual ink components locally; no image understanding/model/API required."""
import sys,json,pathlib
import cv2,numpy as np
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'vendor/whiteboard/scripts'))
from source_background import background_rgb
src,out,w,h,duration=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5])
raw=cv2.imdecode(np.fromfile(src,np.uint8),cv2.IMREAD_COLOR)
if raw is None:raise ValueError('Không đọc được ảnh.')
image=cv2.resize(raw,(w,h));bg=np.array(background_rgb(image[:,:,::-1])[::-1],np.int16)
mask=(np.max(np.abs(image.astype(np.int16)-bg),axis=2)>35).astype(np.uint8)*255
radius=max(3,round(min(w,h)/90));kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(radius*2+1,radius*2+1))
mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,kernel)
contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
items=[]
for c in contours:
 x,y,bw,bh=cv2.boundingRect(c)
 if bw*bh<max(100,w*h*.0008):continue
 items.append((x,y,bw,bh))
items=sorted(sorted(items,key=lambda r:r[2]*r[3],reverse=True)[:min(8,max(1,(duration-600)//100))],key=lambda r:(r[1]//max(1,h//4),r[0]))
if not items:items=[(0,0,w,h)]
# Preserve all details via a first pass for ink not included in the detected groups.
regions=[(0,0,w,h)]+items if len(items)>1 or items[0]!=(0,0,w,h) else items
while len(regions)*100>duration-600:regions.pop()
end=100;elements=[]
for i,(x,y,bw,bh) in enumerate(regions):
 ms=(duration-600)//len(regions) if i<len(regions)-1 else duration-500-end
 elements.append({'id':f'local-{i+1}','label':'Nét phụ ngoài các vùng' if i==0 and len(regions)>1 else f'Nhóm nét {i+1}','region':{'x':x,'y':y,'width':bw,'height':bh},'reveal':{'startMs':end,'durationMs':ms,'protectedRegions':[]}});end+=ms
pathlib.Path(out).write_text(json.dumps({'canvas':{'width':w,'height':h},'elements':elements},ensure_ascii=False),'utf-8')
print('Đã tìm '+str(len(elements))+' vùng nét trên máy; kiểm tra lại thứ tự trước khi xuất.',flush=True)
