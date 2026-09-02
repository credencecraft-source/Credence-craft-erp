import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { createOrder, listOrders, updateOrder, updateFinishedGoodsForOrder, updateBomItemsForOrder } from "@/lib/services/orders/order-service";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  const organization = await getOrganizationForUser(user.id, organizationId);
  if (!organization) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  const orders = await listOrders(organization.id);
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const organization = await getOrganizationForUser(user.id, String(body.organizationId ?? ""));
    if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    const order = await createOrder(organization.id, body);
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const { id, organizationId, ...payload } = body;

    if (!id) {
      return NextResponse.json({ error: "Order id is required." }, { status: 400 });
    }

    const organization = await getOrganizationForUser(user.id, String(organizationId ?? ""));
    if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    const order = await updateOrder(id, organization.id, payload);

    if (Array.isArray(payload.rows)) {
      await updateFinishedGoodsForOrder(id, organization.id, payload.rows);
    }

    if (Array.isArray(payload.bomRows)) {
      await updateBomItemsForOrder(id, organization.id, payload.bomRows);
    }

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
