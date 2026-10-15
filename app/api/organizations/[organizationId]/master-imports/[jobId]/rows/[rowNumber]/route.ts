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
    const relatedSizeGroupUpdate = isRecord(body) ? body.relatedSizeGroupUpdate : undefined;
    if (!Number.isSafeInteger(rowNumber) || rowNumber < 1
      || !isRecord(body) || !Object.hasOwn(body, "payload")
      || Object.keys(body).some((key) =>
        !["payload", "deferMatchingRevalidation", "relatedSizeGroupUpdate"].includes(key))
      || (body.deferMatchingRevalidation !== undefined
        && typeof body.deferMatchingRevalidation !== "boolean")
      || (relatedSizeGroupUpdate !== undefined
        && (!isRecord(relatedSizeGroupUpdate)
          || Object.keys(relatedSizeGroupUpdate).some((key) => !["name", "sizes"].includes(key))
          || typeof relatedSizeGroupUpdate.name !== "string"
          || !Array.isArray(relatedSizeGroupUpdate.sizes)
          || relatedSizeGroupUpdate.sizes.length === 0
          || relatedSizeGroupUpdate.sizes.some((size) => typeof size !== "string")))) {
      return NextResponse.json({ error: "Import row correction is invalid." }, { status: 400 });
    }
    const row = await saveMasterImportRow({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      rowNumber,
      payload: body.payload,
      ...(body.deferMatchingRevalidation === true ? { deferMatchingRevalidation: true } : {}),
      ...(isRecord(relatedSizeGroupUpdate)
        ? {
            relatedSizeGroupUpdate: {
              name: String(relatedSizeGroupUpdate.name),
              sizes: relatedSizeGroupUpdate.sizes as string[],
            },
          }
        : {}),
    });
    const { relatedRowNumbers, ...savedRow } = row;
    return NextResponse.json(
      body.deferMatchingRevalidation === true
        ? { row: savedRow, relatedRowNumbers: relatedRowNumbers ?? [] }
        : { row: savedRow },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return masterImportErrorResponse(error, "save-row");
  }
}
