// Separate managed Python prevents VieNeu dependencies changing Piper/video libraries.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {config} from '../src/config.js';import {run} from '../src/process.js';import {vieneuHome,vieneuPython} from '../src/vieneu-runtime.js';import crypto from 'node:crypto';
const backend=process.argv[2]||'onnx';if(!['onnx','cuda'].includes(backend))throw Error('Chỉ chọn onnx hoặc cuda.');
if(process.platform!=='win32')process.env.DESKTOP_SHARED_GROUP='1';
const home=vieneuHome();fs.mkdirSync(home,{recursive:true});process.env.VIENEU_HOME=home;process.env.UV_PYTHON_INSTALL_DIR=path.join(home,'python');process.env.HF_HOME=path.join(home,'models');delete process.env.HF_HUB_OFFLINE;
const log=onLine=>run(...onLine);const options={timeout:3600000,onLine:line=>console.log(line)};
async function uv(){
 try{await run('uv',['--version'],{timeout:5000});return 'uv';}catch{}
 const win=process.platform==='win32',arch=process.arch==='arm64'?'aarch64':'x86_64';
 const target=win?'x86_64-pc-windows-msvc':`${arch}-${process.platform==='darwin'?'apple-darwin':'unknown-linux-gnu'}`;
 const archive=`uv-${target}.${win?'zip':'tar.gz'}`,folder=path.join(home,'bootstrap');fs.mkdirSync(folder,{recursive:true});
 const base='https://github.com/astral-sh/uv/releases/download/0.9.6/';
 console.log('Đang tải công cụ cài môi trường Python độc lập...');
 async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error('Không tải được runtime: HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}
 const bytes=await get(base+archive),hash=(await get(base+archive+'.sha256')).toString().trim().split(/\s+/)[0];
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==hash)throw Error('Checksum runtime không đúng.');
 const file=path.join(folder,archive);fs.writeFileSync(file,bytes);
 if(win)await run('powershell',['-NoProfile','-NonInteractive','-Command',`Expand-Archive -LiteralPath '${file.replaceAll("'","''")}' -DestinationPath '${folder.replaceAll("'","''")}' -Force`],options);
 else await run('tar',['-xzf',file,'-C',folder],options);
 return path.join(folder,win?'uv.exe':`uv-${target}/uv`);
}
try{
 const tool=await uv();console.log('Đang chuẩn bị Python 3.12 cho VieNeu...');
 await run(tool,['python','install','3.12','--install-dir',path.join(home,'python'),'--no-bin'],options);
 if(!fs.existsSync(vieneuPython()))await run(tool,['venv',path.join(home,'env'),'--python','3.12','--managed-python'],{...options});
 if(backend==='cuda')await run(tool,['pip','install','--python',vieneuPython(),'torch==2.8.0','torchaudio==2.8.0','--index-url','https://download.pytorch.org/whl/cu128'],options);
 await run(tool,['pip','install','--python',vieneuPython(),'vieneu==3.8.3',...(backend==='cuda'?['transformers==4.57.6']:[])],options);
 console.log('Đang tải model và kiểm tra giọng. Lần đầu có thể mất nhiều phút...');
 await run(vieneuPython(),['-u','scripts/vieneu_worker.py','prepare',backend],options);
}catch(e){console.error('Không hoàn tất cài VieNeu: '+e.message);process.exitCode=1;}
