import { NextResponse } from "next/server";

import {
  cancelMasterImportRun,
  getMasterImportRun,
} from "@/lib/services/master-data/master-import-run-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
} from "../../../route-support";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string; runId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId, runId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const result = await getMasterImportRun(authorization.context.organizationId, runId);
    if (result.run.jobId !== jobId) {
      return NextResponse.json({ error: "Import run does not belong to this job." }, { status: 404 });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "get-run");
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string; runId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId, runId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const result = await cancelMasterImportRun({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      runId,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "cancel-run");
  }
}
