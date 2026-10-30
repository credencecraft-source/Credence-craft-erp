import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { generatePurchaseOrders, listPurchaseOrderReportPage, listPurchaseOrders } from "@/lib/services/orders/purchase-order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organizationId = searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    const assetOnlyParameter = searchParams.get("isAssetPurchase");
    if (assetOnlyParameter !== null && assetOnlyParameter !== "true" && assetOnlyParameter !== "false") {
      return NextResponse.json({ error: "Asset purchase filter must be true or false." }, { status: 400 });
    }
    const assetOnly = assetOnlyParameter === "true";
    if (searchParams.get("view") === "report") {
      const limitValue = Number(searchParams.get("limit") ?? 50);
      return NextResponse.json(await listPurchaseOrderReportPage(organization.id, {
        cursor: searchParams.get("cursor") ?? undefined,
        limit: Number.isFinite(limitValue) ? limitValue : 50,
        search: searchParams.get("search") ?? undefined,
        assetOnly,
      }));
    }
    return NextResponse.json({ purchaseOrders: await listPurchaseOrders(organization.id, { assetOnly }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Purchase Orders." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const purchaseOrder = await generatePurchaseOrders(
      organization.id,
      Array.isArray(body.masterPurchaseOrderIds) ? body.masterPurchaseOrderIds.map(String) : [],
      user.full_name,
      body.poDate ? String(body.poDate) : null,
      body.deliveryDate ? String(body.deliveryDate) : null,
    );
    return NextResponse.json({ ok: true, purchaseOrder }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate Purchase Orders." }, { status: 400 });
  }
}