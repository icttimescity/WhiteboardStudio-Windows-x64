import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {findChrome,chromeArguments,ensureFreePort,waitOwnedServer,killOwnedTree} from './chrome-lifecycle.mjs';
const root=path.resolve(import.meta.dirname,'..');
async function waitUntilClosed(promise,ms){let timer;try{return await Promise.race([promise,new Promise(resolve=>timer=setTimeout(resolve,ms))]);}finally{clearTimeout(timer);}}
function closed(child){return new Promise(resolve=>{if(child.exitCode!==null||child.signalCode||child.startError)resolve();else{child.once('exit',resolve);child.once('error',resolve);}});}
export async function awaitParent(input=process.stdin,timeoutMs=15000){
 const lines=readline.createInterface({input});let timer;
 try {await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Launcher không xác nhận quản lý tiến trình. Hãy mở lại EXE.')),timeoutMs);lines.once('line',line=>line.replace(/^\uFEFF/,'').trim()==='START'?resolve():reject(Error('Sai xác nhận launcher.')));lines.once('close',()=>reject(Error('Launcher đã đóng trước khi khởi động.')));});}
 finally{clearTimeout(timer);lines.close();input.pause();}
}
export function desktopProfilePath({platform=process.platform,port=3000,env=process.env,home=os.homedir()}={}){
 const p=platform==='win32'?path.win32:path;
 const base=platform==='win32'?(env.LOCALAPPDATA||p.join(home,'AppData','Local')):(env.DATA_DIR||env.XDG_STATE_HOME||p.join(home,'.local','state'));
 return p.join(base,'WhiteboardStudio','ChromeProfile-'+port);
}
export async function runDesktop({port=3000,chromePath,chromeArgsExtra=[],fetcher=fetch,spawnChild=spawn,platform=process.platform,onReady=pid=>console.log('DESKTOP_READY '+pid)}={}) {
 process.chdir(root);
 try{process.loadEnvFile(path.join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const chrome=chromePath||findChrome();
 await ensureFreePort(port);
 const token=process.env.DESKTOP_SHUTDOWN_TOKEN||crypto.randomBytes(32).toString('hex'),url=`http://127.0.0.1:${port}`;
 // Keep the application's isolated login session across launches/builds.
 const profile=desktopProfilePath({platform,port});
 fs.mkdirSync(profile,{recursive:true,mode:0o700});
 let server,browser,serverClosed,browserClosed,stopping=false,reason;
 let finish;const ended=new Promise(resolve=>finish=resolve);
 const startupAbort=new AbortController();
 const signal=()=>{startupAbort.abort();finish({type:'signal'});};
 process.once('SIGINT',signal);process.once('SIGTERM',signal);
 try {
  server=spawnChild(process.execPath,['src/server.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),DESKTOP_MODE:'1',DESKTOP_SHUTDOWN_TOKEN:token},windowsHide:true,detached:platform!=='win32',stdio:['ignore','pipe','pipe']});
  serverClosed=closed(server);server.stdout?.on('data',b=>process.stdout.write(b));server.stderr?.on('data',b=>process.stderr.write(b));
  server.once('error',e=>{server.startError=e;finish({type:'server-error',error:e});});
  server.once('exit',(code,sig)=>{if(!stopping)finish({type:'server-exit',code,sig});});
  await waitOwnedServer(url,token,server,{fetcher,signal:startupAbort.signal});
  if(startupAbort.signal.aborted)throw Error('Đã đóng ứng dụng khi đang khởi động.');
  const browserEnv={...process.env};
  for(const key of Object.keys(browserEnv))if(key.startsWith('AGNES_')||key.startsWith('DESKTOP_'))delete browserEnv[key];
  browser=spawnChild(chrome,[...chromeArguments(url,profile),...chromeArgsExtra],{cwd:root,env:browserEnv,windowsHide:false,detached:platform!=='win32',stdio:['ignore','ignore','pipe']});
  browserClosed=closed(browser);browser.stderr?.on('data',b=>process.stderr.write(b));
  browser.once('error',e=>{browser.startError=e;finish({type:'browser-error',error:e});});
  browser.once('exit',(code,sig)=>finish({type:'browser-exit',code,sig}));
  if(browser.pid)onReady(browser.pid);
  reason=await ended;
  if(reason.error)throw reason.error;
  if(reason.code&&reason.type==='browser-exit')throw Error('Chrome đã dừng bất thường. Xem data/desktop.log rồi mở lại EXE.');
  if(reason.code&&reason.type==='server-exit')throw Error('Máy chủ local đã dừng bất thường. Xem data/desktop.log.');
 }finally {
  stopping=true;process.removeListener('SIGINT',signal);process.removeListener('SIGTERM',signal);
  if(server?.pid&&server.exitCode===null&&!server.signalCode){
   try{await fetcher(url+'/api/desktop/shutdown',{method:'POST',headers:{'X-Desktop-Token':token},signal:AbortSignal.timeout(1200)});}catch{}
   await waitUntilClosed(serverClosed,2200);
   await killOwnedTree(server,{platform});
  }
  await killOwnedTree(browser,{platform});
  if(browserClosed)await waitUntilClosed(browserClosed,1200);
  process.stdin.pause();
 }
 return {reason:reason?.type,url};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{if(process.env.DESKTOP_REQUIRE_PARENT==='1')await awaitParent();await runDesktop();}
 catch(e){console.error('DESKTOP_ERROR '+e.message);process.exitCode=1;}
}
