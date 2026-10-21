import {randomInt} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
export async function sceneGap(ctx, {random=randomInt,sleep=wait}={}) {
 const value=(key,fallback)=>{const n=Number(process.env[key]);return process.env[key]!==undefined&&Number.isInteger(n)&&n>=0&&n<=30000?n:fallback;};
 const min=value('AGNES_SCENE_DELAY_MIN_MS',1000),max=Math.max(min,value('AGNES_SCENE_DELAY_MAX_MS',3000));
 const ms=random(min,max+1);
 if(ctx.signal.aborted)throw Error('Đã hủy.');
 if(ms){ctx.log(`Đã lưu cảnh trước. Chờ ${(ms/1000).toFixed(1)} giây rồi đề xuất cảnh kế tiếp...`);await sleep(ms,null,{signal:ctx.signal});}
 if(ctx.signal.aborted)throw Error('Đã hủy.');
 return ms;
}
