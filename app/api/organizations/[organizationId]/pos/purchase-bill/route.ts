import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { createPurchaseBill, listPurchaseBills } from "@/lib/services/pos/purchase-bill-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING"]);
    return NextResponse.json({ bills: await listPurchaseBills(organization.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load purchase bills." }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE"]);
    const body = await request.json() as Record<string, unknown>;
    const result = await createPurchaseBill(organization.id, user.id, {
      vendorId: String(body.vendorId ?? ""),
      billNumber: String(body.billNumber ?? ""),
      billDate: String(body.billDate ?? ""),
      taxMode: body.taxMode === "INTERSTATE" ? "INTERSTATE" : "LOCAL",
      recordIds: Array.isArray(body.recordIds) ? body.recordIds.map(String) : [],
    });
    return NextResponse.json({ bill: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to post purchase bill." }, { status: 400 });
  }
}
