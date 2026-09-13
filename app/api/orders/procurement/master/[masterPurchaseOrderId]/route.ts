import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { deleteMasterPurchaseOrder } from "@/lib/services/orders/master-purchase-order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function DELETE(request: Request, { params }: { params: Promise<{ masterPurchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    await deleteMasterPurchaseOrder(organization.id, (await params).masterPurchaseOrderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete Master Group." }, { status: 400 });
  }
}