import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { createWorkOrder, createWorkOrders, getWorkOrderAllocation, listOrdersByArticle, listWorkOrderAllocationsByArticle, listWorkOrders } from "@/lib/services/factory/work-order-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    const articleAllocations = searchParams.get("articleAllocations")?.trim();
    const cursor = searchParams.get("cursor")?.trim() || undefined;
    const article = searchParams.get("article")?.trim();
    if (articleAllocations || article) {
      const articleLimitValue = searchParams.get("limit");
      const articleLimit = articleLimitValue ? Number(articleLimitValue) : undefined;
      if (articleLimit !== undefined && (!Number.isInteger(articleLimit) || articleLimit < 1 || articleLimit > 100)) throw new Error("Order page size must be between 1 and 100.");
      if (articleAllocations) return NextResponse.json(await listWorkOrderAllocationsByArticle(organization.id, articleAllocations, { cursor, limit: articleLimit }));
      return NextResponse.json(await listOrdersByArticle(organization.id, article!, { cursor, limit: articleLimit }));
    }
    const orderNo = searchParams.get("orderNo")?.trim();
    if (!orderNo) {
      const limitValue = searchParams.get("limit");
      const limit = limitValue ? Number(limitValue) : undefined;
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) throw new Error("Work-order page size must be between 1 and 200.");
      return NextResponse.json(await listWorkOrders(organization.id, { cursor, limit }));
    }
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
    const body = await request.json() as {
      organizationId?: string;
      orderNo?: string;
      lines?: Array<{ sourceFinishedGoodsId?: string; quantity?: number | string }>;
      requests?: Array<{ orderNo?: string; lines?: Array<{ sourceFinishedGoodsId?: string; quantity?: number | string }> }>;
    };
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    if (body.requests !== undefined) {
      if (!Array.isArray(body.requests)) throw new Error("Work-order batch must be a list.");
      const workOrders = await createWorkOrders(organization.id, user.id, body.requests.map((request) => ({
        orderNo: String(request.orderNo ?? ""),
        lines: Array.isArray(request.lines) ? request.lines : [],
      })));
      return NextResponse.json({ ok: true, workOrders }, { status: 201 });
    }
    const orderNo = String(body.orderNo ?? "").trim();
    if (!orderNo) throw new Error("Order number is required.");
    const workOrder = await createWorkOrder(organization.id, user.id, orderNo, Array.isArray(body.lines) ? body.lines : []);
    return NextResponse.json({ ok: true, workOrder }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create work order." }, { status: 400 });
  }
}