import { python } from "../src/process.js";
import { config } from "../src/config.js";
try {
  console.log(await python(["scripts/media.py", "doctor"]));
  console.log(
    "Agnes key:",
    config.key ? "Configured (not printed)" : "Missing",
  );
  console.log("Models:", config.textModel);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
