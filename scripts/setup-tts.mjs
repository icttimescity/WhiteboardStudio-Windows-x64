import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  choosePython,
  candidates,
  probe,
  supported,
  localPath,
} from "./python-runtime.mjs";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
// Share the relocatable project environment with the renderer.
const folder = path.join(root, ".venv");
const python = path.join(
  folder,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  if (r.error || r.status !== 0)
    throw Error("Lenh that bai: " + (r.error?.message || r.status));
}
try {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw Error("Can Node.js 22 tro len. Cai Node.js LTS 64-bit, mo lai CMD roi chay lai.");
  // Built-in loader: setup must also work before npm install / node_modules.
  try { process.loadEnvFile(path.join(root, ".env")); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  if (!supported(probe(python))) {
    const choice = choosePython([[localPath(root), []], ...candidates()]);
    if (!choice)
      throw Error(
        "Chua tim thay Python 3.12 64-bit. Cai Python 3.12 (Windows installer 64-bit), chon Add python.exe to PATH, mo lai CMD. Kiem tra: py -3.12 --version. Sau do chay lai setup-piper-windows.bat. Khong can sua duong dan theo ten may.",
      );
    if (fs.existsSync(folder))
      fs.renameSync(folder, folder + "-backup-" + Date.now());
    run(choice.cmd, [...choice.args, "-m", "venv", folder]);
  }
  const env = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
  const check = spawnSync(python, ["-c", 'import importlib.metadata; from piper import PiperVoice; import onnxruntime; assert importlib.metadata.version("piper-tts") == "1.3.0"'], {
    encoding: "utf8", windowsHide: true, timeout: 30000, env,
  });
  if (check.status === 0 && !check.error) {
    console.log("Piper 1.3.0 da duoc cai. Kiem tra lai, khong tai thu vien neu khong can.");
  } else {
  const pip = spawnSync(python, ["-m", "pip", "--version"], { encoding: "utf8", windowsHide: true, timeout: 30000, env });
  if (pip.status !== 0 || pip.error) run(python, ["-m", "ensurepip", "--upgrade"]);
  run(python, [
    "-m",
    "pip",
    "install",
    "--only-binary=:all:",
    "--retries", "3", "--timeout", "30",
    "piper-tts==1.3.0",
  ]);

  }
  run(python, ["scripts/piper_tts.py", "doctor"]);
  console.log(
    "BO PIPER DA SAN SANG. Khoi dong lai ung dung, mo Quan ly / tai giong de chon va tai giong can dung.",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
