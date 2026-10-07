import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const SOURCES = ["DIRECT", "PACKING_LIST_GRN"] as const;

function resolveActorEmail(actorValue: string, actorEmails: Map<string, string>) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actorValue)
    ? actorValue
    : actorEmails.get(actorValue) ?? "Email unavailable";
}

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

    const bucket = searchParams.get("bucket");
    if (bucket && bucket !== "GENERAL" && bucket !== "ALLOCATED") {
      return NextResponse.json({ error: "Select a valid finished-goods stock bucket." }, { status: 400 });
    }
    const [skuRecords, generalReceipts, allocatedReceipts] = await Promise.all([
      prisma.finishedGoodsSkuStock.findMany({
        where: { organization_id: organization.id },
        orderBy: { added_time: "desc" },
      }),
      bucket === "ALLOCATED" ? Promise.resolve([]) : prisma.finishedGoodsGeneralStockReceipt.findMany({
        where: { organization_id: organization.id },
        include: { location: { select: { location_name: true } } },
        orderBy: { posted_at: "desc" },
      }),
      bucket === "GENERAL" ? Promise.resolve([]) : prisma.finishedGoodsAllocatedStockReceipt.findMany({
        where: { organization_id: organization.id },
        include: { location: { select: { location_name: true } } },
        orderBy: { posted_at: "desc" },
      }),
    ]);
    const actorIds = Array.from(new Set([
      ...generalReceipts.flatMap((record) => [record.created_by, record.verified_by]),
      ...allocatedReceipts.flatMap((record) => [record.created_by, record.verified_by]),
    ]));
    const actors = actorIds.length > 0
      ? await prisma.workspaceUser.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true },
      })
      : [];
    const actorEmails = new Map(actors.map((actor) => [actor.id, actor.email || "Email unavailable"]));
    const generalStockRecords = generalReceipts.map((record) => ({
      id: record.id,
      location_id: record.location_id,
      location: record.location,
      sku_code: null,
      barcode: null,
      style_name: record.style_name,
      order_no: record.order_no,
      article_no: record.article_no ?? "",
      brand: record.brand,
      size: record.size,
      colour: record.colour,
      product_category: record.product_category,
      sub_product_category: null,
      added_time: record.posted_at,
      added_user: resolveActorEmail(record.created_by, actorEmails),
      source: "WO_ORDER_GRN",
      qty_in: record.quantity_in,
      qty_out: record.quantity_out,
      current_stock: record.current_stock,
      gst_rate: null,
      hsn_code: null,
      purchase_price: null,
      sales_price: null,
      mrp: null,
      inventory_bucket: "GENERAL",
      grn_id: record.grn_id,
      grn_line_id: record.grn_line_id,
      grn_no: record.grn_no,
      work_order_id: record.work_order_id,
      work_order_no: record.work_order_no,
      order_id: record.order_id,
      buyer: record.buyer,
      buyer_size: record.buyer_size,
      received_quantity: record.received_quantity,
      actual_received_quantity: record.actual_received_quantity,
      approved_quantity: record.approved_quantity,
      rejected_quantity: record.rejected_quantity,
      created_by: resolveActorEmail(record.created_by, actorEmails),
      verified_by: resolveActorEmail(record.verified_by, actorEmails),
      posted_at: record.posted_at,
    }));
    const allocatedStockRecords = allocatedReceipts.map((record) => ({
      id: record.id,
      location_id: record.location_id,
      location: record.location,
      sku_code: null,
      barcode: null,
      style_name: record.style_name,
      order_no: record.order_no,
      article_no: record.article_no ?? "",
      brand: record.brand,
      size: record.size,
      colour: record.colour,
      product_category: record.product_category,
      sub_product_category: null,
      added_time: record.posted_at,
      added_user: resolveActorEmail(record.created_by, actorEmails),
      source: "WO_ORDER_GRN",
      qty_in: record.quantity_in,
      qty_out: record.quantity_out,
      current_stock: record.current_stock,
      gst_rate: null,
      hsn_code: null,
      purchase_price: null,
      sales_price: null,
      mrp: null,
      inventory_bucket: "ALLOCATED",
      grn_id: record.grn_id,
      grn_line_id: record.grn_line_id,
      grn_no: record.grn_no,
      work_order_id: record.work_order_id,
      work_order_no: record.work_order_no,
      order_id: record.order_id,
      booking_id: record.booking_id,
      booking_size_line_id: record.booking_size_line_id,
      booking_assignment_id: record.booking_assignment_id,
      booking_no: record.booking_no,
      buyer: record.buyer,
      buyer_size: record.buyer_size,
      received_quantity: record.received_quantity,
      actual_received_quantity: record.actual_received_quantity,
      approved_quantity: record.approved_quantity,
      rejected_quantity: record.rejected_quantity,
      created_by: resolveActorEmail(record.created_by, actorEmails),
      verified_by: resolveActorEmail(record.verified_by, actorEmails),
      posted_at: record.posted_at,
    }));
    const records = [...skuRecords, ...generalStockRecords, ...allocatedStockRecords]
      .sort((left, right) => new Date(right.added_time).getTime() - new Date(left.added_time).getTime());

    return NextResponse.json({ records });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === "P2021" || error.code === "P2022")
    ) {
      return NextResponse.json({ error: "Finished-goods GRN stock is unavailable until its database migration is deployed." }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load finished goods SKU stock." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organizationId = String(body.organizationId ?? "");
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
    const locationId = String(body.locationId ?? "").trim();
    const location = locationId
      ? await prisma.masterLocation.findFirst({
        where: { id: locationId, organization_id: organization.id, is_active: true },
        select: { id: true, entity_id: true },
      })
      : null;
    if (!location) return NextResponse.json({ error: "Select an active Location for this stock record." }, { status: 400 });
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
        entity_id: location.entity_id,
        location_id: location.id,
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
    const locationId = String(body.locationId ?? existing.location_id).trim();
    const location = await prisma.masterLocation.findFirst({
      where: { id: locationId, organization_id: organization.id, is_active: true },
      select: { id: true, entity_id: true },
    });
    if (!location) return NextResponse.json({ error: "Select an active Location for this stock record." }, { status: 400 });
    if (!styleName || !orderNo || !articleNo || !SOURCES.includes(source as (typeof SOURCES)[number])) return NextResponse.json({ error: "Style name, order no, article no, and a valid source are required." }, { status: 400 });
    if (![qtyIn, qtyOut].every((value) => Number.isFinite(value) && value >= 0)) return NextResponse.json({ error: "Quantity values must be non-negative numbers." }, { status: 400 });

    const record = await prisma.finishedGoodsSkuStock.update({
      where: { id: recordId },
      data: {
        entity_id: location.entity_id,
        location_id: location.id,
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