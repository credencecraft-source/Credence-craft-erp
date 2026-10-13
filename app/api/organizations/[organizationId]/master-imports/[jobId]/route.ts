import { NextResponse } from "next/server";

import {
  deleteMasterImportJob,
  getMasterImportJob,
  MASTER_IMPORT_REPORT_PAGE_SIZE,
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

const REPORT_TABS = ["staged", "validated", "errors", "created", "planned"] as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    const query = new URL(request.url).searchParams;
    if (query.size === 0) {
      const detail = await getMasterImportJob(authorization.context.organizationId, jobId);
      return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
    }
    const rawLimit = query.get("limit");
    const rawOffset = query.get("offset");
    const limit = rawLimit === null ? MASTER_IMPORT_REPORT_PAGE_SIZE : Number(rawLimit);
    const offset = rawOffset === null ? 0 : Number(rawOffset);
    const tab = query.get("tab") ?? "staged";
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MASTER_IMPORT_REPORT_PAGE_SIZE
      || !Number.isSafeInteger(offset) || offset < 0
      || !REPORT_TABS.includes(tab as (typeof REPORT_TABS)[number])) {
      return NextResponse.json({ error: "Import report pagination is invalid." }, { status: 400 });
    }
    const detail = await getMasterImportJob(authorization.context.organizationId, jobId, {
      skip: offset,
      take: limit,
      tab: tab as (typeof REPORT_TABS)[number],
    });
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
