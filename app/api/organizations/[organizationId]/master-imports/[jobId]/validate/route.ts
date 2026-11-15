import { NextResponse } from "next/server";

import {
  MASTER_IMPORT_VALIDATION_BATCH_SIZE,
  validateMasterImportJob,
} from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  parseBoundedJson,
} from "../../route-support";

function isRowNumberList(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= MASTER_IMPORT_VALIDATION_BATCH_SIZE
    && value.every((rowNumber: unknown) =>
      typeof rowNumber === "number" && Number.isSafeInteger(rowNumber) && rowNumber > 0)
    && new Set(value).size === value.length;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const body = await parseBoundedJson(request, 256 * 1024);
    if (typeof body !== "object" || body === null || Array.isArray(body)
      || Object.keys(body).some((key) => !["rowNumber", "rowNumbers", "take"].includes(key))) {
      return NextResponse.json({ error: "Validation request is invalid." }, { status: 400 });
    }
    const requestBody = body as Record<string, unknown>;
    const rowNumber = requestBody.rowNumber;
    const rowNumbers = requestBody.rowNumbers;
    const take = requestBody.take;
    if ((rowNumber !== undefined && (!Number.isSafeInteger(rowNumber) || Number(rowNumber) < 1))
      || (rowNumbers !== undefined && !isRowNumberList(rowNumbers))
      || (take !== undefined && (!Number.isSafeInteger(take) || Number(take) < 1
        || Number(take) > MASTER_IMPORT_VALIDATION_BATCH_SIZE))
      || [rowNumber, rowNumbers, take].filter((selection) => selection !== undefined).length !== 1) {
      return NextResponse.json({ error: "Select valid staged rows to validate." }, { status: 400 });
    }
    const result = await validateMasterImportJob({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      ...(rowNumber !== undefined ? { rowNumber: Number(rowNumber) } : {}),
      ...(rowNumbers !== undefined ? { rowNumbers } : {}),
      ...(take !== undefined ? { take: Number(take) } : {}),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "validate");
  }
}
