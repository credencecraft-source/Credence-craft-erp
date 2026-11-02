import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { createOrdersAtomically, type CreateOrderInput } from "@/lib/services/orders/order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const MAX_BATCH_ORDER_COUNT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "The batch order request must contain valid JSON." }, { status: 400 });
    }
    if (!isRecord(body)) {
      return NextResponse.json({ error: "The batch order request was invalid." }, { status: 400 });
    }

    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") || body.organizationId;
    if (typeof organizationId !== "string" || !organizationId.trim()) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }
    if (!Array.isArray(body.orders)
      || body.orders.length === 0
      || body.orders.length > MAX_BATCH_ORDER_COUNT
      || body.orders.some((order) => !isRecord(order))) {
      return NextResponse.json({
        error: `Provide between 1 and ${MAX_BATCH_ORDER_COUNT} valid orders.`,
      }, { status: 400 });
    }

    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    const orders = await createOrdersAtomically(
      organization.id,
      body.orders as CreateOrderInput[],
      user.id,
    );

    return NextResponse.json({
      ok: true,
      orders: orders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        finalStatus: order.finalStatus,
      })),
    }, { status: 201 });
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error
      && String(error.digest).includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to create the order batch because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unable to create the order batch.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
