import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  authorizeMasterImportRequest,
  MasterImportServiceError,
} from "@/lib/services/master-data/master-import-service";

export type AuthorizedMasterImportRequest = {
  userId: string;
  organizationId: string;
};

export async function authorizeMasterImportRoute(publicOrganizationId: string) {
  const user = await getSessionUser();
  if (!user?.workspace_id) {
    return { authorized: false as const, response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) };
  }

  const authorization = await authorizeMasterImportRequest(user.id, user.workspace_id, publicOrganizationId);
  return {
    authorized: true as const,
    context: {
      userId: authorization.userId,
      organizationId: authorization.organizationId,
      uploaderDisplayName: user.full_name,
    },
  };
}

export function masterImportErrorResponse(error: unknown, operation: string) {
  if (error instanceof MasterImportServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const prismaCode = error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : typeof error === "object" && error !== null && "code" in error
      && typeof error.code === "string" && /^P\d{4}$/.test(error.code)
      ? error.code
      : null;
  if (prismaCode) {
    console.error("Master import request failed.", { operation, code: prismaCode });
    if (prismaCode === "P2021" || prismaCode === "P2022") {
      return NextResponse.json({ error: "Master import database migration is pending. Apply the approved migration before using this feature." }, { status: 503 });
    }
    if (prismaCode === "P2028") {
      const errorMessage = operation === "upload-chunk"
        ? "This upload paused before saving the next chunk. Resume it to continue; previously saved chunks are retained."
        : operation === "stage"
          ? "The workbook is saved, but staging timed out. Retry Stage workbook; saved master records were not changed."
          : operation === "complete-upload"
            ? "The upload chunks are saved, but finalization timed out. Resume the upload to finish safely."
            : "The database took too long to start this upload. Please retry.";
      return NextResponse.json({
        error: errorMessage,
      }, { status: 503 });
    }
  } else {
    console.error("Master import request failed.", { operation, code: "UNEXPECTED" });
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: "Unable to complete the master import request." }, { status: 500 });
}

export async function readBoundedRequestBody(request: Request, maximumBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredSize = Number(contentLength);
    if (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > maximumBytes) {
      throw new MasterImportServiceError("Workbook upload exceeds the permitted request size.", 413);
    }
  }

  if (!request.body) throw new MasterImportServiceError("Workbook upload is empty.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new MasterImportServiceError("Workbook upload exceeds the permitted request size.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function parseBoundedJson(request: Request, maximumBytes: number) {
  const body = await readBoundedRequestBody(request, maximumBytes);
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new MasterImportServiceError("Request body must contain valid JSON.", 400);
  }
}
