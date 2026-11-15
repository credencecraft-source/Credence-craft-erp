import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { deleteMasterPurchaseOrder, getMasterPurchaseOrder, MasterPurchaseOrderDeletionConflictError } from "@/lib/services/orders/master-purchase-order-service";
import { notifyStoreForStockMasterGroup } from "@/lib/services/inventory/rm-stock-verification-service";
import {
  requireOrganizationContext,
  requireOrganizationOrderManagementPermission,
} from "@/lib/services/organizations/organization-service";

export async function GET(request: Request, { params }: { params: Promise<{ masterPurchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "procurement/purchase-order", "view");
    const masterPurchaseOrder = await getMasterPurchaseOrder(organization.id, (await params).masterPurchaseOrderId);
    return NextResponse.json({ masterPurchaseOrder });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Master Group.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Access denied:") ? 403 : 400 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ masterPurchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "notify-store") return NextResponse.json({ error: "Unsupported Master Group action." }, { status: 400 });

    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "procurement/purchase-order", "edit");
    const result = await notifyStoreForStockMasterGroup(
      organization.id,
      (await params).masterPurchaseOrderId,
      user.id,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to notify the Internal Store.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Access denied:") ? 403 : 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ masterPurchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "procurement/purchase-order", "delete");
    await deleteMasterPurchaseOrder(organization.id, (await params).masterPurchaseOrderId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MasterPurchaseOrderDeletionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Unable to delete Master Group.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Access denied:") ? 403 : 400 });
  }
}