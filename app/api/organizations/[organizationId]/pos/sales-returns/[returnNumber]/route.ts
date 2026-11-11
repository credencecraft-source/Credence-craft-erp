import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  getPosSalesReturn,
  markPosSalesReturnRefunded,
  PosSalesReturnError,
} from "@/lib/services/pos/pos-sales-return-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; returnNumber: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, returnNumber } = await context.params;
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    const record = await getPosSalesReturn(organization.id, returnNumber);
    if (!record) return NextResponse.json({ error: "Sales return was not found." }, { status: 404 });
    return NextResponse.json({ salesReturn: record });
  } catch (error) {
    if (error instanceof PosSalesReturnError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unable to load the sales return." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; returnNumber: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, returnNumber } = await context.params;
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "FINANCE"],
    );
    await requireOrganizationPermission(user.id, organization.id, "SETTLE_POS_SALES_RETURN_REFUNDS");
    const body: unknown = await request.json();
    if (!isRecord(body) || ("reference" in body && body.reference !== null && typeof body.reference !== "string")) {
      return NextResponse.json({ error: "Enter a valid refund reference." }, { status: 400 });
    }
    const result = await markPosSalesReturnRefunded({
      organizationId: organization.id,
      actorId: user.id,
      returnNumber,
      reference: typeof body.reference === "string" ? body.reference : null,
    });
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof PosSalesReturnError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: "You do not have permission to settle POS sales-return refunds." }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to update the sales-return refund." }, { status: 500 });
  }
}
