"""Media adapter: normalized canvas, exact timeline, actual preview, audio and subtitles."""
import sys, os, json, pathlib, subprocess, textwrap, time, threading
# Windows redirected pipes may default to cp1252. Logs are always UTF-8.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, 'reconfigure'):
        stream.reconfigure(encoding='utf-8', errors='replace')
ROOT=pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'vendor/whiteboard/scripts'))

def ffmpeg():
    import imageio_ffmpeg
    return os.environ.get('FFMPEG_PATH') or imageio_ffmpeg.get_ffmpeg_exe()

def ff(args,timeout=900):
    try:
        r=subprocess.run([ffmpeg(),'-y','-hide_banner','-loglevel','error',*map(str,args)],capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(f'FFmpeg không hoàn thành trong {timeout} giây. Đã dừng, dữ liệu dự án được giữ để thử lại.') from e
    if r.returncode: raise RuntimeError(r.stderr[-2000:])

def font_path():
    paths=[ROOT/'assets/DejaVuSans.ttf',pathlib.Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts/arial.ttf',pathlib.Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),pathlib.Path('/System/Library/Fonts/Supplemental/Arial.ttf')]
    return next((str(p) for p in paths if p.exists()),None)

def progress(percent,message):
    print('PROGRESS '+json.dumps({'percent':percent,'message':message},ensure_ascii=False),flush=True)

class SceneProgress:
    """Real frame counts plus a live heartbeat during CPU-bound path analysis."""
    def __init__(self, index, count, title, frames, before, all_frames):
        self.index,self.count,self.title=index,count,title
        self.total,self.before,self.all_frames=frames,before,max(1,all_frames)
        self.frames=0;self.stage='Chuẩn bị ảnh và khung vẽ'
        self.started=time.monotonic();self.last=0
        self.stop=threading.Event();self.lock=threading.Lock()
        self.thread=threading.Thread(target=self._pulse,daemon=True)
    def _emit(self):
        now=time.monotonic();self.last=now
        done=min(self.frames,self.total)
        percent=min(75,round(75*(self.before+done)/self.all_frames))
        progress(percent,f"Đang vẽ cảnh {self.index+1}/{self.count}: {self.title} · {self.stage} · {done}/{self.total} khung · đã xử lý {int(now-self.started)}s")
    def _pulse(self):
        while not self.stop.wait(3):
            with self.lock:
                if time.monotonic()-self.last>=2.5:self._emit()
    def update(self,frames,stage):
        with self.lock:
            changed=stage!=self.stage;self.frames=frames;self.stage=stage
            if changed or time.monotonic()-self.last>=1:self._emit()
    def __enter__(self):
        self._emit();self.thread.start();return self
    def __exit__(self,*args):
        self.stop.set();self.thread.join(timeout=1)

class PhaseProgress:
    def __init__(self,percent,message):
        self.percent,self.message=percent,message;self.stop=threading.Event()
        self.started=time.monotonic();self.thread=threading.Thread(target=self._pulse,daemon=True)
    def _pulse(self):
        while not self.stop.wait(3):
            progress(self.percent,f'{self.message} · đã xử lý {int(time.monotonic()-self.started)}s')
    def __enter__(self):
        progress(self.percent,self.message);self.thread.start()
    def __exit__(self,*args):
        self.stop.set();self.thread.join(timeout=1)

def normalize(src,dst):
    from PIL import Image, ImageOps
    import numpy as np
    from source_background import background_rgb
    with Image.open(src) as source:
        source.load()
        if source.width*source.height>40000000: raise ValueError('Ảnh vượt quá 40 megapixel.')
        im=ImageOps.exif_transpose(source).convert('RGBA')
        bg=background_rgb(np.asarray(im))
        base=Image.new('RGBA',im.size,(*bg,255));base.alpha_composite(im)
        ImageOps.pad(base.convert('RGB'),(1280,720),method=Image.Resampling.LANCZOS,color=bg).save(dst,'PNG')

def subtitle_overlay(text,w,h):
    from PIL import Image,ImageDraw,ImageFont
    import numpy as np
    im=Image.new('RGBA',(w,h),(0,0,0,0));d=ImageDraw.Draw(im)
    font=ImageFont.truetype(font_path(),max(14,int(min(w,h)*.04)))
    words=text.split();lines=[];line=''
    for word in words:
        proposed=(line+' '+word).strip()
        if d.textlength(proposed,font=font)>w*.88 and line: lines.append(line);line=word
        else: line=proposed
    if line: lines.append(line)
    line_h=max(22,int(min(w,h)*.06));top=h-int(h*.045)-line_h*len(lines)
    for i,line in enumerate(lines):
        box=d.textbbox((0,0),line,font=font);tw=d.textlength(line,font=font);x=(w-tw)/2;y=top+i*line_h
        d.rounded_rectangle((x-12,y-5,x+tw+12,y+line_h-1),radius=7,fill=(18,25,34,205))
        d.text((x,y),line,font=font,fill='white')
    rgba=np.asarray(im);return rgba[:,:,:3][:,:,::-1].copy(),rgba[:,:,3:4].astype('float32')/255

def compose_speech(scenes,base,work):
    import wave
    target=work/'narration.wav';rate=48000;cursor=0
    with wave.open(str(target),'wb') as out:
        out.setnchannels(1);out.setsampwidth(2);out.setframerate(rate)
        def silence(frames):
            while frames>0:
                n=min(frames,rate);out.writeframes(b'\0\0'*n);frames-=n
        for i,scene in enumerate(scenes):
            start=round((scene['startMs']+150)*rate/1000)
            if start<cursor:raise ValueError('Loi doc chong len canh tiep theo.')
            silence(start-cursor);cursor=start
            temp=work/f'voice-{i}.wav'
            speech=scene['speech']
            ff(['-i',base/speech['file'],'-af',f"atempo={speech.get('playbackRate',1):.10f},apad",'-t',f"{speech.get('audioDurationMs',speech['durationMs'])/1000:.6f}",'-ac','1','-ar',rate,'-c:a','pcm_s16le',temp])
            try:
                with wave.open(str(temp),'rb') as source:
                    while True:
                        block=source.readframes(rate)
                        if not block:break
                        out.writeframes(block);cursor+=len(block)//2
            finally:temp.unlink(missing_ok=True)
        end=round((scenes[-1]['startMs']+scenes[-1]['durationMs'])*rate/1000)
        if cursor>end:raise ValueError('Loi doc vuot thoi luong video.')
        silence(end-cursor)
    return target

def render(manifest):
    import cv2,numpy as np
    import stream_render as sr
    from render_stream_whiteboard import RegionStreamRenderer
    m=json.loads(pathlib.Path(manifest).read_text('utf-8'));p=m['project'];out=pathlib.Path(m['output']);base=pathlib.Path(m['projectDir']);work=out.parent
    w,h,fps=m['width'],m['height'],m['fps'];scenes=p['scenes'];parts=[]
    frame_counts=[max(1,round(s['durationMs']*fps/1000)) for s in scenes];before=0
    for i,s in enumerate(scenes):
        cfg=sr.Config(fps=fps,cap_long_edge=max(w,h),grid_edge=10,target_hand_height=round(h*.46),ink_path_mode=m['mode'],match_bg=False,preserve_source_background=True)
        # All output sizes are multiples of 10; keep the original grid density.
        image=sr._imread_any(str(base/s['image']))
        if image is None: raise ValueError('Không đọc được ảnh cảnh.')
        ann=dict(s['annotation']);ann['backgroundColor']=s.get('backgroundColor') if s.get('backgroundMode')=='manual' else s.get('detectedBackground');part=work/f'scene-{i}.mp4'
        with SceneProgress(i,len(scenes),s['title'],frame_counts[i],before,sum(frame_counts)) as reporter:
            r=RegionStreamRenderer(image,ann,cfg,ROOT/'vendor/whiteboard/assets/drawing-hand.png',not m['hand'])
            r.render_to(part,s['durationMs'],on_progress=reporter.update)
        # Drop the previous scene's large image/mask/float buffers before
        # constructing the next renderer (important on 8 GB machines).
        del r,image
        before+=frame_counts[i];parts.append(part)
    progress(77,'Ghép cảnh và phụ đề...')
    raw=work/'composed.mp4';writer=cv2.VideoWriter(str(raw),cv2.VideoWriter_fourcc(*'mp4v'),fps,(w,h))
    if not writer.isOpened():raise RuntimeError('Không mở được bộ mã hóa video.')
    total_frames=round(p['cues'][-1]['endMs']*fps/1000);frame_n=0;cue_n=0;last_text=None;overlay=None;alpha=None
    try:
        for i,part in enumerate(parts):
            cap=cv2.VideoCapture(str(part));target_end=round((scenes[i]['startMs']+scenes[i]['durationMs'])*fps/1000);last=None
            try:
                while frame_n<target_end:
                    ok,frame=cap.read()
                    if ok:last=frame
                    elif last is not None:frame=last.copy()
                    else:raise RuntimeError('Cảnh render không có khung hình.')
                    if frame.shape[1]!=w or frame.shape[0]!=h:frame=cv2.resize(frame,(w,h))
                    t=frame_n*1000/fps
                    while cue_n<len(p['cues']) and p['cues'][cue_n]['endMs']<=t:cue_n+=1
                    text=p['cues'][cue_n]['text'] if cue_n<len(p['cues']) and p['cues'][cue_n]['startMs']<=t and m['subtitles'] else ''
                    if text!=last_text:
                        if text:overlay,alpha=subtitle_overlay(text,w,h)
                        last_text=text
                    if text:
                        # Only subtitle strip needs compositing; untouched drawing remains exact.
                        y0=int(h*.65);frame[y0:]=(frame[y0:]*(1-alpha[y0:])+overlay[y0:]*alpha[y0:]).astype('uint8')
                    writer.write(frame);frame_n+=1
                    if frame_n%(fps*2)==0:progress(77+round(frame_n/max(1,total_frames)*16),'Đang ghép video...')
            finally:cap.release()
    finally:writer.release()
    progress(94,'Chuẩn bị lời đọc...')
    args=['-i',raw]
    with PhaseProgress(94,'Ghép và cân thời lượng lời đọc'):
        audio=compose_speech(scenes,base,work) if p.get('sceneSpeech') else (base/p['audio'] if p.get('audio') else None)
    if audio:args+=['-i',audio,'-map','0:v:0','-map','1:a:0','-af','apad','-c:a','aac','-b:a','160k']
    args+=['-t',f'{frame_n/fps:.6f}','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',out]
    with PhaseProgress(95,'Mã hóa MP4 H.264 và ghép âm thanh'):
        ff(args)
    for part in parts:part.unlink(missing_ok=True)
    raw.unlink(missing_ok=True)
    progress(100,'Video đã sẵn sàng')

if __name__=='__main__':
    action=sys.argv[1]
    if action=='doctor':
        import struct, importlib.util
        if sys.version_info[:2] != (3,12) or struct.calcsize('P')*8 != 64:
            raise RuntimeError('Can Python 3.12 64-bit. Chay lai setup-windows.bat de tao moi truong dung.')
        missing=[m for m in ('cv2','numpy','av','PIL','imageio_ffmpeg') if importlib.util.find_spec(m) is None]
        if missing:
            raise RuntimeError('Thieu thu vien: '+', '.join(missing)+'. Chay setup-windows.bat hoac npm run setup.')
        import cv2,numpy,av,PIL
        from PIL import ImageFont
        if not font_path():raise RuntimeError('Thiếu font hỗ trợ tiếng Việt.')
        ImageFont.truetype(font_path(),20)
        ff(['-version'])
        print(json.dumps({'python':sys.version.split()[0],'opencv':cv2.__version__,'ffmpeg':True,'font':True}))
    elif action=='normalize':normalize(sys.argv[2],sys.argv[3])
    elif action=='audio':ff(['-i',sys.argv[2],'-vn','-t','600','-c:a','aac','-ar','48000',sys.argv[3]])
    elif action=='tempo':ff(['-i',sys.argv[2],'-af','atempo='+str(float(sys.argv[4])),'-c:a','pcm_s16le','-ar','48000',sys.argv[3]])
    elif action=='voice-reference':
        import wave,numpy as np
        start=float(sys.argv[4]);ff(['-ss',str(start),'-i',sys.argv[2],'-t','8','-ac','1','-ar','48000','-c:a','pcm_s16le',sys.argv[3]])
        with wave.open(sys.argv[3],'rb') as sample:
            duration=sample.getnframes()/sample.getframerate();audio=np.frombuffer(sample.readframes(sample.getnframes()),dtype='<i2').astype(float)
        if duration<3:raise ValueError('Mẫu cần ít nhất 3 giây lời nói. Chọn mốc sớm hơn hoặc tệp khác.')
        if not len(audio) or np.sqrt(np.mean(audio*audio))<25:raise ValueError('Mẫu quá nhỏ hoặc im lặng. Hãy dùng đoạn lời nói rõ.')
    elif action=='render':render(sys.argv[2])
    else:raise ValueError('Unknown operation')
