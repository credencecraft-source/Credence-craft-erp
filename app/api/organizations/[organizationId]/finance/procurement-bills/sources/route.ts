import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";
import {
  listEligibleVendorBillPurchaseOrders,
  listEligibleVendorBillReceiptLines,
} from "@/lib/services/finance/procurement-vendor-bill-service";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
    await requireOrganizationPermission(user.id, organization.id, "CREATE_PROCUREMENT_VENDOR_BILL");
    const purchaseOrderId = new URL(request.url).searchParams.get("purchaseOrderId");
    if (purchaseOrderId && purchaseOrderId.length > 100) {
      return NextResponse.json({ error: "Purchase Order ID is invalid." }, { status: 400 });
    }
    if (purchaseOrderId) {
      return NextResponse.json({
        lines: await listEligibleVendorBillReceiptLines(organization.id, purchaseOrderId),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({
      purchaseOrders: await listEligibleVendorBillPurchaseOrders(organization.id),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Procurement bill source lookup failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load eligible Purchase Orders or GRN lines." }, { status: 500 });
  }
}
