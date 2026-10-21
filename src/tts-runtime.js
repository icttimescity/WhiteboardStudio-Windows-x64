import fs from "node:fs";
import path from "node:path";
import {bundledPythonPath} from './bundled-runtime.js';
export function resolveTtsPython({
  root,
  env = process.env,
  platform = process.platform,
  exists = fs.existsSync,
  fallback,
} = {}) {
  const executable = platform === "win32" ? "Scripts/python.exe" : "bin/python";
  const choices = [
    bundledPythonPath(root,platform),
    env.PIPER_PYTHON_PATH?.trim().replace(/^"|"$/g, ""),
    path.join(root, ".venv", executable),
    path.join(root, ".venv-tts", executable),
    fallback,
  ];
  const found = choices.find((x) => x && exists(x));
  if (found) return found;
  throw Error(
    "Chưa có Python cho Piper trên máy này. Trong thư mục dự án, chạy npm run setup (cài cả render và Piper) hoặc npm run setup:tts. Không cần điền đường dẫn .venv-tts trong .env.",
  );
}
