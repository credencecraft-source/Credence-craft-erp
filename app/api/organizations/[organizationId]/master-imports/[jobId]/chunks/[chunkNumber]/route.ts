import { NextResponse } from "next/server";

import {
  MASTER_IMPORT_UPLOAD_CHUNK_BYTES,
  saveMasterImportFileChunk,
} from "@/lib/services/master-data/master-import-service";
import {
  authorizeMasterImportRoute,
  masterImportErrorResponse,
  readBoundedRequestBody,
} from "../../../route-support";

export async function PUT(
  request: Request,
  context: { params: Promise<{ organizationId: string; jobId: string; chunkNumber: string }> },
) {
  try {
    const { organizationId: publicOrganizationId, jobId, chunkNumber } = await context.params;
    const authorization = await authorizeMasterImportRoute(publicOrganizationId);
    if (!authorization.authorized) return authorization.response;
    if (!/^(0|[1-9]\d*)$/.test(chunkNumber)) {
      return NextResponse.json({ error: "Workbook chunk number is invalid." }, { status: 400 });
    }
    if (request.headers.get("content-type")?.toLowerCase() !== "application/octet-stream") {
      return NextResponse.json({ error: "Workbook chunk must use the binary upload format." }, { status: 415 });
    }
    const chunkBytes = await readBoundedRequestBody(request, MASTER_IMPORT_UPLOAD_CHUNK_BYTES);
    const result = await saveMasterImportFileChunk({
      organizationId: authorization.context.organizationId,
      actorUserId: authorization.context.userId,
      jobId,
      chunkIndex: Number(chunkNumber),
      chunkBytes,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return masterImportErrorResponse(error, "upload-chunk");
  }
}
