import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrderById, updateOrderWithDetails } from "@/lib/services/orders/order-service";
import { getOrganizationForUser, requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }
    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Access denied or organization not found." }, { status: 403 });
    }
    const order = await getOrderById(orderId, organization.id);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error: any) {
    const message = error?.message || "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const organizationId = url.searchParams.get("organizationId") || body.organizationId;

    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }

    const organization = await requireOrganizationContext(user.id, String(organizationId), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const payload = { ...body };
    delete payload.organizationId;
    delete payload.id;

    const order = await updateOrderWithDetails(orderId, organization.id, payload);
    return NextResponse.json({ ok: true, order });
  } catch (error: any) {
    const message = error?.message || "Unable to update order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}