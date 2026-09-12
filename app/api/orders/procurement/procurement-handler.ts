import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  createGroupedPurchaseOrder,
  listAllocatableBomRows,
  listGroupedPurchaseOrders,
} from "@/lib/services/orders/grouped-purchase-order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });

    const organization = await requireOrganizationContext(user.id, organizationId);
    const view = url.searchParams.get("view") ?? "price-approval";
    if (view === "allocatable") {
      return NextResponse.json({ bomRows: await listAllocatableBomRows(organization.id) });
    }

    const status = view === "all" ? undefined : "PENDING_PRICE_APPROVAL";
    return NextResponse.json({ groupedPurchaseOrders: await listGroupedPurchaseOrders(organization.id, status) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load procurement records." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const organizationId = String(body.organizationId ?? "");
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const groupedPurchaseOrder = await createGroupedPurchaseOrder({
      organizationId: organization.id,
      vendorId: String(body.vendorId ?? ""),
      submittedBy: user.full_name || user.email,
      lines: Array.isArray(body.lines)
        ? body.lines.map((line: { bomItemId?: unknown; groupedQty?: unknown }) => ({ bomItemId: String(line.bomItemId ?? ""), groupedQty: line.groupedQty as number | string }))
        : [],
    });
    return NextResponse.json({ ok: true, groupedPurchaseOrder }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create grouped purchase order." }, { status: 400 });
  }
}
