import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { createOrder, deleteOrders, listOrdersPage, toDateOnly, updateOrderWithDetails } from "@/lib/services/orders/order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      undefined,
      { allowExpiredTrial: true },
    );
    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get("status")?.trim();
    if (status && status.length > 100) {
      return NextResponse.json({ error: "Order status is too long." }, { status: 400 });
    }
    const page = await listOrdersPage(organization.id, {
      cursor: searchParams.get("cursor") || undefined,
      limit: Number(searchParams.get("limit") || 100),
      status: status || undefined,
    });
    return NextResponse.json(page);
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error
      && String(error.digest).includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to load merchandising orders because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to load merchandising orders.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load orders." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const body = await request.json();
    const organizationId = url.searchParams.get("organizationId") || body.organizationId;
    
    const organization = await requireOrganizationContext(user.id, String(organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const order = await createOrder(organization.id, body, user.id);
    return NextResponse.json({ ok: true, order: { ...order, deliveryDate: toDateOnly(order.deliveryDate) } });
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
    const order = await updateOrderWithDetails(id, organization.id, payload, user.id);

    return NextResponse.json({ ok: true, order: { ...order, deliveryDate: toDateOnly(order.deliveryDate) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const organizationId = url.searchParams.get("organizationId") || body.organizationId;
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map(String) : [];

    if (!organizationId || orderIds.length === 0) {
      return NextResponse.json({ error: "Organization and order ids are required." }, { status: 400 });
    }

    const organization = await requireOrganizationContext(user.id, String(organizationId), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const result = await deleteOrders(orderIds, organization.id, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete orders.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}