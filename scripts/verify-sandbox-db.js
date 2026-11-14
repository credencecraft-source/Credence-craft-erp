const SANDBOX_BRANCH_NAME = /^credencecraft-sandbox-(?:test-branch|pr-\d+)$/;
const NEON_BRANCH_ID = /^br-[a-z0-9-]+$/;
const NEON_PROJECT_ID = /^[a-z0-9-]+$/;

function verifySandboxDatabase(env = process.env) {
  const vercelEnvironment = env.VERCEL_ENV?.trim();

  if (vercelEnvironment && env.USE_DEV_USER_STORE?.trim().toLowerCase() === "true") {
    throw new Error("USE_DEV_USER_STORE must not be enabled in a deployed Vercel environment.");
  }

  if (!vercelEnvironment || vercelEnvironment === "production") {
    return { skipped: true, reason: "Not a Vercel Preview deployment." };
  }

  if (vercelEnvironment !== "preview") {
    throw new Error("Unknown Vercel deployment environment; refusing to run migrations.");
  }

  const branchId = env.NEON_BRANCH_ID?.trim() ?? "";
  const projectId = env.NEON_PROJECT_ID?.trim() ?? "";
  const branchName = env.NEON_BRANCH_NAME?.trim() ?? "";
  const branchPrimary = env.NEON_BRANCH_PRIMARY?.trim().toLowerCase();
  const verified = env.NEON_SANDBOX_VERIFIED?.trim().toLowerCase();
  const deploymentBranch = env.VERCEL_GIT_COMMIT_REF?.trim() ?? "";
  const configuredBranch = env.NEON_VERCEL_BRANCH_REF?.trim() ?? "";

  if (
    !NEON_BRANCH_ID.test(branchId)
    || !NEON_PROJECT_ID.test(projectId)
    || !SANDBOX_BRANCH_NAME.test(branchName)
    || branchPrimary !== "false"
    || verified !== "true"
    || !deploymentBranch
    || configuredBranch !== deploymentBranch
    || !env.DATABASE_URL?.trim()
  ) {
    throw new Error(
      "Sandbox Neon branch identity is missing, unverified, or does not match this Preview branch, or DATABASE_URL is missing; refusing to run migrations.",
    );
  }

  return { skipped: false, projectId, branchId, branchName };
}

if (require.main === module) {
  try {
    const result = verifySandboxDatabase();
    if (result.skipped) {
      console.log(result.reason);
    } else {
      console.log(`Verified non-primary Neon sandbox branch "${result.branchName}".`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Sandbox database verification failed.");
    process.exitCode = 1;
  }
}

module.exports = { verifySandboxDatabase };
