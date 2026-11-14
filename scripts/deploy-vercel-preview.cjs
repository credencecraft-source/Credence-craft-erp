const VERCEL_API = "https://api.vercel.com";
const POLL_INTERVAL_MS = 10000;
const MAX_POLL_ATTEMPTS = 90;
const TERMINAL_FAILURE_STATES = new Set(["ERROR", "CANCELED"]);

function getRequired(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function requestVercel({ body, fetchImpl, method, path, teamId, token }) {
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

  if (!response.ok) {
    throw new Error(`Vercel Preview deployment request failed (HTTP ${response.status}).`);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Vercel returned an invalid deployment response.");
  }
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

async function waitForDeployment({
  deploymentId,
  fetchImpl,
  maxAttempts = MAX_POLL_ATTEMPTS,
  pollIntervalMs = POLL_INTERVAL_MS,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  teamId,
  token,
}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const deployment = await requestVercel({
      fetchImpl,
      method: "GET",
      path: `/v13/deployments/${encodeURIComponent(deploymentId)}`,
      teamId,
      token,
    });

    if (deployment.readyState === "READY" && deployment.url) {
      return deployment.url;
    }

    if (TERMINAL_FAILURE_STATES.has(deployment.readyState)) {
      throw new Error(`Vercel Preview deployment finished in state ${deployment.readyState}.`);
    }

    if (attempt < maxAttempts) await sleep(pollIntervalMs);
  }

  throw new Error("Vercel Preview deployment did not become ready before the timeout.");
}

async function createPreviewDeployment({
  env = process.env,
  fetchImpl = fetch,
  logger = console,
  maxAttempts = MAX_POLL_ATTEMPTS,
  pollIntervalMs = POLL_INTERVAL_MS,
  sleep,
}) {
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
  if (project.id !== projectId || !project.name) {
    throw new Error("Vercel returned a mismatched project identity.");
  }

  const deployment = await requestVercel({
    body: {
      name: project.name,
      project: projectId,
      target: "preview",
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

  if (!deployment.id) {
    throw new Error("Vercel did not return a deployment identity.");
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
  getDeploymentInput,
  waitForDeployment,
};
