const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(buf){let crc=0xffffffff;for(const n of buf)crc=table[(crc^n)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function zipStore(entries) {
 let offset=0,total=0;const local=[],central=[];
 if(entries.length>60000)throw Error('Quá nhiều tệp trong gói.');
 for(const {name,data} of entries){
  if(!name||name.startsWith('/')||name.split('/').some(p=>p==='..'||p==='')||name.includes('\\'))throw Error('Tên tệp xuất không hợp lệ.');
  const content=Buffer.isBuffer(data)?data:Buffer.from(String(data),'utf8'),filename=Buffer.from(name,'utf8');
  total+=content.length;if(total>160*1024*1024)throw Error('Gói ảnh lớn hơn 160 MB. Hãy giảm kích thước ảnh tham chiếu.');
  const crc=crc32(content),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(0x21,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(content.length,18);h.writeUInt32LE(content.length,22);h.writeUInt16LE(filename.length,26);
  local.push(h,filename,content);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(content.length,20);c.writeUInt32LE(content.length,24);c.writeUInt16LE(filename.length,28);c.writeUInt32LE(offset,42);central.push(c,filename);offset+=h.length+filename.length+content.length;
 }
 const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
