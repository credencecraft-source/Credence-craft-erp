import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { generatePurchaseOrders, listPurchaseOrders } from "@/lib/services/orders/purchase-order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    return NextResponse.json({ purchaseOrders: await listPurchaseOrders(organization.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Purchase Orders." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const purchaseOrder = await generatePurchaseOrders(
      organization.id,
      Array.isArray(body.masterPurchaseOrderIds) ? body.masterPurchaseOrderIds.map(String) : [],
      user.full_name || user.email,
      body.poDate ? String(body.poDate) : null,
      body.deliveryDate ? String(body.deliveryDate) : null,
    );
    return NextResponse.json({ ok: true, purchaseOrder }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate Purchase Orders." }, { status: 400 });
  }
}