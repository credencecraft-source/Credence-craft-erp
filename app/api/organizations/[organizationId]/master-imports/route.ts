import { NextResponse } from "next/server";

import {
  createMasterImportJob,
  listMasterImportJobs,
  resumeMasterImportJob,
} from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  parseBoundedJson,
} from "./route-support";

const MAX_LIST_LIMIT = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;

    const query = new URL(request.url).searchParams;
    const rawLimit = query.get("limit");
    const rawOffset = query.get("offset");
    const limit = rawLimit === null ? 100 : Number(rawLimit);
    const offset = rawOffset === null ? 0 : Number(rawOffset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT
      || !Number.isSafeInteger(offset) || offset < 0) {
      return NextResponse.json({ error: "Import history pagination is invalid." }, { status: 400 });
    }
    const jobs = await listMasterImportJobs(authorization.context.organizationId, { skip: offset, take: limit });
    return NextResponse.json({ jobs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;

    const body = await parseBoundedJson(request, 16 * 1024);
    if (!isRecord(body)
      || Object.keys(body).some((key) =>
        !["moduleKey", "uploadedFileName", "uploadedFileSize", "sourceSha256", "jobId"].includes(key),
      )
      || typeof body.uploadedFileName !== "string"
      || typeof body.uploadedFileSize !== "number"
      || typeof body.sourceSha256 !== "string"
      || (body.jobId !== undefined && typeof body.jobId !== "string")) {
      return NextResponse.json({ error: "Workbook upload details are invalid." }, { status: 400 });
    }
    if (body.jobId !== undefined) {
      const job = await resumeMasterImportJob({
        organizationId: authorization.context.organizationId,
        jobId: body.jobId,
        uploadedFileName: body.uploadedFileName,
        uploadedFileSize: body.uploadedFileSize,
        sourceSha256: body.sourceSha256,
      });
      return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
    }
    const job = await createMasterImportJob({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      uploaderDisplayName: authorization.context.uploaderDisplayName,
      moduleKey: body.moduleKey,
      uploadedFileName: body.uploadedFileName,
      uploadedFileSize: body.uploadedFileSize,
      sourceSha256: body.sourceSha256,
    });
    return NextResponse.json({ job }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "create");
  }
}
