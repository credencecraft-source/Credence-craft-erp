import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { createVariantOrder, prepareVariantOrder, toDateOnly } from "@/lib/services/orders/order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { orderId } = await context.params;
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }

    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const preparation = await prepareVariantOrder(organization.id, orderId, user.id);
    return NextResponse.json(preparation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare order variant.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ orderId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { orderId } = await context.params;
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }

    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
    const body = await request.json();
    const order = await createVariantOrder(organization.id, orderId, body, user.id);
    return NextResponse.json({
      ok: true,
      order: { ...order, deliveryDate: toDateOnly(order.deliveryDate) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create order variant.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}