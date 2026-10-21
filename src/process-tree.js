import {execFileSync} from 'node:child_process';
export function descendants(pid,rows) {
 const owned=new Set([pid]);let changed=true;
 while(changed){changed=false;for(const [child,parent] of rows)if(owned.has(parent)&&!owned.has(child)){owned.add(child);changed=true;}}
 return [...owned].reverse();
}
export function killSharedChild(child) {
 if(!child?.pid||child.exitCode!==null||child.signalCode)return;
 // Stop the worker before taking a snapshot so it cannot spawn another
 // FFmpeg between enumeration and termination. Never stop the server group
 // here: cancelling a render must leave the editor running.
 try{process.kill(child.pid,'SIGSTOP');}catch{}
 try{
  const rows=execFileSync('/bin/ps',['-axo','pid=,ppid='],{encoding:'utf8',timeout:2000}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));
  for(const pid of descendants(child.pid,rows))try{process.kill(pid,'SIGKILL');}catch{}
 }finally{try{child.kill('SIGKILL');}catch{}}
}
