import { spawn } from "node:child_process";
import { config } from "./config.js";
import {killSharedChild} from './process-tree.js';
export function run(
  cmd,
  args,
  { signal, onLine = () => {}, cwd = config.root, timeout = 3600000 } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Error("Đã hủy tác vụ."));
    const sharedGroup = process.platform !== 'win32' && process.env.DESKTOP_SHARED_GROUP === '1';
    const child = spawn(cmd, args, {
      cwd,
      windowsHide: true,
      detached: process.platform !== "win32" && !sharedGroup,
      env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let tail = "",
      pending = "",
      done = false,
      timedOut = false;
    const kill = () => {
      if (!child.pid) return;
      if(sharedGroup){try{killSharedChild(child);}catch{}return;}
      if (process.platform === "win32")
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
        });
      else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    };
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeout);
    signal?.addEventListener("abort", kill, { once: true });
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", kill);
      err ? reject(err) : resolve(tail);
    };
    child.stdout.on("data", (d) => {
      tail = (tail + d).slice(-20000);
      pending += d;
      const lines = pending.split("\n");
      pending = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on("data", (d) => (tail = (tail + d).slice(-20000)));
    child.on("error", (e) =>
      finish(
        Error(`Không chạy được ${cmd}: ${e.message}. Hãy chạy npm run setup.`),
      ),
    );
    child.on("close", (code) =>
      finish(
        signal?.aborted
          ? Error("Đã hủy tác vụ.")
          : timedOut
            ? Error(`Tác vụ xử lý quá giới hạn ${Math.ceil(timeout / 1000)} giây và đã dừng. Dữ liệu dự án vẫn được giữ; hãy thử lại hoặc xem trước ở độ phân giải thấp.`)
          : code === 0
            ? null
            : Error(tail.slice(-1800) || `Tiến trình dừng (${code}).`),
      ),
    );
  });
}
export async function python(args, opts) {
  try {
    if (args[0] === "scripts/media.py" && ["render", "audio"].includes(args[1])) {
      await run(config.python, ["scripts/media.py", "doctor"], { ...opts, onLine: () => {}, timeout: 30000 });
    }
    return await run(config.python, args, opts);
  } catch (e) {
    if (
      /Python was not found|ENOENT|No module named|cannot find|not recognized/i.test(
        e.message,
      )
    ) {
      throw Error(
        "Chưa sẵn sàng bộ xử lý video Python. Để render hoặc xử lý lời đọc, cài Python 3.12 (chọn Add Python to PATH), chạy npm run setup rồi khởi động lại ứng dụng. Chi tiết: " +
          e.message,
      );
    }
    throw e;
  }
}
