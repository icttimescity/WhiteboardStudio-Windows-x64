import path from 'node:path';
export function bundledPythonPath(root,platform=process.platform) {
 return path.join(root,'runtime','python',...(platform==='win32'?['python.exe']:['bin','python3.12']));
}
