export function videoFilename(project, video, preview = false) {
 const title=String(project.title||'Du_an').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,100).replace(/_+$/,'')||'Du_an';
 const height=Number(video.height)||(preview?360:1080);
 const resolution=({2160:'4K',1440:'QHD',1080:'FHD',720:'HD'})[height]||`${Math.round(height)}p`;
 return `Video_${title}_${project.aspectRatio && project.aspectRatio!=="16:9"?project.aspectRatio.replace(":","x")+"_"+(video.width||({"9:16":1080,"1:1":1080,"4:3":1440,"3:4":1080})[project.aspectRatio])+"x"+height:resolution}.mp4`;
}
