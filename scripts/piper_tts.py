"""Isolated CPU Piper adapter. Models are downloaded only by explicit setup."""
import json, sys, pathlib, wave, re, os
for stream in (sys.stdout,sys.stderr):
    if hasattr(stream,'reconfigure'): stream.reconfigure(encoding='utf-8',errors='replace')
ROOT=pathlib.Path(__file__).resolve().parent.parent
MODELS=pathlib.Path(os.environ.get('PIPER_MODELS_DIR') or ROOT/'models'/'piper')
CATALOG_PATH=pathlib.Path(os.environ.get('PIPER_CATALOG_PATH') or pathlib.Path(os.environ.get('DATA_DIR') or ROOT/'data')/'piper-catalog.json')
try:CATALOG=json.loads(CATALOG_PATH.read_text('utf-8'))
except (OSError,ValueError):CATALOG=json.loads((ROOT/'assets'/'piper-voices.json').read_text('utf-8'))
VOICES=CATALOG

COMMUNITY_MODEL='vi_VN-csa-voice-piper-v3-medium'
SPEAKERS={'vi_Cake-male':2,'vi_Cake-female':0}
COMMUNITY_BASE='https://huggingface.co/CakeByVPBank/piper-pgl-v4-vi_VN-version39_epoch39/resolve/8ea50134bea762f6a1faac671e1a33c41871289c/'

def community_setup():
    import urllib.request, urllib.parse, hashlib, time
    for name in (COMMUNITY_MODEL+'.onnx',COMMUNITY_MODEL+'.onnx.json','README.md'):
        dest=MODELS/(name if name!='README.md' else 'Cake-MODEL_CARD.md')
        def valid(p):
            if not p.exists():return False
            if name.endswith('.onnx'):return p.stat().st_size==77100991 and hashlib.sha256(p.read_bytes()).hexdigest()=='99424831c88afec929eba3aef83a1b3d92f261b0bdc771bc2458f7f1ba63b6d2'
            if name.endswith('.json'):
                try:return json.loads(p.read_text('utf-8')).get('num_speakers')==5
                except Exception:return False
            return p.stat().st_size>100
        if valid(dest):continue
        tmp=dest.with_name(dest.name+'.part')
        for attempt in range(3):
            try:
                print('Downloading '+name,flush=True)
                with urllib.request.urlopen(COMMUNITY_BASE+name,timeout=120) as src,tmp.open('wb') as out:
                    while True:
                        block=src.read(1024*1024)
                        if not block:break
                        out.write(block)
                if not valid(tmp):raise RuntimeError('Community model validation failed')
                os.replace(tmp,dest);break
            except Exception:
                tmp.unlink(missing_ok=True)
                if attempt==2:raise
                time.sleep(2*(attempt+1))

def setup(only=None):
    import urllib.request, urllib.parse, hashlib, time
    MODELS.mkdir(parents=True,exist_ok=True)
    base='https://huggingface.co/rhasspy/piper-voices/resolve/main/'
    catalog=CATALOG
    targets=[only] if only and only not in SPEAKERS else ([] if only else ['vi_VN-vais1000-medium','en_US-lessac-medium','en_US-hfc_male-medium'])
    for voice in targets:
        files=catalog[voice]['files']
        for suffix in ('.onnx','.onnx.json'):
            relative=next(k for k in files if k.endswith('/'+voice+suffix))
            meta=files[relative];dest=MODELS/(voice+suffix)
            def valid(p):
                return p.exists() and p.stat().st_size==meta['size_bytes'] and hashlib.md5(p.read_bytes()).hexdigest()==meta['md5_digest']
            if valid(dest):continue
            tmp=dest.with_name(dest.name+'.part')
            for attempt in range(3):
                try:
                    print('Downloading '+voice+suffix,flush=True)
                    with urllib.request.urlopen(base+urllib.parse.quote(relative,safe='/'),timeout=45) as src,tmp.open('wb') as out:
                        downloaded=0
                        while True:
                            block=src.read(1024*1024)
                            if not block:break
                            out.write(block);downloaded+=len(block)
                            print('PROGRESS '+json.dumps({'file':voice+suffix,'received':downloaded,'total':meta['size_bytes']}),flush=True)
                    if not valid(tmp):raise RuntimeError('Model download checksum mismatch')
                    os.replace(tmp,dest);break
                except Exception:
                    tmp.unlink(missing_ok=True)
                    if attempt==2:raise
                    time.sleep(2*(attempt+1))
        card=next((k for k in files if k.endswith('/MODEL_CARD')),None)
        if card:
            try:
                with urllib.request.urlopen(base+urllib.parse.quote(card,safe='/'),timeout=30) as src:(MODELS/(voice+'-MODEL_CARD.txt')).write_bytes(src.read())
            except Exception as e:print('Model da tai; chua lay duoc MODEL_CARD: '+str(e),flush=True)
    if only is None or only in SPEAKERS:community_setup()
    print('Piper models ready.',flush=True)

def synthesize(manifest):
    from piper import PiperVoice, SynthesisConfig
    spec=json.loads(pathlib.Path(manifest).read_text('utf-8'))
    vid=spec['voice']
    if vid not in VOICES and vid not in SPEAKERS:raise ValueError('Unsupported voice')
    model=MODELS/((COMMUNITY_MODEL if vid in SPEAKERS else vid)+'.onnx')
    if not model.exists():raise RuntimeError('Chua co model. Mo Quan ly / tai giong de tai giong da chon.')
    voice=PiperVoice.load(str(model),use_cuda=False)
    # Newlines are explicit paragraph breaks. Punctuation within a paragraph is handled by Piper.
    paragraphs=[x.strip() for x in re.split(r'\n+',spec['text']) if x.strip()]
    output=pathlib.Path(spec['output']);tmp=output.with_suffix('.part.wav')
    rate=voice.config.sample_rate
    try:
        with wave.open(str(tmp),'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(rate)
            for i,text in enumerate(paragraphs):
                if i:wav.writeframes(b'\0\0'*round(rate*spec['pauseMs']/1000))
                sentence_pause={'neutral':0,'narration':220,'calm':350}.get(spec.get('style','narration'),220)
                for j,chunk in enumerate(voice.synthesize(text,syn_config=SynthesisConfig(length_scale=1/spec['speed'],speaker_id=SPEAKERS.get(vid,spec.get('speakerId',0))))):
                    if j:wav.writeframes(b'\0\0'*round(rate*sentence_pause/1000))
                    wav.writeframes(chunk.audio_int16_bytes)
        with wave.open(str(tmp),'rb') as wav:duration=round(wav.getnframes()*1000/wav.getframerate())
        if duration<=0:raise RuntimeError('Empty audio')
        os.replace(tmp,output)
        print('RESULT '+json.dumps({'durationMs':duration,'sampleRate':rate}),flush=True)
    finally:tmp.unlink(missing_ok=True)

if __name__=='__main__':
    if sys.argv[1]=='setup':setup()
    elif sys.argv[1]=='download':
        vid=sys.argv[2]
        if vid not in VOICES and vid not in SPEAKERS:raise ValueError('Unsupported voice')
        setup(vid)
    elif sys.argv[1]=='doctor':
        import piper
        print(json.dumps({'engineReady':True,'ready':any(all((MODELS/(v+s)).exists() for s in ('.onnx','.onnx.json')) for v in [*VOICES,COMMUNITY_MODEL])}))
    elif sys.argv[1]=='synthesize':synthesize(sys.argv[2])
    else:raise ValueError('Unknown operation')
