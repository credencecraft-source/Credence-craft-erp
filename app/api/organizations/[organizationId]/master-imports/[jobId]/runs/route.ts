import { NextResponse } from "next/server";

import {
  enqueueMasterImportRun,
  getActiveMasterImportRun,
  type MasterImportRunOperation,
} from "@/lib/services/master-data/master-import-run-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  parseBoundedJson,
} from "../../route-support";

const OPERATIONS: MasterImportRunOperation[] = ["STAGE", "VALIDATE", "PLAN", "IMPORT_PLAN", "IMPORT_ALL"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const body: unknown = await parseBoundedJson(request, 256 * 1024);
    if (!isRecord(body)
      || typeof body.operation !== "string"
      || !OPERATIONS.includes(body.operation as MasterImportRunOperation)
      || Object.keys(body).some((key) => !["operation", "rowNumbers", "take", "planNumber"].includes(key))) {
      return NextResponse.json({ error: "Background import request is invalid." }, { status: 400 });
    }
    const rowNumbers = body.rowNumbers;
    if (rowNumbers !== undefined && (!Array.isArray(rowNumbers)
      || rowNumbers.some((value) => !Number.isSafeInteger(value) || Number(value) < 1))) {
      return NextResponse.json({ error: "Selected workbook rows are invalid." }, { status: 400 });
    }
    if (body.take !== undefined && (!Number.isSafeInteger(body.take) || Number(body.take) < 1)) {
      return NextResponse.json({ error: "Validation batch size is invalid." }, { status: 400 });
    }
    if (body.planNumber !== undefined
      && (!Number.isSafeInteger(body.planNumber) || Number(body.planNumber) < 1)) {
      return NextResponse.json({ error: "Import plan number is invalid." }, { status: 400 });
    }

    const result = await enqueueMasterImportRun({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      operation: body.operation as MasterImportRunOperation,
      ...(rowNumbers !== undefined ? { rowNumbers: rowNumbers as number[] } : {}),
      ...(body.take !== undefined ? { take: Number(body.take) } : {}),
      ...(body.planNumber !== undefined ? { planNumber: Number(body.planNumber) } : {}),
    });
    return NextResponse.json(result, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return masterImportErrorResponse(error, "queue");
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const result = await getActiveMasterImportRun(authorization.context.organizationId, jobId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "get-run");
  }
}
