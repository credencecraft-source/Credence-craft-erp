import { NextResponse } from "next/server";

import {
  deleteMasterImportJob,
  getMasterImportJob,
  transitionMasterImportJob,
} from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  parseBoundedJson,
} from "../route-support";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const detail = await getMasterImportJob(authorization.context.organizationId, jobId);
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "get");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const body = await parseBoundedJson(request, 16 * 1024);
    if (!isRecord(body) || typeof body.status !== "string"
      || Object.keys(body).some((key) => !["status", "checkpoint"].includes(key))) {
      return NextResponse.json({ error: "Import status request is invalid." }, { status: 400 });
    }
    const job = await transitionMasterImportJob({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      status: body.status,
      ...(Object.hasOwn(body, "checkpoint") ? { checkpoint: body.checkpoint } : {}),
    });
    return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "transition");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const result = await deleteMasterImportJob({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "delete");
  }
}
