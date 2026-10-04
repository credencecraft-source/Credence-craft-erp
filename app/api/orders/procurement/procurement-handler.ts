import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  approveGeneralPurchaseOrderPrice,
  createGeneralPurchaseOrder,
  createGeneralPurchaseOrderRequests,
  listGeneralPurchaseOrderRequests,
  saveGeneralPurchaseOrderPrice,
} from "@/lib/services/orders/general-purchase-order-service";
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
    if (view === "general-po") {
      const statusParameter = url.searchParams.get("status");
      const requestedStatuses = statusParameter?.split(",").map((status) => status.trim());
      const allowedStatuses = ["PENDING_PRICE_APPROVAL", "PRICE_APPROVED", "PO_CREATED"];
      if (requestedStatuses && (!requestedStatuses.length || requestedStatuses.some((status) => !allowedStatuses.includes(status)))) {
        return NextResponse.json({ error: "One or more General PO statuses are invalid." }, { status: 400 });
      }
      const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
      return NextResponse.json({
        ...await listGeneralPurchaseOrderRequests(organization.id, requestedStatuses, {
          cursor: url.searchParams.get("cursor") ?? undefined,
          limit: Number.isFinite(requestedLimit) ? requestedLimit : 50,
        }),
      });
    }
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
    if (body.action === "create-general-requests") {
      const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
      const generalPurchaseOrderRequests = await createGeneralPurchaseOrderRequests(
        organization.id,
        Array.isArray(body.requests)
          ? body.requests.map((item: { rawMaterialId?: unknown; quantity?: unknown }) => ({
              rawMaterialId: String(item.rawMaterialId ?? ""),
              quantity: item.quantity as number | string,
            }))
          : [],
        user.full_name,
        user.id,
      );
      return NextResponse.json({ ok: true, generalPurchaseOrderRequests }, { status: 201 });
    }
    if (body.action === "save-general-price") {
      const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
      await saveGeneralPurchaseOrderPrice(
        organization.id,
        String(body.requestId ?? ""),
        {
          vendorId: String(body.vendorId ?? ""),
          vendorPrice: body.vendorPrice as number | string,
          quantity: body.quantity as number | string,
          gstMasterId: body.gstMasterId ? String(body.gstMasterId) : null,
          hsnCode: body.hsnCode ? String(body.hsnCode) : null,
        },
        user.id,
      );
      return NextResponse.json({ ok: true });
    }
    if (body.action === "approve-general-price") {
      const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
      const result = await approveGeneralPurchaseOrderPrice(
        organization.id,
        String(body.requestId ?? ""),
        user.full_name,
        user.id,
      );
      return NextResponse.json({ ok: true, request: result });
    }
    if (body.action === "create-general-po") {
      const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
      const purchaseOrder = await createGeneralPurchaseOrder(
        organization.id,
        Array.isArray(body.requestIds) ? body.requestIds.map(String) : [],
        user.full_name,
        user.id,
        body.poDate ? String(body.poDate) : null,
        body.deliveryDate ? String(body.deliveryDate) : null,
      );
      return NextResponse.json({ ok: true, purchaseOrder }, { status: 201 });
    }
    if (body.action === "master-group") {
      const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
      const masterPurchaseOrder = await createMasterPurchaseOrder(
        organization.id,
        Array.isArray(body.groupedPurchaseOrderIds) ? body.groupedPurchaseOrderIds.map((id: unknown) => String(id)) : [],
        user.full_name,
      );
      return NextResponse.json({ ok: true, masterPurchaseOrder }, { status: 201 });
    }
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const groupedPurchaseOrder = await createGroupedPurchaseOrder({
      organizationId: organization.id,
      vendorId: String(body.vendorId ?? ""),
      submittedBy: user.full_name,
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
