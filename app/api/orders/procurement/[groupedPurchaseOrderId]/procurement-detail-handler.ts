import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  approveGroupedPurchaseOrder,
  rejectGroupedPurchaseOrder,
  updateGroupedPurchaseOrderPrices,
} from "@/lib/services/orders/grouped-purchase-order-service";
import { updateGroupedPurchaseOrderHeader } from "@/lib/services/orders/grouped-purchase-order-header-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ groupedPurchaseOrderId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { groupedPurchaseOrderId } = await params;
    const body = await request.json();
    const organizationId = String(body.organizationId ?? "");
    const action = String(body.action ?? "save-prices");

    if (action === "approve" || action === "reject") {
      const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "APPROVER"]);
      if (action === "approve") {
        if (Array.isArray(body.prices) && body.prices.length > 0) {
          await updateGroupedPurchaseOrderPrices(
            organization.id,
            groupedPurchaseOrderId,
            body.prices.map((price: { lineId?: unknown; vendorPrice?: unknown }) => ({
              lineId: String(price.lineId ?? ""),
              vendorPrice: price.vendorPrice as number | string,
            })),
          );
        }
        const groupedPurchaseOrder = await approveGroupedPurchaseOrder(organization.id, groupedPurchaseOrderId, user.full_name || user.email);
        return NextResponse.json({ ok: true, groupedPurchaseOrder });
      }
      return NextResponse.json(await rejectGroupedPurchaseOrder(organization.id, groupedPurchaseOrderId, String(body.reason ?? "")));
    }

    if (action === "update-header") {
      const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING", "APPROVER"]);
      const groupedPurchaseOrder = await updateGroupedPurchaseOrderHeader(organization.id, groupedPurchaseOrderId, {
        note: body.note,
        vendorPriceInr: body.vendorPriceInr,
        vendorPrice: body.vendorPrice,
        otherChargesInr: body.otherChargesInr,
        convertValue: body.convertValue,
        roundOf: body.roundOf,
        moqStockUom: body.moqStockUom,
        buyingUom: body.buyingUom,
      });
      return NextResponse.json({ ok: true, groupedPurchaseOrder });
    }

    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING", "APPROVER"]);
    const groupedPurchaseOrder = await updateGroupedPurchaseOrderPrices(
      organization.id,
      groupedPurchaseOrderId,
      Array.isArray(body.prices)
        ? body.prices.map((price: { lineId?: unknown; vendorPrice?: unknown }) => ({ lineId: String(price.lineId ?? ""), vendorPrice: price.vendorPrice as number | string }))
        : [],
    );
    return NextResponse.json({ ok: true, groupedPurchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update grouped purchase order." }, { status: 400 });
  }
}
