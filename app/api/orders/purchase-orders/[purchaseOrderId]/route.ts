import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { deletePurchaseOrder, getPurchaseOrder, sharePurchaseOrderByEmail, submitPurchaseOrderForApproval } from "@/lib/services/orders/purchase-order-service";
import {
  requireOrganizationContext,
  requireOrganizationOrderManagementPermission,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";

function errorStatus(error: unknown) {
  return error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400;
}

export async function GET(request: Request, { params }: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "procurement/purchase-order", "view");
    return NextResponse.json({ purchaseOrder: await getPurchaseOrder(organization.id, (await params).purchaseOrderId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Purchase Order." }, { status: errorStatus(error) });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "procurement/purchase-order", "delete");
    await deletePurchaseOrder(organization.id, (await params).purchaseOrderId, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete Purchase Order.";
    const payload: Record<string, unknown> = { error: message };
    if (error instanceof Error && "linkedReceipts" in error) {
      payload.linkedReceipts = (error as Error & { linkedReceipts?: Array<{ id: string; receiptNo: string }> }).linkedReceipts ?? [];
    }
    if (error instanceof Error && "linkedGateEntries" in error) {
      payload.linkedGateEntries = (error as Error & { linkedGateEntries?: Array<{ id: string; entryNo: string }> }).linkedGateEntries ?? [];
    }
    return NextResponse.json(payload, { status: errorStatus(error) });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const purchaseOrderId = (await params).purchaseOrderId;
    if (body.action === "submit-approval") {
      await requireOrganizationPermission(user.id, organization.id, "SUBMIT_PURCHASE_ORDERS_FOR_APPROVAL");
      await submitPurchaseOrderForApproval(organization.id, purchaseOrderId, user.full_name, user.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "share-email") {
      await requireOrganizationPermission(user.id, organization.id, "SHARE_PURCHASE_ORDERS");
      await sharePurchaseOrderByEmail(organization.id, purchaseOrderId, String(body.email ?? ""));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unsupported Purchase Order action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Purchase Order." }, { status: errorStatus(error) });
  }
}