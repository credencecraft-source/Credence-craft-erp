import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getAdvanceBookingOrderDetails,
  getOrderCoreById,
  getOrderDetailSection,
  getOrderById,
  type OrderDetailSection,
  updateOrderWithDetails,
} from "@/lib/services/orders/order-service";
import { getOrganizationInternalIdForUser, requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const ORDER_DETAIL_SECTIONS = new Set<OrderDetailSection>(["finishedGoods", "bom", "process"]);

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }
    const organization = await getOrganizationInternalIdForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Access denied or organization not found." }, { status: 403 });
    }
    const searchParams = new URL(request.url).searchParams;
    const requestedSection = searchParams.get("section");
    if (requestedSection && !ORDER_DETAIL_SECTIONS.has(requestedSection as OrderDetailSection)) {
      return NextResponse.json({ error: "Invalid order detail section." }, { status: 400 });
    }
    const order = searchParams.get("purpose") === "advance-booking"
      ? await getAdvanceBookingOrderDetails(orderId, organization.id)
      : requestedSection
        ? await getOrderDetailSection(orderId, organization.id, requestedSection as OrderDetailSection)
        : searchParams.get("view") === "core"
          ? await getOrderCoreById(orderId, organization.id)
          : await getOrderById(orderId, organization.id);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    return NextResponse.json({ order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
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

    const order = await updateOrderWithDetails(orderId, organization.id, payload, user.id);
    return NextResponse.json({ ok: true, order });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to update order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}