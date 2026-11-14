const fs = require("node:fs");

const NEON_API = "https://console.neon.tech/api/v2";
const DATABASE_NAME = "credencecraft_sandbox_v2";
const DATABASE_OWNER = "neondb_owner";
const SANDBOX_BRANCH_NAME = /^credencecraft-sandbox-(?:test-branch|pr-\d+)$/;
const NEON_BRANCH_ID = /^br-[a-z0-9-]+$/;
const NEON_PROJECT_ID = /^[a-z0-9-]+$/;

function getRequired(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getDatabaseUrl(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Neon returned an invalid sandbox connection string.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Neon returned an unsupported sandbox connection string.");
  }

  url.pathname = `/${DATABASE_NAME}`;
  return url.toString();
}

function getSandboxDatabaseUrls(env = process.env) {
  return {
    pooled: getDatabaseUrl(getRequired("SANDBOX_DATABASE_URL", env)),
    unpooled: getDatabaseUrl(getRequired("SANDBOX_DATABASE_URL_UNPOOLED", env)),
  };
}

async function requestNeon({ body, fetchImpl, method, path, token }) {
  let response;
  try {
    response = await fetchImpl(`${NEON_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Unable to contact the Neon sandbox database API.");
  }

  if (!response || typeof response !== "object") {
    throw new Error("Neon returned no sandbox database API response.");
  }

  if (!response.ok) {
    let errorCode;
    try {
      const payload = await response.json();
      const candidate = payload?.code;
      if (typeof candidate === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(candidate)) {
        errorCode = candidate;
      }
    } catch {
      errorCode = undefined;
    }

    const codeMessage = errorCode ? `, code ${errorCode}` : "";
    throw new Error(
      `Neon sandbox database request ${method} failed (HTTP ${response.status ?? "unknown"}${codeMessage}).`,
    );
  }

  if (typeof response.json !== "function") {
    throw new Error("Neon sandbox database response did not contain JSON.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Neon returned an invalid sandbox database response.");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Neon returned an empty or malformed sandbox database response.");
  }

  return payload;
}

function getIdentity(env) {
  const projectId = getRequired("NEON_PROJECT_ID", env);
  const branchId = getRequired("NEON_BRANCH_ID", env);
  const branchName = getRequired("NEON_BRANCH_NAME", env);
  const token = getRequired("NEON_API_KEY", env);

  if (
    !NEON_PROJECT_ID.test(projectId)
    || !NEON_BRANCH_ID.test(branchId)
    || !SANDBOX_BRANCH_NAME.test(branchName)
  ) {
    throw new Error("Refusing to create a database for an unverified Neon sandbox branch.");
  }

  return { branchId, projectId, token };
}

function hasExpectedDatabase(database, branchId) {
  return database?.name === DATABASE_NAME
    && database.owner_name === DATABASE_OWNER
    && database.branch_id === branchId;
}

async function ensureSandboxDatabase({ env = process.env, fetchImpl = fetch } = {}) {
  const identity = getIdentity(env);
  const databasePath = `/projects/${encodeURIComponent(identity.projectId)}`
    + `/branches/${encodeURIComponent(identity.branchId)}/databases`;
  const listed = await requestNeon({
    fetchImpl,
    method: "GET",
    path: databasePath,
    token: identity.token,
  });

  if (!Array.isArray(listed.databases)) {
    throw new Error("Neon did not return the sandbox branch database list.");
  }

  const matches = listed.databases.filter((database) => database?.name === DATABASE_NAME);
  if (matches.length > 1 || (matches.length === 1 && !hasExpectedDatabase(matches[0], identity.branchId))) {
    throw new Error("The isolated Neon migration database exists with unexpected ownership or branch identity.");
  }

  if (matches.length === 0) {
    const created = await requestNeon({
      body: { database: { name: DATABASE_NAME, owner_name: DATABASE_OWNER } },
      fetchImpl,
      method: "POST",
      path: databasePath,
      token: identity.token,
    });

    if (!hasExpectedDatabase(created.database, identity.branchId)) {
      throw new Error("Neon did not confirm the expected isolated migration database.");
    }
  }

  return getSandboxDatabaseUrls(env);
}

function writeWorkflowOutputs(urls, env = process.env) {
  const outputPath = getRequired("GITHUB_OUTPUT", env);
  const output = `SANDBOX_DATABASE_URL=${urls.pooled}\n`
    + `SANDBOX_DATABASE_URL_UNPOOLED=${urls.unpooled}\n`;
  fs.appendFileSync(outputPath, output, { encoding: "utf8", mode: 0o600 });
}

if (require.main === module) {
  ensureSandboxDatabase()
    .then((urls) => {
      console.log(`::add-mask::${urls.pooled}`);
      console.log(`::add-mask::${urls.unpooled}`);
      writeWorkflowOutputs(urls);
      console.log(`Ensured isolated Neon sandbox database "${DATABASE_NAME}".`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Neon sandbox database setup failed.");
      process.exitCode = 1;
    });
}

module.exports = {
  DATABASE_NAME,
  ensureSandboxDatabase,
  getSandboxDatabaseUrls,
  writeWorkflowOutputs,
};
