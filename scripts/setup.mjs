import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  probe,
  supported,
  localPath,
  candidates,
  choosePython,
  backupVenv,
} from "./python-runtime.mjs";
const root = path.resolve(import.meta.dirname, "..");
process.chdir(root);
function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
  });
  if (r.error || r.status !== 0)
    throw Error(
      `Lenh cai dat khong thanh cong (${r.error?.message || r.status}).`,
    );
}
try {
  if (Number(process.versions.node.split(".")[0]) < 22)
    throw Error("Can Node.js 22 tro len. Cai Node.js LTS 64-bit, mo lai CMD roi chay lai.");
  // Built-in loader: setup must also work before npm install / node_modules.
  try { process.loadEnvFile(path.join(root, ".env")); }
  catch (e) { if (e.code !== "ENOENT") throw e; }
  const python = localPath(root),
    existing = probe(python);
  if (!supported(existing)) {
    const choice = choosePython(candidates());
    if (!choice) {
      console.error(
        "\nChua tim thay Python 3.12 64-bit. Khong dung Python 3.15 cho bo render nay.\nCai Python 3.12 Windows installer (64-bit):\nhttps://www.python.org/downloads/release/python-31210/\nChon Add python.exe to PATH. Mo lai CMD, kiem tra: py -3.12 --version\nSau do chay lai setup-windows.bat. Anh va du an trong data duoc giu nguyen.",
      );
      process.exit(1);
    }
    const backup = backupVenv(root);
    if (backup) console.log("Da giu moi truong cu tai: " + backup);
    console.log("Tao moi truong bang: " + choice.info.executable);
    run(choice.cmd, [...choice.args, "-m", "venv", ".venv"]);
  }
  const info = probe(python);
  if (!supported(info))
    throw Error("Moi truong .venv khong phai Python 3.12 64-bit.");
  console.log("Python render: " + python + " / " + info.version.join("."));
  run(python, ["-m", "pip", "install", "--upgrade", "pip"]);
  // Never compile PyAV on the user's Windows machine.
  run(python, [
    "-m",
    "pip",
    "install",
    "--only-binary=:all:",
    "-r",
    "requirements.txt",
  ]);
  if (!fs.existsSync(".env")) fs.copyFileSync(".env.example", ".env");
  run(python, ["scripts/media.py", "doctor"]);
  run(process.execPath, ["scripts/setup-tts.mjs"]);
  console.log(
    "\nCAI DAT RENDER VA PIPER THANH CONG. Chay start-windows.bat. Ung dung tu tim .venv, khong can sua duong dan tren tung may.",
  );
} catch (e) {
  console.error(
    "\nCai dat chua hoan tat: " +
      e.message +
      "\nGiu nguyen cua so nay de xem loi phia tren. Co the chay lai setup-windows.bat.",
  );
  process.exitCode = 1;
}
