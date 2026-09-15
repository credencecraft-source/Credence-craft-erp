import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { createWorkOrder, getWorkOrderAllocation, listOrdersByArticle, listWorkOrders } from "@/lib/services/factory/work-order-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    const article = searchParams.get("article")?.trim();
    if (article) return NextResponse.json({ orders: await listOrdersByArticle(organization.id, article) });
    const orderNo = searchParams.get("orderNo")?.trim();
    if (!orderNo) return NextResponse.json({ workOrders: await listWorkOrders(organization.id) });
    const allocation = await getWorkOrderAllocation(organization.id, orderNo);
    if (!allocation) return NextResponse.json({ error: "Order number was not found." }, { status: 404 });
    return NextResponse.json(allocation);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load work order data." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as { organizationId?: string; orderNo?: string; lines?: Array<{ sourceFinishedGoodsId?: string; quantity?: number | string }> };
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const orderNo = String(body.orderNo ?? "").trim();
    if (!orderNo) throw new Error("Order number is required.");
    const workOrder = await createWorkOrder(organization.id, orderNo, Array.isArray(body.lines) ? body.lines : []);
    return NextResponse.json({ ok: true, workOrder }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create work order." }, { status: 400 });
  }
}