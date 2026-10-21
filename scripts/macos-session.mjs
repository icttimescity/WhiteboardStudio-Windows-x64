import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import crypto from 'node:crypto';import readline from 'node:readline';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {ensureFreePort,waitOwnedServer} from './chrome-lifecycle.mjs';
export function macSupport(home=os.homedir()) {return path.join(home,'Library','Application Support','Whiteboard Studio');}
export function prepareMacEnvironment(root,support,env=process.env) {
 fs.mkdirSync(support,{recursive:true,mode:0o700});
 const settings=path.join(support,'.env');
 if(!fs.existsSync(settings)){fs.copyFileSync(path.join(root,'.env.example'),settings,fs.constants.COPYFILE_EXCL);fs.chmodSync(settings,0o600);}
 // Load settings into a temporary process environment snapshot; do not change
 // host paths for callers/tests. dotenv is not needed for this bootstrap.
 const before={...process.env};let loaded;
 try{process.loadEnvFile(settings);loaded={...process.env};}finally{
  for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];
  Object.assign(process.env,before);
 }
 const result={...loaded,...env,DATA_DIR:path.join(support,'data'),PIPER_MODELS_DIR:path.join(support,'models','piper'),
  DESKTOP_SHARED_GROUP:'1',HOST:'127.0.0.1',PORT:'3000',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1'};
 for(const key of ['PYTHONHOME','PYTHONPATH','VIRTUAL_ENV','DYLD_LIBRARY_PATH','DYLD_FRAMEWORK_PATH'])delete result[key];
 // Explicit environment wins over .env, as on the source CLI; persistent data
 // always stays outside the read-only, signed application bundle.
 for(const directory of [result.DATA_DIR,result.PIPER_MODELS_DIR])fs.mkdirSync(directory,{recursive:true});
 return result;
}
export function nativeParent(input=process.stdin,timeoutMs=15000) {
 const controller=new AbortController(),lines=readline.createInterface({input});let resolve,reject,started=false;
 const ready=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const timer=setTimeout(()=>reject(Error('Ứng dụng không xác nhận khởi động. Hãy mở lại .app.')),timeoutMs);
 lines.on('line',line=>{
  if(line.trim()==='START'&&!started){started=true;clearTimeout(timer);resolve();}
  else if(line.trim()==='STOP')controller.abort();
 });
 lines.once('close',()=>{clearTimeout(timer);if(!started)reject(Error('Cửa sổ ứng dụng đã đóng.'));controller.abort();});
 return {ready,signal:controller.signal,close(){clearTimeout(timer);lines.close();input.pause();}};
}
export async function runMacSession({root=path.resolve(import.meta.dirname,'..'),support=macSupport(),port=3000,
 signal,spawnServer=spawn,fetcher=fetch,onReady=()=>console.log('DESKTOP_READY')}={}) {
 const env=prepareMacEnvironment(root,support);
 await ensureFreePort(port);
 if(signal?.aborted)throw Error('Đã đóng ứng dụng.');
 const token=crypto.randomBytes(32).toString('hex'),url=`http://127.0.0.1:${port}`;
 let child,closed,exitReason;const startup=new AbortController();
 let finish;const ended=new Promise(resolve=>finish=resolve);
 const stop=()=>{startup.abort();finish('closed');};
 signal?.addEventListener('abort',stop,{once:true});
 try {
  child=spawnServer(process.execPath,['src/server.js'],{cwd:root,env:{...env,PORT:String(port),DESKTOP_MODE:'1',DESKTOP_SHUTDOWN_TOKEN:token},detached:true,stdio:['ignore','pipe','pipe']});
  if(child.pid)console.log('DESKTOP_SERVER_PID '+child.pid);
  closed=new Promise(resolve=>{child.once('exit',resolve);child.once('error',resolve);});
  child.stdout?.on('data',b=>process.stdout.write(b));child.stderr?.on('data',b=>process.stderr.write(b));
  child.once('error',e=>{child.startError=e;finish(e);});child.once('exit',()=>{startup.abort();finish('server-exit');});
  await waitOwnedServer(url,token,child,{fetcher,signal:startup.signal});
  if(signal?.aborted)throw Error('Đã đóng ứng dụng khi khởi động.');
  onReady();exitReason=await ended;
  if(exitReason instanceof Error)throw exitReason;
  if(exitReason==='server-exit')throw Error('Máy chủ đã dừng. Mở lại ứng dụng; xem desktop.log nếu lỗi tiếp diễn.');
 } finally {
  signal?.removeEventListener('abort',stop);
  if(child?.pid){
   try{await fetcher(url+'/api/desktop/shutdown',{method:'POST',headers:{'X-Desktop-Token':token},signal:AbortSignal.timeout(1000)});}catch{}
   let timer;await Promise.race([closed,new Promise(r=>timer=setTimeout(r,2000))]);clearTimeout(timer);
   // The server and all Python/FFmpeg children share this OWNED process group.
   // Kill the group even if its leader exited, so orphan media workers stop too.
   for(const sig of ['SIGTERM','SIGKILL']){try{process.kill(-child.pid,sig);}catch{}if(sig==='SIGTERM')await delay(150);}
  }
 }
 return {url,reason:exitReason};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const parent=nativeParent();const stop=()=>parent.close();process.once('SIGTERM',stop);process.once('SIGINT',stop);
 try{await parent.ready;await runMacSession({signal:parent.signal,support:process.env.WHITEBOARD_MAC_SUPPORT||macSupport()});}
 catch(e){console.error('DESKTOP_ERROR '+e.message);process.exitCode=1;}
 finally{parent.close();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
