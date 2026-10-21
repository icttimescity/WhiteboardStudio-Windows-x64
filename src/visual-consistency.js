import { purposeInstruction } from "./content-purpose.js";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { get, dir, update } from "./store.js";
import { chatValidated } from "./agnes.js";
export const noDuplicates =
  "ONE single coherent moment, ONE continuous composition. Each named character appears exactly once unless the cast explicitly requires several distinct individuals. No duplicated person, cloned face/body, montage, comic panels, inset portraits, before/after, sequential poses, mirrors or reflections that repeat a character. Different actions belong to different scenes. Do not add people merely to fill space.";
export async function imageData(file) {
  const data = await sharp(file)
    .resize(896, 504, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#F6F1E3" })
    .jpeg({ quality: 85 })
    .toBuffer();
  return "data:image/jpeg;base64," + data.toString("base64");
}
export async function ensureVisualProfile(id, ctx) {
  const p = get(id);
  if (p.visualProfile?.styleGuide && Array.isArray(p.visualProfile.characters)) return p.visualProfile;
  ctx.log("Đang chốt phong cách và tạo hình nhân vật dùng chung...");
  const profilePrompt = `VISUAL_PROFILE: ${purposeInstruction(p)} Thiết kế một hồ sơ hình ảnh dùng xuyên suốt video. Không thay dữ kiện và không tự thêm nhân vật không có trong kịch bản. Nếu có ảnh đính kèm, lấy tạo hình/phong cách từ ảnh đó. Trả JSON {"styleGuide":"Mô tả tiếng Việt cụ thể: độ dày nét, bảng màu, ánh sáng, tỷ lệ, nền","characters":[{"id":"stable-id","name":"Tên nhân vật","kind":"individual hoặc group","appearance":"Mô tả tiếng Việt về tạo hình cố định, tóc/lông, khuôn mặt, trang phục, màu sắc, dấu hiệu nhận diện"}],"environments":[{"id":"stable-place-id","name":"Địa điểm","appearance":"Mô tả tiếng Việt về kiến trúc, bố cục, địa hình, ánh sáng, bảng màu và thời điểm cố định"}]}. Tối đa 15 nhân vật chính và 15 bối cảnh; chỉ lấy địa điểm từ nội dung, không bịa thêm. Ghi chú cố định người dùng: ${JSON.stringify(p.externalVisual||{})}. Tối đa 15 nhân vật chính; không biến cùng một người qua các hành động thành nhiều nhân vật. Nhóm đám đông mô tả chung. Phong cách yêu cầu: ${p.style}. Kịch bản: ${p.scenes
      .map((s) => s.text)
      .join(" ")
      .slice(0, 30000)}`;
  const profile = await chatValidated(profilePrompt, data => {
  if (
    typeof data.styleGuide !== "string" ||
    !data.styleGuide.trim() ||
    !Array.isArray(data.characters) ||
    data.characters.length > 15
  )
    throw Error("AI chưa trả hồ sơ tạo hình hợp lệ. Thử lại cảnh này.");
  const ids = new Set();
  const characters = data.characters.map((c) => {
    if (
      !c || typeof c.id !== "string" ||
      !c.id ||
      c.id.length > 80 ||
      ids.has(c.id) ||
      typeof c.appearance !== "string" ||
      !c.appearance.trim()
    )
      throw Error("Hồ sơ nhân vật bị thiếu hoặc lặp mã.");
    ids.add(c.id);
    return {
      id: c.id.slice(0, 80),
      name: String(c.name || c.id).slice(0, 120),
      appearance: c.appearance.slice(0, 1500),
      kind: c.kind === "group" ? "group" : "individual",
    };
  });
  const environments=data.environments ?? [];
  if(!Array.isArray(environments)||environments.length>15)throw Error("Danh sách bối cảnh không hợp lệ.");
  const locationIds=new Set();
  const places=environments.map(e=>{
    if(!e || typeof e.id!=="string" || !e.id.trim() || e.id.length>80 || locationIds.has(e.id) || typeof e.appearance!=="string" || !e.appearance.trim())throw Error("Bối cảnh bị thiếu mô tả hoặc lặp mã.");
    locationIds.add(e.id);return {id:e.id,name:String(e.name||e.id).slice(0,120),appearance:e.appearance.slice(0,1800)};
  });
  return {
    purpose: p.contentMode || "story",
    audience: p.audience || "primary",
    styleGuide: data.styleGuide.slice(0, 4000),
    characters,
    environments:places,
    createdAt: new Date().toISOString(),
  };
  }, {...ctx,maxTokens:6000});
  if (ctx.signal.aborted) throw Error("Đã hủy.");
  update(id, (p) => (p.visualProfile = profile));
  return profile;
}
export function validateCast(cast, profile) {
  if (!Array.isArray(cast) || cast.length > 15)
    throw Error("AI chưa trả danh sách nhân vật trong cảnh.");
  const seen = new Set();
  return cast.map((c) => {
    if (
      !profile.characters.some((x) => x.id === c.id) ||
      seen.has(c.id) ||
      !Number.isInteger(c.count) ||
      c.count < 1 ||
      c.count > 12 ||
      (c.count > 1 &&
        profile.characters.find((x) => x.id === c.id)?.kind !== "group")
    )
      throw Error("Số lượng hoặc mã nhân vật cảnh không hợp lệ.");
    seen.add(c.id);
    return { id: c.id, count: c.count };
  });
}
export async function referenceImages(id, sceneId) {
  const p = get(id),
    index = p.scenes.findIndex((s) => s.id === sceneId);
  const earlier = p.scenes
    .slice(0, index)
    .filter((s) => s.image && fs.existsSync(path.join(dir(id), s.image)));
  const selected = earlier.length
    ? [earlier[0], earlier.at(-1)].filter(
        (s, i, a) => a.findIndex((x) => x.id === s.id) === i,
      )
    : [];
  return {
    ids: selected.map((s) => s.id),
    images: await Promise.all(
      selected.map((s) => imageData(path.join(dir(id), s.image))),
    ),
  };
}
export function coherentPrompt(base, profile, scene, cast, hasReference) {
  const roster = cast.map((c) => ({
    ...c,
    ...profile.characters.find((x) => x.id === c.id),
  }));
  return `${base}\nLOCKED SERIES STYLE: ${profile.styleGuide}\nENVIRONMENT BIBLE (recurring locations only, not a list of places to combine): ${JSON.stringify(profile.environments||[])}\nCHARACTER BIBLE (identity only, not a list of who must appear): ${JSON.stringify(profile.characters)}\nEXACT VISIBLE CAST FOR THIS SCENE: ${JSON.stringify(roster)}\n${profile.purpose === "explain" ? "No duplicated person. Repeated physical objects are allowed only when they clearly represent different process stages, comparison cases or quantities explicitly in the source. Panels and directional arrows are allowed for teaching; never add extra named people." : noDuplicates}\n${hasReference ? "Attached images are visual identity/style references ONLY. The first reference is the primary identity and style anchor; the last reference is continuity context. Preserve same face, hair, outfit, palette and line style. Create a NEW scene, not a copy of previous layout. Do not carry over characters absent from the exact visible cast." : ""}\nScene: ${scene.prompt}\nNarration to illustrate: ${scene.text}`;
}
