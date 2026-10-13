import { NextResponse } from "next/server";

import { stageMasterImportJob } from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
} from "../../route-support";

export async function POST(
  _request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const result = await stageMasterImportJob({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "stage");
  }
}
