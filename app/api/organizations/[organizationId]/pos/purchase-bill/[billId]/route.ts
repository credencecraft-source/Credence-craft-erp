import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { createPurchaseBillFinishedGoodsStock, getPurchaseBill } from "@/lib/services/pos/purchase-bill-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; billId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, billId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    return NextResponse.json({ bill: await getPurchaseBill(organization.id, billId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load purchase bill." }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; billId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, billId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "create-stock") throw new Error("A valid stock action is required.");
    if (typeof body.locationId !== "string" || !body.locationId.trim() || body.locationId.length > 128) {
      throw new Error("Select an active location before approving this purchase bill.");
    }
    return NextResponse.json(await createPurchaseBillFinishedGoodsStock(
      organization.id,
      user.id,
      billId,
      body.locationId,
    ));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Finished Goods stock." }, { status: 400 });
  }
}
