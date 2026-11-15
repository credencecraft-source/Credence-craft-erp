import { NextResponse } from "next/server";

import {
  commitNextMasterImportRow,
  getMasterImportCommitLookupIndex,
} from "@/lib/services/master-data/master-import-service";
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
    const body: unknown = await parseBoundedJson(request, 4 * 1024);
    if (typeof body !== "object" || body === null || Array.isArray(body)
      || Object.keys(body).some((key) => !["batchSize", "rowNumbers"].includes(key))) {
      return NextResponse.json({ error: "Import request is invalid." }, { status: 400 });
    }
    const batchSize = "batchSize" in body ? body.batchSize : undefined;
    const rowNumbers = "rowNumbers" in body ? body.rowNumbers : undefined;
    if (batchSize !== undefined && rowNumbers !== undefined) {
      return NextResponse.json({ error: "Choose either a batch size or selected rows." }, { status: 400 });
    }
    if (batchSize !== undefined && (!Number.isSafeInteger(batchSize) || Number(batchSize) < 1 || Number(batchSize) > 25)) {
      return NextResponse.json({ error: "Import batch size must be between 1 and 25." }, { status: 400 });
    }
    if (rowNumbers !== undefined && (!Array.isArray(rowNumbers)
      || rowNumbers.length < 1
      || rowNumbers.length > 25
      || rowNumbers.some((rowNumber) => !Number.isSafeInteger(rowNumber) || Number(rowNumber) < 1)
      || new Set(rowNumbers).size !== rowNumbers.length)) {
      return NextResponse.json({ error: "Select between 1 and 25 unique workbook rows to import." }, { status: 400 });
    }
    const lookupIndex = await getMasterImportCommitLookupIndex(
      authorization.context.organizationId,
      jobId,
    );

    if (rowNumbers !== undefined) {
      let result: Awaited<ReturnType<typeof commitNextMasterImportRow>> | null = null;
      for (const rowNumber of rowNumbers as number[]) {
        result = await commitNextMasterImportRow({
          organizationId: authorization.context.organizationId,
          actorUserId: authorization.context.userId,
          jobId,
          rowNumber,
          ...(lookupIndex ? { lookupIndex } : {}),
        });
        if (result.row === null || result.row.status === "FAILED"
          || result.job.status === "COMPLETED" || result.job.status === "FAILED") break;
      }
      if (!result) throw new Error("Selected import batch did not process a row.");
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    let result: Awaited<ReturnType<typeof commitNextMasterImportRow>> | null = null;
    for (let index = 0; index < (batchSize === undefined ? 10 : Number(batchSize)); index += 1) {
      result = await commitNextMasterImportRow({
        organizationId: authorization.context.organizationId,
        actorUserId: authorization.context.userId,
        jobId,
        ...(lookupIndex ? { lookupIndex } : {}),
      });
      if (result.row === null || result.row.status === "FAILED"
        || result.job.status === "COMPLETED" || result.job.status === "FAILED"
        || result.job.status === "STAGED") break;
    }
    if (!result) throw new Error("Import batch did not process a row.");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "commit");
  }
}
