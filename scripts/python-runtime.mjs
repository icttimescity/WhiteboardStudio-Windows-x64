import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
export const probeCode = 'import sys,struct,json; print(json.dumps({"version":list(sys.version_info[:3]),"bits":struct.calcsize("P")*8,"executable":sys.executable}))';
export function supported(info){return !!info && info.version?.[0]===3 && info.version?.[1]===12 && info.bits===64;}
export function probe(command,args=[],spawn=spawnSync){
  try {const r=spawn(command,[...args,'-c',probeCode],{encoding:'utf8',windowsHide:true,timeout:10000});if(r.status!==0)return null;return JSON.parse(r.stdout.trim());} catch{return null;}
}
export function localPath(root,platform=process.platform){return path.join(root,'.venv',platform==='win32'?'Scripts/python.exe':'bin/python');}
export function candidates(platform=process.platform,env=process.env){
 const out=platform==='win32'?[['py',['-3.12']]]:[['python3.12',[]]];
 if(env.PYTHON_PATH)out.push([env.PYTHON_PATH.trim().replace(/^"|"$/g, ""),[]]);
 if(platform==='win32'){
  for(const base of [env.LOCALAPPDATA&&path.join(env.LOCALAPPDATA,'Programs','Python','Python312'),env.ProgramFiles&&path.join(env.ProgramFiles,'Python312'),'C:\\Python312'])if(base)out.push([path.join(base,'python.exe'),[]]);
 }
 out.push(['python3',[]],['python',[]]);return out;
}
export function choosePython(items,probeFn=probe){for(const [cmd,args]of items){const info=probeFn(cmd,args);if(supported(info))return {cmd,args,info};}return null;}
export function backupVenv(root){const old=path.join(root,'.venv');if(!fs.existsSync(old))return null;const dest=path.join(root,`.venv-backup-${Date.now()}`);fs.renameSync(old,dest);return dest;}
