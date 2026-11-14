const SANDBOX_BRANCH_NAME = /^credencecraft-sandbox-(?:test-branch|pr-\d+)$/;
const NEON_BRANCH_ID = /^br-[a-z0-9-]+$/;
const NEON_PROJECT_ID = /^[a-z0-9-]+$/;

async function verifyNeonBranch({
  apiKey,
  branchId,
  expectedBranchName,
  fetchImpl = fetch,
  projectId,
}) {
  if (!apiKey || !NEON_BRANCH_ID.test(branchId ?? "") || !NEON_PROJECT_ID.test(projectId ?? "")) {
    throw new Error("Neon sandbox branch verification is missing required identifiers.");
  }

  if (!SANDBOX_BRANCH_NAME.test(expectedBranchName ?? "")) {
    throw new Error("Neon sandbox branch name is not allowed.");
  }

  let response;
  try {
    response = await fetchImpl(
      `https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}/branches/${encodeURIComponent(branchId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
  } catch {
    throw new Error("Unable to verify the Neon sandbox branch with the Neon API.");
  }

  if (!response.ok) {
    throw new Error(`Neon sandbox branch verification failed (HTTP ${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Neon returned an invalid sandbox branch response.");
  }

  const branch = payload?.branch;
  if (
    branch?.id !== branchId
    || branch?.project_id !== projectId
    || branch?.name !== expectedBranchName
    || branch?.primary !== false
    || branch?.default !== false
  ) {
    throw new Error("Neon branch is primary, default, mismatched, or not a verified sandbox branch.");
  }

  return { id: branch.id, name: branch.name, projectId: branch.project_id };
}

if (require.main === module) {
  verifyNeonBranch({
    apiKey: process.env.NEON_API_KEY,
    branchId: process.env.NEON_BRANCH_ID,
    expectedBranchName: process.env.NEON_BRANCH_NAME,
    projectId: process.env.NEON_PROJECT_ID,
  }).then(({ name }) => {
    console.log(`Verified non-primary Neon sandbox branch "${name}".`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : "Neon sandbox branch verification failed.");
    process.exitCode = 1;
  });
}

module.exports = { verifyNeonBranch };
