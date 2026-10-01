import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { deleteMasterPurchaseOrder, getMasterPurchaseOrder, MasterPurchaseOrderDeletionConflictError } from "@/lib/services/orders/master-purchase-order-service";
import { notifyStoreForStockMasterGroup } from "@/lib/services/inventory/rm-stock-verification-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request, { params }: { params: Promise<{ masterPurchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    const masterPurchaseOrder = await getMasterPurchaseOrder(organization.id, (await params).masterPurchaseOrderId);
    return NextResponse.json({ masterPurchaseOrder });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Master Group." }, { status: 400 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ masterPurchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "notify-store") return NextResponse.json({ error: "Unsupported Master Group action." }, { status: 400 });

    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const result = await notifyStoreForStockMasterGroup(
      organization.id,
      (await params).masterPurchaseOrderId,
      user.id,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to notify the Internal Store." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ masterPurchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    await deleteMasterPurchaseOrder(organization.id, (await params).masterPurchaseOrderId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MasterPurchaseOrderDeletionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete Master Group." }, { status: 400 });
  }
}