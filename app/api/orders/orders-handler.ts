import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { createOrder, listOrdersPage, updateOrderWithDetails } from "@/lib/services/orders/order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (!organizationId) {
    return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  }
  const organization = await requireOrganizationContext(user.id, organizationId);
  const searchParams = new URL(request.url).searchParams;
  const page = await listOrdersPage(organization.id, {
    cursor: searchParams.get("cursor") || undefined,
    limit: Number(searchParams.get("limit") || 100),
  });
  return NextResponse.json(page);
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const body = await request.json();
    const organizationId = url.searchParams.get("organizationId") || body.organizationId;
    
    const organization = await requireOrganizationContext(user.id, String(organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
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
    const url = new URL(request.url);
    const body = await request.json();
    const { id, ...payload } = body;
    const organizationId = url.searchParams.get("organizationId") || body.organizationId;

    if (!id) {
      return NextResponse.json({ error: "Order id is required." }, { status: 400 });
    }

    const organization = await requireOrganizationContext(user.id, String(organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const order = await updateOrderWithDetails(id, organization.id, payload);

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}