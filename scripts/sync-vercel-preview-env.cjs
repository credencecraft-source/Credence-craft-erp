const VERCEL_API = "https://api.vercel.com";
const MANAGED_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "DIRECT_URL",
  "NEON_BRANCH_ID",
  "NEON_BRANCH_NAME",
  "NEON_BRANCH_PRIMARY",
  "NEON_PROJECT_ID",
  "NEON_SANDBOX_VERIFIED",
  "NEON_VERCEL_BRANCH_REF",
];
const SANDBOX_BRANCH_NAME = /^credencecraft-sandbox-(?:test-branch|pr-\d+)$/;
const NEON_BRANCH_ID = /^br-[a-z0-9-]+$/;
const NEON_PROJECT_ID = /^[a-z0-9-]+$/;

function getRequired(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getTeamQuery(teamId) {
  const query = new URLSearchParams({ teamId });
  return query.toString();
}

async function requestVercel({ body, fetchImpl, method, path, teamId, token }) {
  const separator = path.includes("?") ? "&" : "?";
  let response;
  try {
    response = await fetchImpl(`${VERCEL_API}${path}${separator}${getTeamQuery(teamId)}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Unable to contact the Vercel environment-variable API.");
  }

  if (!response.ok) {
    throw new Error(`Vercel environment-variable request failed (HTTP ${response.status}).`);
  }

  if (response.status === 204) return null;

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Vercel returned an invalid environment-variable response.");
  }

  if (Array.isArray(result?.failed) && result.failed.length > 0) {
    throw new Error("Vercel rejected one or more environment-variable changes.");
  }
  return result;
}

function getPreviewVariables(env = process.env) {
  const branchRef = getRequired("SANDBOX_VERCEL_BRANCH_REF", env);
  const branchName = getRequired("NEON_BRANCH_NAME", env);
  const branchId = getRequired("NEON_BRANCH_ID", env);
  const projectId = getRequired("NEON_PROJECT_ID", env);

  if (
    !SANDBOX_BRANCH_NAME.test(branchName)
    || !NEON_BRANCH_ID.test(branchId)
    || !NEON_PROJECT_ID.test(projectId)
  ) {
    throw new Error("Refusing to synchronize an unverified Neon sandbox identity.");
  }

  return [
    { key: "DATABASE_URL", value: getRequired("SANDBOX_DATABASE_URL", env), type: "sensitive" },
    {
      key: "DATABASE_URL_UNPOOLED",
      value: getRequired("SANDBOX_DATABASE_URL_UNPOOLED", env),
      type: "sensitive",
    },
    {
      key: "DIRECT_URL",
      value: getRequired("SANDBOX_DATABASE_URL_UNPOOLED", env),
      type: "sensitive",
    },
    { key: "NEON_BRANCH_ID", value: branchId, type: "plain" },
    { key: "NEON_BRANCH_NAME", value: branchName, type: "plain" },
    { key: "NEON_BRANCH_PRIMARY", value: "false", type: "plain" },
    { key: "NEON_PROJECT_ID", value: projectId, type: "plain" },
    { key: "NEON_SANDBOX_VERIFIED", value: "true", type: "plain" },
    { key: "NEON_VERCEL_BRANCH_REF", value: branchRef, type: "plain" },
  ].map((variable) => ({
    ...variable,
    comment: "Managed by the Neon sandbox GitHub Actions workflow.",
    target: ["preview"],
    gitBranch: branchRef,
  }));
}

async function listBranchEnvironmentVariables({
  branchRef,
  fetchImpl,
  projectId,
  teamId,
  token,
}) {
  const query = new URLSearchParams({ gitBranch: branchRef });
  const result = await requestVercel({
    fetchImpl,
    method: "GET",
    path: `/v10/projects/${encodeURIComponent(projectId)}/env?${query.toString()}`,
    teamId,
    token,
  });

  if (!Array.isArray(result?.envs)) {
    throw new Error("Vercel did not return the Preview environment-variable list.");
  }

  return result.envs;
}

async function upsertBranchVariables(options) {
  const variables = getPreviewVariables(options.env);
  const branchRef = variables[0].gitBranch;
  const verifiedVariable = variables.find((variable) => variable.key === "NEON_SANDBOX_VERIFIED");
  const ordinaryVariables = variables.filter((variable) => variable.key !== "NEON_SANDBOX_VERIFIED");
  const existing = await listBranchEnvironmentVariables({
    ...options,
    branchRef,
  });

  function getMatches(variable) {
    return existing.filter((item) => (
      item.key === variable.key
      && item.gitBranch === branchRef
      && Array.isArray(item.target)
      && item.target.includes("preview")
    ));
  }

  const verifiedMatches = getMatches(verifiedVariable);
  if (verifiedMatches.length > 1) {
    throw new Error("Multiple Vercel sandbox verification markers exist for this branch.");
  }

  const disabledMarker = { ...verifiedVariable, value: "false" };
  let verifiedVariableId;
  if (verifiedMatches.length === 1) {
    verifiedVariableId = verifiedMatches[0].id;
    await requestVercel({
      body: disabledMarker,
      fetchImpl: options.fetchImpl,
      method: "PATCH",
      path: `/v9/projects/${encodeURIComponent(options.projectId)}/env/${encodeURIComponent(verifiedVariableId)}`,
      teamId: options.teamId,
      token: options.token,
    });
  } else {
    const result = await requestVercel({
      body: disabledMarker,
      fetchImpl: options.fetchImpl,
      method: "POST",
      path: `/v10/projects/${encodeURIComponent(options.projectId)}/env`,
      teamId: options.teamId,
      token: options.token,
    });
    const created = Array.isArray(result?.created) ? result.created[0] : result?.created;
    verifiedVariableId = created?.id;
    if (!verifiedVariableId) {
      throw new Error("Vercel did not return the sandbox verification variable identity.");
    }
  }

  for (const variable of ordinaryVariables) {
    const matches = getMatches(variable);

    if (matches.length > 1) {
      throw new Error(`Multiple Vercel Preview variables exist for ${variable.key} and this branch.`);
    }

    if (matches.length === 1) {
      await requestVercel({
        body: variable,
        fetchImpl: options.fetchImpl,
        method: "PATCH",
        path: `/v9/projects/${encodeURIComponent(options.projectId)}/env/${encodeURIComponent(matches[0].id)}`,
        teamId: options.teamId,
        token: options.token,
      });
    } else {
      await requestVercel({
        body: variable,
        fetchImpl: options.fetchImpl,
        method: "POST",
        path: `/v10/projects/${encodeURIComponent(options.projectId)}/env`,
        teamId: options.teamId,
        token: options.token,
      });
    }
  }

  await requestVercel({
    body: verifiedVariable,
    fetchImpl: options.fetchImpl,
    method: "PATCH",
    path: `/v9/projects/${encodeURIComponent(options.projectId)}/env/${encodeURIComponent(verifiedVariableId)}`,
    teamId: options.teamId,
    token: options.token,
  });

  return variables.map(({ key }) => key);
}

async function removeBranchVariables(options) {
  const env = options.env ?? process.env;
  const branchRef = getRequired("SANDBOX_VERCEL_BRANCH_REF", env);
  const projectId = getRequired("VERCEL_PROJECT_ID", env);
  const teamId = getRequired("VERCEL_ORG_ID", env);
  const token = getRequired("VERCEL_TOKEN", env);
  const existing = await listBranchEnvironmentVariables({
    branchRef,
    fetchImpl: options.fetchImpl,
    projectId,
    teamId,
    token,
  });

  const managedKeys = new Set(MANAGED_KEYS);

  const matching = existing.filter((item) => (
    managedKeys.has(item.key)
    && item.gitBranch === branchRef
    && Array.isArray(item.target)
    && item.target.includes("preview")
  ));

  for (const variable of matching) {
    await requestVercel({
      fetchImpl: options.fetchImpl,
      method: "DELETE",
      path: `/v9/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(variable.id)}`,
      teamId,
      token,
    });
  }

  return matching.length;
}

async function run(action, env = process.env, fetchImpl = fetch) {
  const options = {
    env,
    fetchImpl,
    projectId: getRequired("VERCEL_PROJECT_ID", env),
    teamId: getRequired("VERCEL_ORG_ID", env),
    token: getRequired("VERCEL_TOKEN", env),
  };

  if (action === "upsert") {
    const keys = await upsertBranchVariables(options);
    console.log(`Synchronized ${keys.length} Vercel Preview variables for the sandbox branch.`);
    return;
  }

  if (action === "remove") {
    const removed = await removeBranchVariables(options);
    console.log(`Removed ${removed} managed Vercel Preview variables for the sandbox branch.`);
    return;
  }

  throw new Error("Expected action to be 'upsert' or 'remove'.");
}

if (require.main === module) {
  run(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : "Vercel Preview environment sync failed.");
    process.exitCode = 1;
  });
}

module.exports = {
  getPreviewVariables,
  listBranchEnvironmentVariables,
  removeBranchVariables,
  run,
  upsertBranchVariables,
};
