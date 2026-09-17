const net = require("node:net");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");

const host = "127.0.0.1";
const port = 3000;

function isPortInUse() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolve(true);
      } else if (error.code === "ECONNREFUSED") {
        resolve(false);
      } else {
        reject(error);
      }
    });
  });
}

function stopChildProcess(child) {
  if (!child || child.exitCode !== null) return;

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.unref();
    return;
  }

  child.kill("SIGTERM");
}

async function main() {
  if (await isPortInUse()) {
    console.log(`Development server is already running at http://localhost:${port}.`);
    console.log("Stop the existing server before starting another one.");
    return;
  }

  const transientDevOutput = path.join(process.cwd(), ".next", "dev");
  fs.rmSync(transientDevOutput, { recursive: true, force: true });

  const nextCommand = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCommand, "dev", "--port", String(port), "--hostname", "0.0.0.0"], {
    stdio: "inherit",
    windowsHide: false,
  });

  const shutdown = (signal) => {
    stopChildProcess(child);
    process.exit(signal === "SIGINT" ? 130 : 143);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  child.once("error", (error) => {
    console.error("Failed to launch Next.js", error);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    if (signal) {
      process.exit(1);
    } else {
      process.exit(code ?? 1);
    }
  });
}

main().catch((error) => {
  console.error("Failed to start development server", error);
  process.exit(1);
});
