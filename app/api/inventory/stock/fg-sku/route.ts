import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const SOURCES = ["DIRECT", "PACKING_LIST_GRN", "WO_ORDER_GRN"] as const;

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organizationId = searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    const barcode = searchParams.get("barcode")?.trim();
    if (barcode) {
      const record = await prisma.finishedGoodsSkuStock.findFirst({
        where: { organization_id: organization.id, OR: [{ id: barcode }, { sku_code: barcode }, { barcode }] },
      });
      if (!record) return NextResponse.json({ error: "No finished goods stock record found for this barcode." }, { status: 404 });
      return NextResponse.json({ record });
    }

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
    const source = String(body.source ?? "");
    const directItemName = [body.productCategory, body.subProductCategory, body.brand, body.size, body.colour]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" - ");
    const styleName = String(body.styleName ?? "").trim() || (source === "DIRECT" ? directItemName : "");
    const orderNo = String(body.orderNo ?? "").trim() || (source === "DIRECT" ? "DIRECT" : "");
    const articleNo = String(body.articleNo ?? "").trim() || (source === "DIRECT" ? "DIRECT" : "");
    const qtyIn = Number(body.qtyIn ?? 0);
    const qtyOut = Number(body.qtyOut ?? 0);

    if (!styleName || !orderNo || !articleNo || !SOURCES.includes(source as (typeof SOURCES)[number])) {
      return NextResponse.json({ error: source === "DIRECT" ? "Select at least one catalogue value to generate the item name." : "Style name, order no, article no, and a valid source are required." }, { status: 400 });
    }
    if (!Number.isFinite(qtyIn) || !Number.isFinite(qtyOut) || qtyIn < 0 || qtyOut < 0) {
      return NextResponse.json({ error: "Quantity values must be non-negative numbers." }, { status: 400 });
    }

    const record = await prisma.finishedGoodsSkuStock.create({
      data: {
        organization_id: organization.id,
        sku_code: await nextSkuCode(organization.id),
        barcode: String(body.barcode ?? "").trim() || null,
        style_name: styleName,
        order_no: orderNo,
        article_no: articleNo,
        brand: String(body.brand ?? "").trim() || null,
        size: String(body.size ?? "").trim() || null,
        colour: String(body.colour ?? "").trim() || null,
        product_category: String(body.productCategory ?? "").trim() || null,
        sub_product_category: String(body.subProductCategory ?? "").trim() || null,
        gst_rate: body.gstRate === "" || body.gstRate === null || body.gstRate === undefined ? null : Number(body.gstRate),
        hsn_code: String(body.hsnCode ?? "").trim() || null,
        purchase_price: body.purchasePrice === "" || body.purchasePrice === null || body.purchasePrice === undefined ? null : Number(body.purchasePrice),
        sales_price: body.salesPrice === "" || body.salesPrice === null || body.salesPrice === undefined ? null : Number(body.salesPrice),
        mrp: body.mrp === "" || body.mrp === null || body.mrp === undefined ? null : Number(body.mrp),
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

export async function PUT(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organizationId = String(body.organizationId ?? "");
    const recordId = String(body.recordId ?? "");
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
    if (!recordId) return NextResponse.json({ error: "Stock record ID is required." }, { status: 400 });

    const existing = await prisma.finishedGoodsSkuStock.findFirst({ where: { id: recordId, organization_id: organization.id } });
    if (!existing) return NextResponse.json({ error: "Finished goods stock record not found." }, { status: 404 });

    const source = String(body.source ?? existing.source);
    const styleName = String(body.styleName ?? existing.style_name).trim();
    const orderNo = String(body.orderNo ?? existing.order_no).trim();
    const articleNo = String(body.articleNo ?? existing.article_no).trim();
    const qtyIn = Number(body.qtyIn ?? existing.qty_in);
    const qtyOut = Number(body.qtyOut ?? existing.qty_out);
    if (!styleName || !orderNo || !articleNo || !SOURCES.includes(source as (typeof SOURCES)[number])) return NextResponse.json({ error: "Style name, order no, article no, and a valid source are required." }, { status: 400 });
    if (![qtyIn, qtyOut].every((value) => Number.isFinite(value) && value >= 0)) return NextResponse.json({ error: "Quantity values must be non-negative numbers." }, { status: 400 });

    const record = await prisma.finishedGoodsSkuStock.update({
      where: { id: recordId },
      data: {
        style_name: styleName, order_no: orderNo, article_no: articleNo,
        barcode: String(body.barcode ?? "").trim() || null,
        brand: String(body.brand ?? "").trim() || null, size: String(body.size ?? "").trim() || null, colour: String(body.colour ?? "").trim() || null,
        product_category: String(body.productCategory ?? "").trim() || null, sub_product_category: String(body.subProductCategory ?? "").trim() || null,
        gst_rate: body.gstRate === "" || body.gstRate === null ? null : Number(body.gstRate), hsn_code: String(body.hsnCode ?? "").trim() || null,
        purchase_price: body.purchasePrice === "" || body.purchasePrice === null ? null : Number(body.purchasePrice), sales_price: body.salesPrice === "" || body.salesPrice === null ? null : Number(body.salesPrice), mrp: body.mrp === "" || body.mrp === null ? null : Number(body.mrp),
        source, qty_in: qtyIn, qty_out: qtyOut, current_stock: qtyIn - qtyOut,
      },
    });
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update finished goods SKU stock." }, { status: 400 });
  }
}

async function nextSkuCode(organizationId: string) {
  const records = await prisma.finishedGoodsSkuStock.findMany({
    where: { organization_id: organizationId },
    select: { sku_code: true },
  });
  const nextNumber = records.reduce((highest, record) => {
    const value = Number(String(record.sku_code ?? "").replace(/^SKU/i, ""));
    return Number.isFinite(value) ? Math.max(highest, value) : highest;
  }, 0) + 1;
  return `SKU${nextNumber}`;
}