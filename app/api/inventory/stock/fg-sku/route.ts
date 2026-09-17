import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const SOURCES = ["DIRECT", "PACKING_LIST_GRN", "WO_ORDER_GRN"] as const;

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    const records = await prisma.finishedGoodsSkuStock.findMany({
      where: { organization_id: organization.id },
      orderBy: { added_time: "desc" },
    });

    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load finished goods SKU stock." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organizationId = String(body.organizationId ?? "");
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
    const styleName = String(body.styleName ?? "").trim();
    const orderNo = String(body.orderNo ?? "").trim();
    const articleNo = String(body.articleNo ?? "").trim();
    const source = String(body.source ?? "");
    const qtyIn = Number(body.qtyIn ?? 0);
    const qtyOut = Number(body.qtyOut ?? 0);

    if (!styleName || !orderNo || !articleNo || !SOURCES.includes(source as (typeof SOURCES)[number])) {
      return NextResponse.json({ error: "Style name, order no, article no, and a valid source are required." }, { status: 400 });
    }
    if (!Number.isFinite(qtyIn) || !Number.isFinite(qtyOut) || qtyIn < 0 || qtyOut < 0) {
      return NextResponse.json({ error: "Quantity values must be non-negative numbers." }, { status: 400 });
    }

    const record = await prisma.finishedGoodsSkuStock.create({
      data: {
        organization_id: organization.id,
        style_name: styleName,
        order_no: orderNo,
        article_no: articleNo,
        brand: String(body.brand ?? "").trim() || null,
        size: String(body.size ?? "").trim() || null,
        colour: String(body.colour ?? "").trim() || null,
        product_category: String(body.productCategory ?? "").trim() || null,
        sub_product_category: String(body.subProductCategory ?? "").trim() || null,
        added_user: user.email ?? user.id,
        source,
        qty_in: qtyIn,
        qty_out: qtyOut,
        current_stock: qtyIn - qtyOut,
      },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create finished goods SKU stock." }, { status: 400 });
  }
}