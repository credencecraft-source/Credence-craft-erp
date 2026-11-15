import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { createWorkOrder, createWorkOrders, deleteWorkOrders, getWorkOrderAllocation, listOrdersByArticle, listWorkOrderAllocationsByArticle, listWorkOrderArticles, listWorkOrders } from "@/lib/services/factory/work-order-service";

function errorStatus(error: unknown) {
  return error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400;
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organizationId = searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organizationId, "VIEW_WORK_ORDERS");
    if (searchParams.get("articles") === "true") {
      return NextResponse.json(await listWorkOrderArticles(organization.id));
    }
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
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to load work orders because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load work order data." }, { status: errorStatus(error) });
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
    const organizationId = String(body.organizationId ?? "");
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organizationId, "CREATE_WORK_ORDERS");
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
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to create work orders because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create work order." }, { status: errorStatus(error) });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Submit a valid list of work orders to delete." }, { status: 400 });
    }

    const payload = body as Record<string, unknown>;
    const organizationId = typeof payload.organizationId === "string" ? payload.organizationId.trim() : "";
    const rawWorkOrderIds = payload.workOrderIds;
    if (
      !Array.isArray(rawWorkOrderIds)
      || rawWorkOrderIds.length < 1
      || rawWorkOrderIds.length > 100
      || !rawWorkOrderIds.every((id): id is string => typeof id === "string" && Boolean(id.trim()) && id.length <= 255)
    ) {
      return NextResponse.json({ error: "Select between 1 and 100 unique work orders to delete." }, { status: 400 });
    }
    const workOrderIds = rawWorkOrderIds.map((id) => id.trim());
    if (new Set(workOrderIds).size !== workOrderIds.length) {
      return NextResponse.json({ error: "Select between 1 and 100 unique work orders to delete." }, { status: 400 });
    }

    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organizationId, "DELETE_WORK_ORDERS");
    await deleteWorkOrders(organization.id, user.id, workOrderIds);
    return NextResponse.json({ deleted: workOrderIds });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to delete work orders because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete work orders." },
      { status: errorStatus(error) },
    );
  }
}