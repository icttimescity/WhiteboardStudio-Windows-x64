import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
export const registryScript=`[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false); $result=@(); foreach($h in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)){ foreach($v in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){ $base=$null; $key=$null; try{ $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey($h,$v); $key=$base.OpenSubKey('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe'); if($key){$value=$key.GetValue('');if($value){$result+=[string]$value}} }catch{} finally{if($key){$key.Dispose()};if($base){$base.Dispose()}} } }; ConvertTo-Json -Compress -InputObject @($result)`;
export function chromeCandidates(env=process.env,platform=process.platform) {
 const p=platform==='win32'?path.win32:path;
 const paths=[env.CHROME_PATH];
 for(const base of [env.LOCALAPPDATA,env.ProgramW6432,env.ProgramFiles,env['ProgramFiles(x86)']])if(base)paths.push(p.join(base,'Google','Chrome','Application','chrome.exe'));
 for(const folder of String(env.PATH||'').split(platform==='win32'?';':':'))if(folder.trim())paths.push(p.join(folder.trim().replace(/^"|"$/g,''),platform==='win32'?'chrome.exe':'google-chrome'));
 return [...new Set(paths.filter(Boolean).map(p=>p.trim().replace(/^"|"$/g,'')))];
}
export function findChrome({env=process.env,platform=process.platform,exists=fs.existsSync,registry}={}) {
 const valid=file=>!!file&&(!/\0|\r|\n/.test(file))&&(platform!=='win32'||path.win32.basename(file).toLowerCase()==='chrome.exe')&&exists(file);
 const direct=chromeCandidates(env,platform).find(valid);if(direct)return direct;
 if(platform==='win32') {
  let values=[];
  try {
   values=registry?registry():JSON.parse(execFileSync(path.win32.join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',registryScript],{encoding:'utf8',windowsHide:true,timeout:12000}).replace(/^\uFEFF/,''));
  }catch{}
  if(typeof values==='string')values=[values];
  for(const raw of values||[]){const file=String(raw).trim().replace(/^"|"$/g,'');if(valid(file))return file;}
 }
 throw Error('Chưa tìm thấy Google Chrome. Cài Chrome hoặc đặt CHROME_PATH trong .env tới chrome.exe đã cài; sau đó mở lại EXE.');
}
export function chromeArguments(url,profile) {
 return [`--app=${url}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-mode','--disable-extensions','--disable-session-crashed-bubble'];
}
export async function ensureFreePort(port,host='127.0.0.1') {
 const probe=net.createServer();
 await new Promise((resolve,reject)=>{probe.once('error',()=>reject(Error(`Cổng ${port} đang được sử dụng. Đóng bản Whiteboard Studio đang chạy bằng CMD hoặc chọn ứng dụng khác để giải phóng cổng; không tự tắt tiến trình lạ.`)));probe.listen(port,host,()=>probe.close(resolve));});
}
export async function killOwnedTree(child,{platform=process.platform,exec=execFileSync}={}) {
 if(!child?.pid||child.exitCode!==null||child.signalCode)return;
 try {
  if(platform==='win32')exec(path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:5000,stdio:'ignore'});
  else process.kill(-child.pid,'SIGTERM');
 }catch{try{child.kill();}catch{}}
}
export async function waitOwnedServer(url,token,child,{fetcher=fetch,timeoutMs=25000,signal}={}) {
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline) {
  if(signal?.aborted)throw Error('Đã đóng ứng dụng khi đang khởi động.');
  if(child.exitCode!==null||child.signalCode||child.startError)throw Error('Máy chủ local không khởi động được. Xem data/desktop.log.');
  try {const r=await fetcher(url+'/api/desktop',{headers:{'X-Desktop-Token':token},signal:AbortSignal.any([AbortSignal.timeout(800),...(signal?[signal]:[])])});const d=await r.json();if(r.ok&&d.app==='whiteboard-studio'&&d.owned===true)return;}catch{}
  await delay(120);
 }
 throw Error('Quá thời gian mở máy chủ local. Cổng 3000 chưa sẵn sàng; xem data/desktop.log.');
}
