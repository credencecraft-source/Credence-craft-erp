import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrderById } from "@/lib/services/orders/order-service";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    const order = await getOrderById(orderId, organization.id);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
