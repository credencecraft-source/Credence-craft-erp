import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  createOrder,
  deleteOrders,
  listOrdersPage,
  toDateOnly,
  updateOrderWithDetails,
  type OrderListFilters,
} from "@/lib/services/orders/order-service";
import {
  requireOrganizationContext,
  requireOrganizationOrderManagementPermission,
} from "@/lib/services/organizations/organization-service";

const ORDER_LIST_FILTER_FIELDS = new Set([
  "orderNo",
  "entityName",
  "category",
  "subCategory",
  "season",
  "article",
  "articleCode",
  "variantCode",
  "styleName",
  "colors",
  "buyer",
  "brand",
  "sizeGroup",
  "orderQty",
  "deliveryDate",
  "processStatus",
  "finalStatus",
  "sourceStatus",
]);
const ORDER_LIST_FILTER_OPERATORS = new Set(["contains", "is", "notContains", "empty"]);

function parseOrderListFilters(value: string | null): OrderListFilters | null {
  if (!value) return {};
  if (value.length > 5000) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;

  const filters: OrderListFilters = {};
  const entries = Object.entries(parsed);
  if (entries.length > ORDER_LIST_FILTER_FIELDS.size) return null;
  for (const [field, rawFilter] of entries) {
    if (!ORDER_LIST_FILTER_FIELDS.has(field)
      || typeof rawFilter !== "object"
      || rawFilter === null
      || Array.isArray(rawFilter)) return null;
    const filter = rawFilter as Record<string, unknown>;
    if (typeof filter.operator !== "string"
      || !ORDER_LIST_FILTER_OPERATORS.has(filter.operator)
      || (field === "orderQty" && filter.operator !== "is" && filter.operator !== "empty")
      || typeof filter.value !== "string"
      || filter.value.length > 100
      || (filter.operator !== "empty" && filter.value.trim().length === 0)) return null;
    filters[field as keyof OrderListFilters] = {
      operator: filter.operator as "contains" | "is" | "notContains" | "empty",
      value: filter.value.trim(),
    };
  }
  return filters;
}

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
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "merchandising/order", "view");
    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get("status")?.trim();
    if (status && status.length > 100) {
      return NextResponse.json({ error: "Order status is too long." }, { status: 400 });
    }
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? 100 : Number(rawLimit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: "Order page size must be between 1 and 100." }, { status: 400 });
    }
    const search = searchParams.get("search")?.trim() ?? "";
    if (search.length > 100) {
      return NextResponse.json({ error: "Order search must be 100 characters or fewer." }, { status: 400 });
    }
    const filters = parseOrderListFilters(searchParams.get("filters"));
    if (!filters) {
      return NextResponse.json({ error: "Order column filters are invalid." }, { status: 400 });
    }
    const page = await listOrdersPage(organization.id, {
      cursor: searchParams.get("cursor") || undefined,
      limit,
      status: status || undefined,
      search,
      filters,
      purpose: searchParams.get("purpose") === "advance-booking" ? "advance-booking" : undefined,
      includeArticleMetadata: searchParams.get("purpose") !== "advance-booking",
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
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: "You do not have permission to view orders." }, { status: 403 });
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
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "merchandising/order", "create");
    const order = await createOrder(organization.id, body, user.id);
    return NextResponse.json({ ok: true, order: { ...order, deliveryDate: toDateOnly(order.deliveryDate) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create order.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Access denied:") ? 403 : 400 });
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
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "merchandising/order", "edit");
    const order = await updateOrderWithDetails(id, organization.id, payload, user.id);

    return NextResponse.json({ ok: true, order: { ...order, deliveryDate: toDateOnly(order.deliveryDate) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update order.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Access denied:") ? 403 : 400 });
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
    await requireOrganizationOrderManagementPermission(user.id, organization.id, "merchandising/order", "delete");
    const result = await deleteOrders(orderIds, organization.id, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete orders.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Access denied:") ? 403 : 400 });
  }
}