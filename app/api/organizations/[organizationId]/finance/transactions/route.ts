import {
  FinanceDocumentStatus,
  FinanceDocumentType,
  FinanceSourceModule,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  encodeFinanceCursor,
  parseFinanceCursor,
  requireFinanceOrganizationAccess,
} from "@/lib/services/finance/finance-api-access";
import { listCentralFinanceTransactions } from "@/lib/services/finance/central-finance-query-service";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const DOCUMENT_STATUSES: readonly FinanceDocumentStatus[] = Object.values(FinanceDocumentStatus);
const DOCUMENT_TYPES: readonly FinanceDocumentType[] = Object.values(FinanceDocumentType);
const SOURCE_MODULES: readonly FinanceSourceModule[] = Object.values(FinanceSourceModule);

function failure(error: unknown) {
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Error && error.message.startsWith("Invalid pagination cursor.")) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Finance transactions request failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json({ error: "Unable to load finance transactions." }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim() ?? "";
    if (search.length > 100) {
      return NextResponse.json({ error: "Search must contain 100 characters or fewer." }, { status: 400 });
    }

    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawStatus = params.get("status");
    const rawDocumentType = params.get("documentType");
    const rawSourceModule = params.get("sourceModule");
    const status = rawStatus ? DOCUMENT_STATUSES.find((value) => value === rawStatus) : undefined;
    const documentType = rawDocumentType ? DOCUMENT_TYPES.find((value) => value === rawDocumentType) : undefined;
    const sourceModule = rawSourceModule ? SOURCE_MODULES.find((value) => value === rawSourceModule) : undefined;
    if (rawStatus && !status) {
      return NextResponse.json({ error: "Select a valid finance document status." }, { status: 400 });
    }
    if (rawDocumentType && !documentType) {
      return NextResponse.json({ error: "Select a valid finance document type." }, { status: 400 });
    }
    if (rawSourceModule && !sourceModule) {
      return NextResponse.json({ error: "Select a valid finance source module." }, { status: 400 });
    }
    const cursor = parseFinanceCursor<{ id: string; documentDate: Date }>(
      params.get("cursor"),
      "documentDate",
    );
    const result = await listCentralFinanceTransactions({
      organizationId: organization.id,
      search,
      status,
      documentType,
      sourceModule,
      take: limit,
      cursor,
    });
    return NextResponse.json({
      ...result,
      nextCursor: result.nextCursor ? encodeFinanceCursor(result.nextCursor) : null,
    });
  } catch (error) {
    return failure(error);
  }
}
