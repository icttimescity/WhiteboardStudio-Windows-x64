import fs from "node:fs";
import path from "node:path";
import { createRequester, AgnesRequestError } from "./agnes-client.js";
import { setTimeout as wait } from "node:timers/promises";
import { config } from "./config.js";

export function extractJson(text) {
  const clean = String(text)
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf("{"),
      end = clean.lastIndexOf("}");
    if (start < 0) throw Error("AI chưa trả về JSON hợp lệ. Hãy thử lại.");
    return JSON.parse(clean.slice(start, end + 1));
  }
}
const cooldownPath = path.join(config.data, "agnes-cooldown.json");
let initialCooldown = {},
  legacyCooldown = false;
try {
  const saved = JSON.parse(fs.readFileSync(cooldownPath, "utf8"));
  legacyCooldown = saved.version !== 2;
  initialCooldown = legacyCooldown ? saved : saved.deadlines;
  for (const k of Object.keys(initialCooldown))
    if (!Number.isFinite(initialCooldown[k]) || initialCooldown[k] < 0)
      delete initialCooldown[k];
} catch {}
export const request = createRequester({
  ...config,
  initialCooldown,
  legacyCooldown,
  fetch: (...args) => globalThis.fetch(...args),
  sleep: (ms, signal) => wait(ms, null, { signal }),
  onCooldown: (state) => {
    try {
      fs.mkdirSync(config.data, { recursive: true });
      fs.writeFileSync(
        cooldownPath,
        JSON.stringify({ version: 2, deadlines: state }),
      );
    } catch {}
  },
});
export async function chat(prompt, ctx = {}, imageUrl) {
  if(ctx.aiChat)return ctx.aiChat(prompt,ctx,imageUrl);
  const content = imageUrl
    ? [
        { type: "text", text: prompt },
        ...(Array.isArray(imageUrl) ? imageUrl : [imageUrl]).map((url) => ({
          type: "image_url",
          image_url: { url },
        })),
      ]
    : prompt;
  const d = await request(
    "/chat/completions",
    {
      model: config.textModel,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "Bạn là trợ lý thiết kế video giáo dục. Chỉ trả về JSON đúng cấu trúc được yêu cầu, không markdown. Tuân thủ mục tiêu kể chuyện/giải thích kiến thức và đối tượng được nêu trong yêu cầu; không thay đổi dữ kiện nguồn hoặc tự bịa số liệu.",
        },
        { role: "user", content },
      ],
      temperature: 0.3,
      max_tokens: ctx.maxTokens || 5000,
    },
    ctx,
  );
  const c = d.choices?.[0];
  if (c?.finish_reason === "length")
    throw Error("AI trả lời quá dài. Hãy giảm nội dung hoặc số cảnh.");
  let text = c?.message?.content;
  if (Array.isArray(text)) text = text.map((x) => x.text || "").join("");
  if (!text) throw new AgnesRequestError("Agnes không trả nội dung trong choices[0].message. Đã dừng, giữ kết quả.", "INVALID_RESPONSE");
  try {
    const value = extractJson(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Cần một đối tượng JSON.');
    return value;
  } catch {
    ctx.log?.("Phản hồi văn bản chưa đúng JSON. Đang sửa định dạng một lần...");
    const fixed = await request(
      "/chat/completions",
      {
        model: config.textModel,
      stream: false,
        messages: [
          {
            role: "system",
            content:
              "Only repair the supplied JSON formatting. Preserve all facts and fields. Return one JSON object, no markdown.",
          },
          { role: "user", content: String(text).slice(0, 16000) },
        ],
        temperature: 0,
        max_tokens: ctx.maxTokens || 5000,
      },
      ctx,
    );
    let repaired = fixed.choices?.[0]?.message?.content;
    if (Array.isArray(repaired)) repaired = repaired.map(x=>x.text || "").join("");
    if (fixed.choices?.[0]?.finish_reason === 'length') throw Error('Phản hồi sửa JSON quá dài. Hãy thử lại riêng phần chưa xong.');
    try {
      const value=extractJson(repaired || '');
      if(!value || typeof value!=='object' || Array.isArray(value))throw Error('shape');
      return value;
    } catch { throw new AgnesRequestError('AI trả dữ liệu sai định dạng sau một lượt sửa. Kết quả cũ đã giữ; hãy thử lại phần chưa xong.', 'INVALID_RESPONSE'); }
  }
}

export async function chatValidated(prompt, validate, ctx={}, imageUrl) {
  let correction='';
  for(let attempt=0;attempt<2;attempt++) {
    if(ctx.signal?.aborted)throw Error('Đã hủy tác vụ.');
    const answer=await chat(prompt+correction,ctx,imageUrl);
    try{return await validate(answer);}
    catch(e){
      if(e.transport||e.retryable||ctx.signal?.aborted||attempt===1)throw e;
      ctx.log?.('Cấu trúc phản hồi chưa đạt; yêu cầu AI sửa một lần, giữ nguyên dữ kiện.');
      correction=`\nSửa cấu trúc phản hồi. Lỗi: ${String(e.message).slice(0,700)}. Trả lại đúng đối tượng JSON theo yêu cầu gốc, không thêm hoặc đổi dữ kiện.`;
    }
  }
}
