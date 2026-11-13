import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  MAX_FINISHED_GOODS_QR_PRINT_REQUEST_ITEMS,
  MAX_ORDER_QR_PRINT_REQUEST_ORDERS,
} from "@/lib/services/orders/order-qr-print-request-contract";
import { listFinishedGoodsQrRows } from "@/lib/services/orders/finished-goods-qr-row-service";
import {
  requireOrganizationContext,
  requireOrganizationOrderManagementPermission,
} from "@/lib/services/organizations/organization-service";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const workspaceId = searchParams.get("workspaceId");
    const organizationId = searchParams.get("organizationId")?.trim();
    if (!user.workspace_id || workspaceId !== user.workspace_id) {
      return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
    }
    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      undefined,
      { allowExpiredTrial: true },
    );
    await requireOrganizationOrderManagementPermission(
      user.id,
      organization.id,
      "merchandising/order",
      "view",
    );
    const orderIds = searchParams.getAll("orderId").map((id) => id.trim());
    if (
      orderIds.length === 0
      || orderIds.length > MAX_ORDER_QR_PRINT_REQUEST_ORDERS
      || orderIds.some((id) => !id || id.length > 100)
      || new Set(orderIds).size !== orderIds.length
    ) {
      return NextResponse.json(
        { error: `Select between 1 and ${MAX_ORDER_QR_PRINT_REQUEST_ORDERS} unique orders.` },
        { status: 400 },
      );
    }

    const result = await listFinishedGoodsQrRows(organization.id, orderIds);
    if (!result.success) {
      return result.reason === "TOO_MANY_VARIANTS"
        ? NextResponse.json(
          { error: `Select orders with no more than ${MAX_FINISHED_GOODS_QR_PRINT_REQUEST_ITEMS.toLocaleString()} finished-goods sizes.` },
          { status: 400 },
        )
        : NextResponse.json(
          { error: "One or more selected orders are unavailable in this organization." },
          { status: 404 },
        );
    }
    return NextResponse.json({ orders: result.orders });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: "You do not have permission to view these orders." }, { status: 403 });
    }
    console.error("Unable to load finished-goods barcode rows.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load finished-goods sizes." }, { status: 500 });
  }
}
