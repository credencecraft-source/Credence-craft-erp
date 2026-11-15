import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  createPosSalesReturn,
  listPosSalesReturns,
  parsePosSalesReturnCursor,
  PosSalesReturnError,
} from "@/lib/services/pos/pos-sales-return-service";

const MAX_PAGE_SIZE = 50;
const REFUND_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim() ?? "";
    if (search.length > 100) {
      return NextResponse.json({ error: "Sales return search must contain 100 characters or fewer." }, { status: 400 });
    }
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? 25 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawCursor = params.get("cursor");
    const cursor = rawCursor ? parsePosSalesReturnCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: "Invalid sales return pagination cursor." }, { status: 400 });
    }
    const result = await listPosSalesReturns({
      organizationId: organization.id,
      search,
      take: limit,
      cursor,
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Unable to load sales returns." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    await requireOrganizationPermission(user.id, organization.id, "CREATE_POS_SALES_RETURNS");
    const body: unknown = await request.json();
    if (!isRecord(body) || !Array.isArray(body.lines)) {
      return NextResponse.json({ error: "Invoice and return item details are required." }, { status: 400 });
    }
    const invoiceNumber = body.invoiceNumber;
    const requestKey = body.requestKey;
    const reason = body.reason;
    const settlementType = body.settlementType;
    const refundMethod = body.refundMethod ?? null;
    if (
      typeof invoiceNumber !== "string"
      || typeof requestKey !== "string"
      || typeof reason !== "string"
      || (settlementType !== "STORE_CREDIT" && settlementType !== "REFUND")
      || (refundMethod !== null && typeof refundMethod !== "string")
    ) {
      return NextResponse.json({ error: "Enter the invoice, request key, return reason, and settlement method." }, { status: 400 });
    }
    const validRefundMethod = REFUND_METHODS.find((method) => method === refundMethod) ?? null;
    if (settlementType === "REFUND" && !validRefundMethod) {
      return NextResponse.json({ error: "Select a valid refund payment method." }, { status: 400 });
    }
    if (settlementType === "STORE_CREDIT" && refundMethod !== null) {
      return NextResponse.json({ error: "A refund payment method is only valid for a refund." }, { status: 400 });
    }
    const lines = body.lines.map((value) => {
      if (!isRecord(value)) return null;
      return { invoiceLineId: value.invoiceLineId, quantity: value.quantity };
    });
    if (lines.some((line) =>
      !line
      || typeof line.invoiceLineId !== "string"
      || typeof line.quantity !== "number",
    )) {
      return NextResponse.json({ error: "Each returned item must include its invoice line and quantity." }, { status: 400 });
    }

    const result = await createPosSalesReturn({
      organizationId: organization.id,
      actorId: user.id,
      invoiceNumber,
      requestKey,
      reason,
      settlementType,
      refundMethod: validRefundMethod,
      lines: lines as Array<{ invoiceLineId: string; quantity: number }>,
    });
    return NextResponse.json(
      { salesReturn: result },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof PosSalesReturnError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (
      error instanceof Error
      && "code" in error
      && (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json(
        { error: "This invoice or its stock changed while the return was being posted. Refresh and retry." },
        { status: 409 },
      );
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: "You do not have permission to create POS sales returns." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to post the sales return." }, { status: 500 });
  }
}
