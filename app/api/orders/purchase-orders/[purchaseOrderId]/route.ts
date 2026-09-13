import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { deletePurchaseOrder, getPurchaseOrder, sharePurchaseOrderByEmail, submitPurchaseOrderForApproval } from "@/lib/services/orders/purchase-order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request, { params }: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    return NextResponse.json({ purchaseOrder: await getPurchaseOrder(organization.id, (await params).purchaseOrderId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Purchase Order." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    await deletePurchaseOrder(organization.id, (await params).purchaseOrderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to delete Purchase Order." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const purchaseOrderId = (await params).purchaseOrderId;
    if (body.action === "submit-approval") {
      await submitPurchaseOrderForApproval(organization.id, purchaseOrderId, user.full_name || user.email);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "share-email") {
      await sharePurchaseOrderByEmail(organization.id, purchaseOrderId, String(body.email ?? ""));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unsupported Purchase Order action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Purchase Order." }, { status: 400 });
  }
}