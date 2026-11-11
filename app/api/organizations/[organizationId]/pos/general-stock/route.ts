import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { GENERAL_FINISHED_GOODS_SKU_SOURCES } from "@/lib/services/inventory/finished-goods-stock-overview";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organization.id, "VIEW_INVENTORY_STOCK");
    const searchParams = new URL(request.url).searchParams;
    const stockId = searchParams.get("stockId")?.trim();
    const entityId = searchParams.get("entityId")?.trim();
    const stockType = searchParams.get("stockType");
    const search = searchParams.get("search")?.trim() ?? "";
    const rawLimit = searchParams.get("limit");
    const rawOffset = searchParams.get("offset");
    const requestedLimit = rawLimit === null ? 10 : Number(rawLimit);
    const offset = rawOffset === null ? 0 : Number(rawOffset);
    if (stockType && stockType !== "SKU" && stockType !== "GENERAL_GRN") {
      return NextResponse.json({ error: "Select a valid General stock record type." }, { status: 400 });
    }
    if (
      (rawLimit !== null && (!/^\d{1,3}$/.test(rawLimit) || requestedLimit < 1 || requestedLimit > 100))
      || (rawOffset !== null && (!/^\d{1,6}$/.test(rawOffset) || offset > 100000))
      || (offset > 0 && (!stockType || stockId))
    ) {
      return NextResponse.json({ error: "Select a valid bounded stock page." }, { status: 400 });
    }
    if (search && (search.length < 2 || search.length > 100)) {
      return NextResponse.json({ error: "Stock search must contain between 2 and 100 characters." }, { status: 400 });
    }
    if (entityId) {
      const entity = await prisma.masterEntity.findFirst({
        where: { id: entityId, organization_id: organization.id, is_active: true },
        select: { id: true },
      });
      if (!entity) return NextResponse.json({ error: "Select an active Entity belonging to this organization." }, { status: 400 });
    }
    const resultLimit = stockId ? 1 : requestedLimit;
    const take = resultLimit + 1;
    const [skuRecords, generalReceiptRecords] = await Promise.all([
      stockType === "GENERAL_GRN" ? Promise.resolve([]) : prisma.finishedGoodsSkuStock.findMany({
        where: {
          organization_id: organization.id,
          source: { in: [...GENERAL_FINISHED_GOODS_SKU_SOURCES] },
          current_stock: { gt: 0 },
          ...(entityId ? { entity_id: entityId } : {}),
          ...(stockId ? { id: stockId } : {}),
          ...(search ? {
            OR: [
              { style_name: { contains: search, mode: "insensitive" } },
              { order_no: { contains: search, mode: "insensitive" } },
              { article_no: { contains: search, mode: "insensitive" } },
              { brand: { contains: search, mode: "insensitive" } },
              { size: { contains: search, mode: "insensitive" } },
              { colour: { contains: search, mode: "insensitive" } },
              { product_category: { contains: search, mode: "insensitive" } },
              { sub_product_category: { contains: search, mode: "insensitive" } },
            ],
          } : {}),
        },
        select: {
          id: true,
          entity_id: true,
          style_name: true,
          order_no: true,
          article_no: true,
          brand: true,
          size: true,
          colour: true,
          product_category: true,
          sub_product_category: true,
          current_stock: true,
          qty_in: true,
          qty_out: true,
          gst_rate: true,
          hsn_code: true,
          purchase_price: true,
          sales_price: true,
          mrp: true,
          sku_code: true,
          barcode: true,
          source: true,
          added_time: true,
          added_user: true,
          location: { select: { location_name: true } },
        },
        orderBy: [{ style_name: "asc" }, { order_no: "asc" }, { size: "asc" }, { id: "asc" }],
        ...(stockId ? {} : { skip: offset }),
        take,
      }),
      stockType === "SKU" ? Promise.resolve([]) : prisma.finishedGoodsGeneralStockReceipt.findMany({
      where: {
        organization_id: organization.id,
        current_stock: { gt: 0 },
        ...(entityId ? { entity_id: entityId } : {}),
        ...(stockId ? { id: stockId } : {}),
        ...(search ? {
          OR: [
            { style_name: { contains: search, mode: "insensitive" } },
            { order_no: { contains: search, mode: "insensitive" } },
            { article_no: { contains: search, mode: "insensitive" } },
            { brand: { contains: search, mode: "insensitive" } },
            { size: { contains: search, mode: "insensitive" } },
            { colour: { contains: search, mode: "insensitive" } },
            { product_category: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
      },
      select: {
        id: true,
        entity_id: true,
        style_name: true,
        order_no: true,
        article_no: true,
        brand: true,
        size: true,
        colour: true,
        product_category: true,
        current_stock: true,
        quantity_in: true,
        quantity_out: true,
        posted_at: true,
        created_by: true,
        location: { select: { location_name: true } },
      },
        orderBy: [{ style_name: "asc" }, { order_no: "asc" }, { size: "asc" }, { id: "asc" }],
        ...(stockId ? {} : { skip: offset }),
        take,
      }),
    ]);

    if (stockId && skuRecords.length + generalReceiptRecords.length === 0) {
      return NextResponse.json({ error: "No available General finished-goods stock found for this record." }, { status: 404 });
    }
    if (stockId && skuRecords.length + generalReceiptRecords.length > 1) {
      return NextResponse.json({ error: "This stock ID is ambiguous. Select its General stock record type." }, { status: 409 });
    }

    const records = [
      ...skuRecords.map((record) => ({
        id: record.id,
        entity_id: record.entity_id,
        stock_type: "SKU" as const,
        style_name: record.style_name,
        order_no: record.order_no,
        article_no: record.article_no,
        sku_code: record.sku_code,
        barcode: record.barcode,
        brand: record.brand,
        size: record.size,
        colour: record.colour,
        product_category: record.product_category,
        sub_product_category: record.sub_product_category,
        current_stock: record.current_stock,
        location_name: record.location.location_name,
        added_time: record.added_time,
        added_user: record.added_user,
        source: record.source,
        qty_in: record.qty_in,
        qty_out: record.qty_out,
        gst_rate: record.gst_rate,
        hsn_code: record.hsn_code,
        purchase_price: record.purchase_price,
        sales_price: record.sales_price,
        mrp: record.mrp,
        inventory_bucket: "GENERAL" as const,
      })),
      ...generalReceiptRecords.map((record) => ({
        id: record.id,
        entity_id: record.entity_id,
        stock_type: "GENERAL_GRN" as const,
        style_name: record.style_name,
        order_no: record.order_no,
        article_no: record.article_no ?? "",
        sku_code: null,
        barcode: null,
        brand: record.brand,
        size: record.size,
        colour: record.colour,
        product_category: record.product_category,
        sub_product_category: null,
        current_stock: record.current_stock,
        location_name: record.location.location_name,
        added_time: record.posted_at,
        added_user: "Verified Work Order GRN",
        source: "WORK_ORDER_GRN",
        qty_in: record.quantity_in,
        qty_out: record.quantity_out,
        gst_rate: null,
        hsn_code: null,
        purchase_price: null,
        sales_price: null,
        mrp: null,
        inventory_bucket: "GENERAL" as const,
      })),
    ].sort((left, right) =>
      left.style_name.localeCompare(right.style_name, undefined, { sensitivity: "base" })
      || left.order_no.localeCompare(right.order_no, undefined, { sensitivity: "base" })
      || (left.size ?? "").localeCompare(right.size ?? "", undefined, { sensitivity: "base" })
      || left.id.localeCompare(right.id)
      || left.stock_type.localeCompare(right.stock_type),
    );
    const hasMore = records.length > resultLimit;

    return NextResponse.json({ records: records.slice(0, resultLimit), hasMore });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load General finished-goods stock." },
      { status: 400 },
    );
  }
}
