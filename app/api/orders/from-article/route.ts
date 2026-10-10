import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { createArticleBasedOrders } from "@/lib/services/orders/article-based-order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId")?.trim() ?? "";
    if (!organizationId) return NextResponse.json({ error: "Organization is required." }, { status: 400 });

    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Order details are invalid." }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Order details are invalid." }, { status: 400 });
    }

    const orders = await createArticleBasedOrders(
      organization.id,
      body,
      user.id,
    );
    return NextResponse.json({
      ok: true,
      orders: orders.map((order) => ({ id: order.id, orderNo: order.orderNo, orderQty: order.orderQty })),
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "digest" in error
      && String(error.digest).includes("NEXT_REDIRECT")) {
      throw error;
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to create Article orders because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    const message = error instanceof Error ? error.message : "Unable to create Article orders.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
