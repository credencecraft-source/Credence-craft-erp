import { NextResponse } from "next/server";

import { validateMasterImportJob } from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  parseBoundedJson,
} from "../../route-support";

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const body = await parseBoundedJson(request, 4 * 1024);
    if (typeof body !== "object" || body === null || Array.isArray(body)
      || Object.keys(body).some((key) => !["rowNumber", "batchSize"].includes(key))) {
      return NextResponse.json({ error: "Validation request is invalid." }, { status: 400 });
    }
    const requestBody = body as Record<string, unknown>;
    const rowNumber = requestBody.rowNumber;
    const batchSize = requestBody.batchSize;
    if ((rowNumber !== undefined && (!Number.isSafeInteger(rowNumber) || Number(rowNumber) < 1))
      || (batchSize !== undefined && (!Number.isSafeInteger(batchSize) || Number(batchSize) < 1 || Number(batchSize) > 1_000))) {
      return NextResponse.json({ error: "Validation batch or row number is invalid." }, { status: 400 });
    }
    const result = await validateMasterImportJob({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      ...(rowNumber !== undefined ? { rowNumber: Number(rowNumber) } : {}),
      ...(batchSize !== undefined ? { batchSize: Number(batchSize) } : {}),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "validate");
  }
}
