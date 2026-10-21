import "dotenv/config";
import {bundledPythonPath} from './bundled-runtime.js';
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const bundledPython = bundledPythonPath(root);
const localPython = path.join(
  root,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
export const config = {
  root,
  data: path.resolve(process.env.DATA_DIR || path.join(root, "data")),
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "127.0.0.1",
  key: (process.env.AGNES_API_KEY || "").trim(),
  base: (
    process.env.AGNES_BASE_URL || "https://apihub.agnes-ai.com/v1"
  ).replace(/\/$/, ""),
  textModel: process.env.AGNES_TEXT_MODEL || "agnes-2.5-flash",
  imageModel: process.env.AGNES_IMAGE_MODEL || "agnes-image-2.5-flash",
  // Prefer the project environment created by setup; ignore paths from another PC.
  python: fs.existsSync(bundledPython)
    ? bundledPython
    : fs.existsSync(localPython)
      ? localPython
      : process.env.PYTHON_PATH || localPython,
  timeout: Number(process.env.AGNES_TIMEOUT_MS || 240000),
  retries: Number(process.env.AGNES_RETRIES ?? 1),
  textTimeout: Number(process.env.AGNES_TEXT_TIMEOUT_MS || 90000),
  visionTimeout: Number(process.env.AGNES_VISION_TIMEOUT_MS || 120000),
  imageTimeout: Number(process.env.AGNES_IMAGE_TIMEOUT_MS || 180000),
  interval: Number(process.env.AGNES_MIN_INTERVAL_MS || 3000),
  imageRetries: Number(
    process.env.AGNES_IMAGE_RETRIES ??
      (process.env.AGNES_RETRIES === "0" ? 0 : 2),
  ),
  imageInterval: Number(
    process.env.AGNES_IMAGE_INTERVAL_MS ??
      (process.env.AGNES_MIN_INTERVAL_MS === "0" ? 0 : 8000),
  ),
};
export function safeError(e) {
  return String(e?.message || e)
    .replaceAll(config.key || "__NO_KEY__", "[KEY]")
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [KEY]")
    .replace(/Agnes(?: AI)?/gi, "dịch vụ AI")
    .slice(-1500);
}
