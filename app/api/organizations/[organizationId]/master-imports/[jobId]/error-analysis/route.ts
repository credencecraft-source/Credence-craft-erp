import { NextResponse } from "next/server";

import { getMasterImportErrorGroupAction } from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  parseBoundedJson,
} from "../../route-support";

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

    const body: unknown = await parseBoundedJson(request, 8 * 1024);
    if (!isRecord(body)
      || typeof body.reason !== "string"
      || body.reason.trim().length === 0
      || body.reason.length > 2_000
      || Object.keys(body).some((key) => key !== "reason")) {
      return NextResponse.json({ error: "Select a valid error reason." }, { status: 400 });
    }

    const result = await getMasterImportErrorGroupAction(
      authorization.context.organizationId,
      jobId,
      body.reason,
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "get-error-group-action");
  }
}
