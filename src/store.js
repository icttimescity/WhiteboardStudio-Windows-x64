import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
fs.mkdirSync(config.data, { recursive: true });
export function uid() {
  return crypto.randomUUID();
}
export function validId(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("Mã dự án không hợp lệ.");
  return id;
}
export function dir(id) {
  return path.join(config.data, validId(id));
}
export function save(p) {
  p.updatedAt = new Date().toISOString();
  fs.mkdirSync(dir(p.id), { recursive: true });
  const f = path.join(dir(p.id), "project.json");
  fs.writeFileSync(f + ".tmp", JSON.stringify(p, null, 2));
  fs.renameSync(f + ".tmp", f);
  return p;
}
export function get(id) {
  const f = path.join(dir(id), "project.json");
  if (!fs.existsSync(f)) throw Error("Không tìm thấy dự án.");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}
export function list() {
  return fs
    .readdirSync(config.data)
    .filter((n) => /^[a-f0-9-]{36}$/.test(n))
    .map((n) => {
      try {
        return get(n);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function update(id, fn) {
  const p = get(id);
  fn(p);
  return save(p);
}
export function publicProject(p) {
  return {
    ...p,
    scenes: p.scenes.map((s) => {
      const { remoteUrl, pendingImage, ...rest } = s;
      return rest;
    }),
  };
}
export function invalidate(p) {
  p.revision = (p.revision || 0) + 1;
  p.output = null;
  p.preview = null;
}
