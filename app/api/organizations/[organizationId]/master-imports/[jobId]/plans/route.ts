import { NextResponse } from "next/server";

import {
  createMasterImportPlans,
  MASTER_IMPORT_PLAN_SIZE,
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

    let rowNumbers: number[] | undefined;
    if (request.body) {
      const body: unknown = await parseBoundedJson(request, 4 * 1024);
      if (typeof body !== "object" || body === null || Array.isArray(body)
        || Object.keys(body).some((key) => key !== "rowNumbers")) {
        return NextResponse.json({ error: "Import plan request is invalid." }, { status: 400 });
      }
      const value = (body as Record<string, unknown>).rowNumbers;
      if (!Array.isArray(value) || value.length < 1 || value.length > MASTER_IMPORT_PLAN_SIZE
        || value.some((rowNumber) => !Number.isSafeInteger(rowNumber) || Number(rowNumber) < 1)
        || new Set(value).size !== value.length) {
        return NextResponse.json({ error: "Select valid rows to plan." }, { status: 400 });
      }
      rowNumbers = value as number[];
    }

    const result = await createMasterImportPlans({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      ...(rowNumbers ? { rowNumbers } : {}),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "create plans");
  }
}
