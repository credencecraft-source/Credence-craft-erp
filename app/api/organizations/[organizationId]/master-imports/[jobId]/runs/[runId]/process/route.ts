import { NextResponse } from "next/server";

import {
  getMasterImportRun,
  runMasterImportWorkerBatch,
} from "@/lib/services/master-data/master-import-run-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
} from "../../../../route-support";

export async function POST(
  _request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string; runId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId, runId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;

    const before = await getMasterImportRun(authorization.context.organizationId, runId);
    if (before.run.jobId !== jobId) {
      return NextResponse.json({ error: "Import run does not belong to this job." }, { status: 404 });
    }

    const worker = await runMasterImportWorkerBatch({
      organizationId: authorization.context.organizationId,
      jobId,
      runId,
      timeBudgetMs: 8_000,
    });
    const result = await getMasterImportRun(authorization.context.organizationId, runId);
    return NextResponse.json({ ...result, worker }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "process-run");
  }
}
