import sharp from "sharp";
import fs from "node:fs/promises";

export async function imageBackground(buffer) {
  // Nearest-neighbour border samples avoid blending small foreground objects
  // into the canvas. A dominant colour bin also tolerates a marked corner.
  const {data,info}=await sharp(buffer,{limitInputPixels:40000000,failOn:"error"})
    .rotate().resize(64,64,{fit:"fill",kernel:"nearest"}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const bins=new Map();
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    if(x>=2&&x<62&&y>=2&&y<62)continue;
    const i=(y*64+x)*info.channels;
    if(data[i+3]<250)continue;
    const rgb=[data[i],data[i+1],data[i+2]],key=(rgb[0]>>4)*256+(rgb[1]>>4)*16+(rgb[2]>>4);
    if(!bins.has(key))bins.set(key,[]);
    bins.get(key).push(rgb);
  }
  if(!bins.size)return {r:246,g:241,b:227};
  const pixels=[...bins.values()].sort((a,b)=>b.length-a.length)[0];
  const median=c=>{const a=pixels.map(p=>p[c]).sort((a,b)=>a-b),n=a.length;return Math.floor((a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2);};
  return {r:median(0),g:median(1),b:median(2)};
}

// Agnes generates the image; Node normalizes it for the editor. No Python.
export async function normalizeImage(buffer, output, { signal, width=1280, height=720, fit="contain", position="centre", color } = {}) {
  if (signal?.aborted) throw Error("Đã hủy tác vụ.");
  let data;
  try {
    const background = color || await imageBackground(buffer);
    data = await sharp(buffer, { limitInputPixels: 40000000, failOn: "error" })
      .rotate()
      .flatten({ background })
      .resize(width, height, { fit, position, background })
      .png()
      .toBuffer();
  } catch (e) {
    throw Error(`Không xử lý được ảnh: ${e.message}`);
  }
  if (signal?.aborted) throw Error("Đã hủy tác vụ.");
  const temporary = output + ".tmp";
  try {
    await fs.writeFile(temporary, data);
    if (signal?.aborted) throw Error("Đã hủy tác vụ.");
    await fs.rename(temporary, output);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
