import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { createPurchaseBillFinishedGoodsStock, getPurchaseBill } from "@/lib/services/pos/purchase-bill-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; billId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, billId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_PURCHASE_RECORDS");
    return NextResponse.json({ bill: await getPurchaseBill(organization.id, billId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load purchase bill." },
      { status: error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400 },
    );
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
    await requireOrganizationPermission(user.id, organization.id, "CREATE_FINISHED_GOODS_STOCK");
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "create-stock") throw new Error("A valid stock action is required.");
    if (typeof body.locationId !== "string" || !body.locationId.trim() || body.locationId.length > 128) {
      throw new Error("Select an active location before approving this purchase bill.");
    }
    if (typeof body.storageNodeId !== "string" || !body.storageNodeId.trim() || body.storageNodeId.length > 128) {
      throw new Error("Select an active Sub-sub-location before creating POS stock.");
    }
    return NextResponse.json(await createPurchaseBillFinishedGoodsStock(
      organization.id,
      user.id,
      billId,
      body.locationId,
      body.storageNodeId.trim(),
    ));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create Finished Goods stock." },
      { status: error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400 },
    );
  }
}
