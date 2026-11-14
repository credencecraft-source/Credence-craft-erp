import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const scriptPath = resolve(process.cwd(), "scripts", "backfill-central-finance.cjs");
const result = spawnSync(process.execPath, [scriptPath, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  throw new Error("Unable to start the central Finance backfill runner.", { cause: result.error });
}

process.exitCode = result.status ?? 1;
