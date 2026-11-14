const VERCEL_API = "https://api.vercel.com";
const POLL_INTERVAL_MS = 10000;
const MAX_POLL_ATTEMPTS = 90;
const TERMINAL_FAILURE_STATES = new Set(["ERROR", "CANCELED"]);
const SAFE_BASELINE_DIAGNOSTICS = new Set([
  "SANDBOX_BASELINE_STATUS_FAILED",
  "SANDBOX_BASELINE_DATABASE_URL_MISSING",
  "SANDBOX_BASELINE_SCHEMA_DRIFT",
  "SANDBOX_BASELINE_NO_MIGRATIONS",
  "SANDBOX_BASELINE_RESOLVE_FAILED",
]);

function getRequired(name, env = process.env) {
  const rawValue = env?.[name];
  const value = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function requestVercel({ allowArray = false, body, fetchImpl, method, path, teamId, token }) {
  const separator = path.includes("?") ? "&" : "?";
  let response;
  try {
    response = await fetchImpl(`${VERCEL_API}${path}${separator}teamId=${encodeURIComponent(teamId)}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Unable to contact the Vercel deployment API.");
  }

  if (!response || typeof response !== "object") {
    throw new Error("Vercel Preview deployment API returned no response.");
  }

  if (!response.ok) {
    let errorCode;
    try {
      const errorPayload = await response.json();
      const candidate = errorPayload?.error?.code ?? errorPayload?.errorCode;
      if (typeof candidate === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(candidate)) {
        errorCode = candidate;
      }
    } catch {
      errorCode = undefined;
    }

    const codeMessage = errorCode ? `, code ${errorCode}` : "";
    throw new Error(
      `Vercel Preview deployment request ${method} ${path} failed (HTTP ${response.status ?? "unknown"}${codeMessage}).`,
    );
  }

  if (typeof response.json !== "function") {
    throw new Error("Vercel Preview deployment API response did not contain JSON.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Vercel returned an invalid deployment response.");
  }

  if (
    !payload
    || typeof payload !== "object"
    || (allowArray ? !Array.isArray(payload) : Array.isArray(payload))
  ) {
    throw new Error("Vercel returned an empty or malformed deployment response.");
  }

  return payload;
}

function getPrismaErrorSummary(events) {
  const errorCodes = new Set();
  const migrationNames = new Set();
  const databaseCodes = new Set();
  const baselineCodes = new Set();
  for (const event of events) {
    const text = event?.payload?.text ?? event?.text;
    if (typeof text !== "string") continue;
    for (const match of text.matchAll(/\bP\d{4}\b/g)) errorCodes.add(match[0]);
    for (const match of text.matchAll(/\bMigration name:\s*([A-Za-z0-9_]{1,120})/gi)) {
      migrationNames.add(match[1]);
    }
    for (const match of text.matchAll(/\bDatabase error code:\s*([A-Z0-9]{5})/gi)) {
      databaseCodes.add(match[1]);
    }
    for (const match of text.matchAll(/\[(SANDBOX_BASELINE_[A-Z_]+)\]/g)) {
      if (SAFE_BASELINE_DIAGNOSTICS.has(match[1])) baselineCodes.add(match[1]);
    }
  }
  return {
    errorCodes: [...errorCodes],
    migrationNames: [...migrationNames],
    databaseCodes: [...databaseCodes],
    baselineCodes: [...baselineCodes],
  };
}

function getDeploymentInput(env = process.env) {
  const ref = getRequired("SANDBOX_VERCEL_BRANCH_REF", env);
  const sha = getRequired("SANDBOX_GIT_SHA", env);
  const repositoryId = getRequired("SANDBOX_GITHUB_REPOSITORY_ID", env);

  if (ref === "main") {
    throw new Error("Refusing to create a sandbox Preview deployment from main.");
  }
  if (!/^[0-9a-f]{40,64}$/i.test(sha) || !/^\d+$/.test(repositoryId)) {
    throw new Error("Vercel Preview deployment source metadata is invalid.");
  }

  return { ref, sha, repositoryId };
}

async function waitForDeployment(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Vercel deployment polling options must be an object.");
  }

  const {
    deploymentId,
    fetchImpl = fetch,
    maxAttempts = MAX_POLL_ATTEMPTS,
    pollIntervalMs = POLL_INTERVAL_MS,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    teamId,
    token,
  } = options;

  if (typeof deploymentId !== "string" || !deploymentId.trim()) {
    throw new Error("Vercel deployment polling requires a deployment ID.");
  }
  if (typeof teamId !== "string" || !teamId.trim() || typeof token !== "string" || !token.trim()) {
    throw new Error("Vercel deployment polling requires the team ID and API token.");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const deployment = await requestVercel({
      fetchImpl,
      method: "GET",
      path: `/v13/deployments/${encodeURIComponent(deploymentId)}`,
      teamId,
      token,
    });

    if (typeof deployment.readyState !== "string") {
      throw new Error("Vercel deployment status response is missing readyState.");
    }

    if (deployment.readyState === "READY") {
      if (typeof deployment.url !== "string" || !deployment.url.trim()) {
        throw new Error("Vercel marked the Preview deployment ready but did not return its URL.");
      }
      return deployment.url;
    }

    if (TERMINAL_FAILURE_STATES.has(deployment.readyState)) {
      const errorCode = typeof deployment.errorCode === "string"
        && /^[A-Za-z0-9_-]{1,80}$/.test(deployment.errorCode)
        ? ` (code ${deployment.errorCode})`
        : "";
      let diagnostics = "";
      try {
        const events = await requestVercel({
          allowArray: true,
          fetchImpl,
          method: "GET",
          path: `/v3/deployments/${encodeURIComponent(deploymentId)}/events?direction=backward&limit=100`,
          teamId,
          token,
        });
        const summary = getPrismaErrorSummary(events);
        const details = [
          ...summary.errorCodes.map((code) => `Prisma ${code}`),
          ...summary.migrationNames.map((name) => `migration ${name}`),
          ...summary.databaseCodes.map((code) => `database ${code}`),
          ...summary.baselineCodes.map((code) => `baseline ${code.slice("SANDBOX_BASELINE_".length).toLowerCase()}`),
        ];
        diagnostics = details.length ? ` (${details.join("; ")})` : "";
      } catch {
        diagnostics = " (build diagnostics unavailable; inspect Vercel deployment logs)";
      }
      throw new Error(
        `Vercel Preview deployment finished in state ${deployment.readyState}${errorCode}${diagnostics}.`,
      );
    }

    if (attempt < maxAttempts) await sleep(pollIntervalMs);
  }

  throw new Error("Vercel Preview deployment did not become ready before the timeout.");
}

async function createPreviewDeployment(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new Error("Vercel Preview deployment options must be an object.");
  }

  const {
    env = process.env,
    fetchImpl = fetch,
    logger = console,
    maxAttempts = MAX_POLL_ATTEMPTS,
    pollIntervalMs = POLL_INTERVAL_MS,
    sleep,
  } = options;

  const token = getRequired("VERCEL_TOKEN", env);
  const teamId = getRequired("VERCEL_ORG_ID", env);
  const projectId = getRequired("VERCEL_PROJECT_ID", env);
  const { ref, sha, repositoryId } = getDeploymentInput(env);

  const project = await requestVercel({
    fetchImpl,
    method: "GET",
    path: `/v9/projects/${encodeURIComponent(projectId)}`,
    teamId,
    token,
  });
  if (project.id !== projectId || typeof project.name !== "string" || !project.name.trim()) {
    throw new Error("Vercel project response is missing the expected project ID or project name.");
  }

  const deployment = await requestVercel({
    body: {
      name: project.name,
      project: projectId,
      gitSource: {
        type: "github",
        repoId: repositoryId,
        ref,
        sha,
      },
    },
    fetchImpl,
    method: "POST",
    path: "/v13/deployments?forceNew=1",
    teamId,
    token,
  });

  if (typeof deployment.id !== "string" || !deployment.id.trim()) {
    throw new Error("Vercel deployment creation response is missing a deployment ID.");
  }
  if (!logger || typeof logger.log !== "function") {
    throw new Error("Vercel Preview deployment logger must provide a log function.");
  }

  const url = await waitForDeployment({
    deploymentId: deployment.id,
    fetchImpl,
    maxAttempts,
    pollIntervalMs,
    sleep,
    teamId,
    token,
  });
  logger.log(`Vercel Preview deployment is ready: https://${url.replace(/^https?:\/\//, "")}`);
  return url;
}

if (require.main === module) {
  createPreviewDeployment().catch((error) => {
    console.error(error instanceof Error ? error.message : "Vercel Preview deployment failed.");
    process.exitCode = 1;
  });
}

module.exports = {
  createPreviewDeployment,
  getPrismaErrorSummary,
  getDeploymentInput,
  waitForDeployment,
};
