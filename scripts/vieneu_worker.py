"""Isolated VieNeu 3.8.3 SDK adapter. One model is reused by sequential requests."""
import os,sys,json,pathlib,time,traceback,threading
os.environ.setdefault('PYTHONIOENCODING','utf-8')
for stream in (sys.stdout,sys.stderr):
 if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8',errors='replace')
HOME=pathlib.Path(os.environ.get('VIENEU_HOME',pathlib.Path(__file__).resolve().parents[1]/'data/vieneu'))
os.environ['HF_HOME']=str(HOME/'models')
model=None;loaded_backend=None

class Pulse:
 def __init__(self,label):self.label=label;self.stop=threading.Event();self.started=time.monotonic();self.thread=threading.Thread(target=self.tick,daemon=True)
 def tick(self):
  while not self.stop.wait(5):print(self.label+' · '+str(int(time.monotonic()-self.started))+' giây',flush=True)
 def __enter__(self):self.thread.start();return self
 def __exit__(self,*args):self.stop.set();self.thread.join(timeout=1)

def engine(backend):
 global model,loaded_backend
 if model is not None and loaded_backend==backend:return model
 model=None
 from vieneu import Vieneu
 if backend=='cuda':
  import torch
  if not torch.cuda.is_available():raise RuntimeError('Không tìm thấy GPU NVIDIA/CUDA khả dụng. Chọn bộ VieNeu CPU hoặc kiểm tra driver.')
  model=Vieneu(backend='pytorch',device='cuda',max_batch_size=1,max_streams=1)
 else:model=Vieneu(backend='onnx',precision='fp32',threads=min(4,os.cpu_count() or 2))
 for folder in (HOME/'clones').glob('wb_clone_*') if (HOME/'clones').is_dir() else []:
  if (folder/'metadata.json').is_file() and (folder/'voices_v3_turbo.json').is_file():
   model._load_repo_voices(str(folder))
 loaded_backend=backend
 return model

def synthesize(spec):
 import numpy as np,soundfile as sf
 tts=engine(spec.get('backend','onnx'));start=time.monotonic()
 text=spec['text'];parts=[p.strip() for p in text.splitlines() if p.strip()];audios=[]
 for i,part in enumerate(parts):
  print('VieNeu: đọc đoạn '+str(i+1)+'/'+str(len(parts)),flush=True)
  # SDK style is deprecated; apply pacing at paragraph boundaries and playback speed later in FFmpeg.
  audio=tts.infer(part,voice=spec['voice'],apply_watermark=False)
  audio=np.asarray(audio,dtype=np.float32).reshape(-1)
  if not len(audio) or not np.isfinite(audio).all():raise RuntimeError('VieNeu trả âm thanh không hợp lệ.')
  if i:audios.append(np.zeros(round(48000*spec.get('pauseMs',450)/1000),dtype=np.float32))
  audios.append(audio)
 result=np.concatenate(audios);output=pathlib.Path(spec['output']);temporary=output.with_suffix('.part.wav')
 if len(result)>48000*600:raise RuntimeError('Lời đọc vượt 10 phút.')
 sf.write(str(temporary),result,48000,subtype='PCM_16');os.replace(temporary,output)
 return {'durationMs':round(len(result)/48),'sampleRate':48000,'elapsed':round(time.monotonic()-start,2)}

def clone_voice(spec):
 tts=engine(spec.get('backend','onnx'));folder=pathlib.Path(spec['outputDir']);folder.mkdir(parents=True,exist_ok=True)
 voice_id=spec['voiceId']
 print('Trích đặc trưng giọng từ âm thanh mẫu; lần đầu có thể tải thêm model clone...',flush=True)
 tts.add_voice(voice_id,spec['reference'],denoise=True,description=spec.get('description',''),save=False)
 target=folder/'voices_v3_turbo.json';tts.save_voices(str(target))
 data=json.loads(target.read_text('utf-8'))
 if voice_id not in data.get('presets',{}):raise RuntimeError('VieNeu không lưu được hồ sơ clone.')
 # Do not overwrite the SDK preset asset. Keep only this custom voice in its own folder.
 data={'default_voice':voice_id,'presets':{voice_id:data['presets'][voice_id]}}
 target.write_text(json.dumps(data,ensure_ascii=False),'utf-8')
 print('Đang kiểm tra phát âm bằng giọng vừa clone...',flush=True)
 result=synthesize({'text':spec.get('text') or 'Xin chào, đây là giọng đọc của tôi.','voice':voice_id,'backend':spec.get('backend','onnx'),'output':str(folder/'sample.wav'),'pauseMs':450})
 return {**result,'voiceId':voice_id}

def prepare(backend):
 tts=engine(backend);voices=[{'id':str(id),'label':str(label)} for label,id in tts.list_preset_voices() if not str(id).startswith('wb_clone_')]
 if not voices:raise RuntimeError('VieNeu không trả danh sách giọng.')
 # Real inference checks that tokenizer, codec and weights are completely downloaded before marking offline-ready.
 import soundfile as sf,numpy as np
 test=np.asarray(tts.infer('Xin chào, bộ giọng đã sẵn sàng.',voice=voices[0]['id'],apply_watermark=False))
 if test.size<1000 or not np.isfinite(test).all():raise RuntimeError('Kiểm tra âm thanh VieNeu không đạt.')
 state={}
 try:state=json.loads((HOME/'ready.json').read_text('utf-8'))
 except (OSError,ValueError):pass
 state.update(version='3.8.3',voices=voices);state.setdefault('backends',{})[backend]=True
 HOME.mkdir(parents=True,exist_ok=True);temp=HOME/'ready.tmp';temp.write_text(json.dumps(state,ensure_ascii=False),'utf-8');os.replace(temp,HOME/'ready.json')
 print('VieNeu đã được kiểm tra phát âm và sẵn sàng offline.',flush=True)

if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]=='prepare':
  with Pulse('Đang tải / kiểm tra VieNeu'):prepare(sys.argv[2] if len(sys.argv)>2 else 'onnx')
 else:
  for line in sys.stdin:
   spec={}
   try:
    spec=json.loads(line)
    with Pulse('VieNeu đang xử lý'):r=clone_voice(spec) if spec.get('op')=='clone' else synthesize(spec)
    print('RESULT '+json.dumps({'id':spec['id'],**r},ensure_ascii=False),flush=True)
   except Exception as e:print('RESULT '+json.dumps({'id':spec.get('id'),'error':str(e)},ensure_ascii=False),flush=True)
