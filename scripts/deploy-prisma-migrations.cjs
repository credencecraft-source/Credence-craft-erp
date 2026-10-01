const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

const MAX_ATTEMPTS = 5;

function isAdvisoryLockTimeout(output) {
  return output.includes("P1002")
    && /timed out trying to acquire a postgres advisory lock/i.test(output);
}

function runPrismaMigrateDeploy() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [require.resolve("prisma"), "migrate", "deploy"], {
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.once("error", (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
    child.once("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function runMigrationsWithRetry(
  run = runPrismaMigrateDeploy,
  sleep = delay,
  logger = console,
) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await run();
    if (result.code === 0) return 0;
    if (!isAdvisoryLockTimeout(result.output)) return result.code || 1;
    if (attempt === MAX_ATTEMPTS) {
      logger.error(`Prisma migration advisory lock remained busy after ${MAX_ATTEMPTS} attempts.`);
      return result.code || 1;
    }

    const waitMs = Math.min(2000 * (2 ** (attempt - 1)), 16000);
    logger.warn(`Prisma migration advisory lock is busy; retrying in ${waitMs / 1000}s (${attempt}/${MAX_ATTEMPTS - 1}).`);
    await sleep(waitMs);
  }

  return 1;
}

if (require.main === module) {
  runMigrationsWithRetry().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { isAdvisoryLockTimeout, runMigrationsWithRetry };
