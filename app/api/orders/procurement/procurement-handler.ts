import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  createGroupedPurchaseOrder,
  getProcurementSummary,
  listAllocatableBomRowsPage,
  listGroupedPurchaseOrders,
  listGroupedPurchaseOrdersPage,
} from "@/lib/services/orders/grouped-purchase-order-service";
import { createMasterPurchaseOrder, listMasterPurchaseOrdersPage } from "@/lib/services/orders/master-purchase-order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });

    const organization = await requireOrganizationContext(user.id, organizationId);
    const view = url.searchParams.get("view") ?? "price-approval";
    if (view === "summary") {
      return NextResponse.json(await getProcurementSummary(organization.id));
    }
    if (view === "allocatable") {
      const limitValue = Number(url.searchParams.get("limit") ?? 100);
      return NextResponse.json(await listAllocatableBomRowsPage(organization.id, {
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: Number.isFinite(limitValue) ? limitValue : 100,
      }));
    }

    if (view === "all") {
      return NextResponse.json({ groupedPurchaseOrders: await listGroupedPurchaseOrders(organization.id) });
    }
    const status = ["PENDING_PRICE_APPROVAL", "PRICE_APPROVED"];
    const limitValue = Number(url.searchParams.get("limit") ?? 50);
    const pageInput = {
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: Number.isFinite(limitValue) ? limitValue : 50,
    };
    const include = url.searchParams.get("include") ?? "both";
    const groupedPagePromise = include !== "master"
      ? listGroupedPurchaseOrdersPage(organization.id, status, pageInput)
      : Promise.resolve(null);
    const masterPagePromise = view === "create" && include !== "grouped"
      ? listMasterPurchaseOrdersPage(organization.id, {
          cursor: url.searchParams.get("masterCursor") ?? undefined,
          limit: Number.isFinite(limitValue) ? limitValue : 50,
        })
      : Promise.resolve(null);
    const [groupedPage, masterPage] = await Promise.all([groupedPagePromise, masterPagePromise]);
    return NextResponse.json({
      ...(groupedPage ? { ...groupedPage, nextGroupedCursor: groupedPage.nextCursor } : {}),
      ...(masterPage ? { ...masterPage, nextMasterCursor: masterPage.nextCursor } : {}),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load procurement records." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const organizationId = String(body.organizationId ?? "");
    if (body.action === "master-group") {
      const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
      const masterPurchaseOrder = await createMasterPurchaseOrder(
        organization.id,
        Array.isArray(body.groupedPurchaseOrderIds) ? body.groupedPurchaseOrderIds.map((id: unknown) => String(id)) : [],
        user.full_name || user.email,
      );
      return NextResponse.json({ ok: true, masterPurchaseOrder }, { status: 201 });
    }
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const groupedPurchaseOrder = await createGroupedPurchaseOrder({
      organizationId: organization.id,
      vendorId: String(body.vendorId ?? ""),
      submittedBy: user.full_name || user.email,
      submittedByUserId: user.id,
      lines: Array.isArray(body.lines)
        ? body.lines.map((line: { bomItemId?: unknown; groupedQty?: unknown }) => ({ bomItemId: String(line.bomItemId ?? ""), groupedQty: line.groupedQty as number | string }))
        : [],
    });
    return NextResponse.json({ ok: true, groupedPurchaseOrder }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create grouped purchase order." }, { status: 400 });
  }
}
