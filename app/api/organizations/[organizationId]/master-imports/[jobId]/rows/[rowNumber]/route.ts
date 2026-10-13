import { NextResponse } from "next/server";

import { saveMasterImportRow } from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  parseBoundedJson,
} from "../../../route-support";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string; rowNumber: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId, rowNumber: rawRowNumber } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;

    const rowNumber = Number(rawRowNumber);
    const body = await parseBoundedJson(request, 160 * 1024);
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 1
      || !isRecord(body) || !Object.hasOwn(body, "payload")
      || Object.keys(body).some((key) => key !== "payload")) {
      return NextResponse.json({ error: "Import row correction is invalid." }, { status: 400 });
    }
    const row = await saveMasterImportRow({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      rowNumber,
      payload: body.payload,
    });
    return NextResponse.json({ row }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "save-row");
  }
}
