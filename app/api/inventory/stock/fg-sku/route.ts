import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { getFinishedGoodsSourceHierarchy } from "@/lib/services/inventory/finished-goods-stock-overview";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";
import {
  buildPosStockSkuCode,
  reserveNextPosBarcode,
} from "@/lib/services/pos/pos-stock-identifiers";

const MANUAL_SOURCES = ["DIRECT", "DIRECT_FROM_INVENTORY", "DIRECT_FROM_POS", "PACKING_LIST_GRN"] as const;
const POS_SKU_SOURCES = [
  "DIRECT_FROM_POS",
  "POS",
  "POS_PURCHASE_BILL",
] as const;

function errorStatus(error: unknown) {
  return error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400;
}

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
    const recordId = searchParams.get("recordId")?.trim();
    const recordType = searchParams.get("recordType");
    if (recordId) {
      if (!recordType || !["general", "allocated"].includes(recordType)) {
        return NextResponse.json({ error: "Select a valid finished-goods stock record type." }, { status: 400 });
      }

      if (recordType === "general") {
        const record = await prisma.finishedGoodsGeneralStockReceipt.findFirst({
          where: { id: recordId, organization_id: organization.id },
          include: { location: { select: { location_name: true } } },
        });
        if (!record) return NextResponse.json({ error: "Finished-goods stock record not found." }, { status: 404 });
        const actors = await prisma.workspaceUser.findMany({
          where: { id: { in: [record.created_by, record.verified_by] } },
          select: { id: true, email: true },
        });
        const actorEmails = new Map(actors.map((actor) => [actor.id, actor.email || "Email unavailable"]));
        const createdBy = resolveActorEmail(record.created_by, actorEmails);
        return NextResponse.json({
          record: {
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
            added_user: createdBy,
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
            created_by: createdBy,
            verified_by: resolveActorEmail(record.verified_by, actorEmails),
            posted_at: record.posted_at,
          },
        });
      }

      const record = await prisma.finishedGoodsAllocatedStockReceipt.findFirst({
        where: { id: recordId, organization_id: organization.id },
        include: { location: { select: { location_name: true } } },
      });
      if (!record) return NextResponse.json({ error: "Finished-goods stock record not found." }, { status: 404 });
      const actors = await prisma.workspaceUser.findMany({
        where: { id: { in: [record.created_by, record.verified_by] } },
        select: { id: true, email: true },
      });
      const actorEmails = new Map(actors.map((actor) => [actor.id, actor.email || "Email unavailable"]));
      const createdBy = resolveActorEmail(record.created_by, actorEmails);
      return NextResponse.json({
        record: {
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
          added_user: createdBy,
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
          created_by: createdBy,
          verified_by: resolveActorEmail(record.verified_by, actorEmails),
          posted_at: record.posted_at,
        },
      });
    }

    const barcode = searchParams.get("barcode")?.trim();
    if (barcode) {
      const record = await prisma.finishedGoodsSkuStock.findFirst({
        where: { organization_id: organization.id, OR: [{ id: barcode }, { sku_code: barcode }, { barcode }] },
        include: {
          location: {
            select: {
              location_name: true,
              entity: { select: { entity_name: true } },
            },
          },
        },
      });
      if (!record) return NextResponse.json({ error: "No finished goods stock record found for this barcode." }, { status: 404 });
      return NextResponse.json({
        record,
        canEdit: ["OWNER", "ADMIN", "INVENTORY"].includes(organization.role),
      });
    }

    const bucket = searchParams.get("bucket");
    if (bucket && bucket !== "GENERAL" && bucket !== "ALLOCATED") {
      return NextResponse.json({ error: "Select a valid finished-goods stock bucket." }, { status: 400 });
    }
    const surface = searchParams.get("surface");
    if (surface && surface !== "POS") {
      return NextResponse.json({ error: "Select a valid finished-goods stock surface." }, { status: 400 });
    }
    const [skuRecords, generalReceipts, allocatedReceipts] = await Promise.all([
      prisma.finishedGoodsSkuStock.findMany({
        where: {
          organization_id: organization.id,
          ...(surface === "POS" ? { source: { in: [...POS_SKU_SOURCES] } } : {}),
        },
        include: { location: { select: { location_name: true } } },
        orderBy: { added_time: "desc" },
      }),
      surface === "POS" || bucket === "ALLOCATED" ? Promise.resolve([]) : prisma.finishedGoodsGeneralStockReceipt.findMany({
        where: { organization_id: organization.id },
        include: { location: { select: { location_name: true } } },
        orderBy: { posted_at: "desc" },
      }),
      surface === "POS" || bucket === "GENERAL" ? Promise.resolve([]) : prisma.finishedGoodsAllocatedStockReceipt.findMany({
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
      .map((record) => ({ ...record, ...getFinishedGoodsSourceHierarchy(record.source) }))
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
    await requireOrganizationPermission(user.id, organization.id, "CREATE_FINISHED_GOODS_STOCK");
    const locationId = String(body.locationId ?? "").trim();
    const location = locationId
      ? await prisma.masterLocation.findFirst({
        where: { id: locationId, organization_id: organization.id, is_active: true },
        select: { id: true, entity_id: true },
      })
      : null;
    if (!location) return NextResponse.json({ error: "Select an active Location for this stock record." }, { status: 400 });
    const source = String(body.source ?? "");
    const isPosSource = source === "DIRECT_FROM_POS";
    const directItemName = [body.productCategory, body.subProductCategory, body.brand, body.size, body.colour]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .join(" - ");
    const isDirectSource = (MANUAL_SOURCES as readonly string[]).includes(source) && source !== "PACKING_LIST_GRN";
    const styleName = isPosSource
      ? String(body.styleName ?? "").trim()
      : String(body.styleName ?? "").trim() || (isDirectSource ? directItemName : "");
    const orderNo = String(body.orderNo ?? "").trim() || (isDirectSource ? "DIRECT" : "");
    const articleNo = String(body.articleNo ?? "").trim() || (isDirectSource ? "DIRECT" : "");
    const qtyIn = Number(body.qtyIn ?? 0);
    const qtyOut = Number(body.qtyOut ?? 0);

    if (!styleName || !orderNo || !articleNo || !MANUAL_SOURCES.includes(source as (typeof MANUAL_SOURCES)[number])) {
      return NextResponse.json({
        error: isPosSource
          ? "Enter the POS style name, colour, and size."
          : isDirectSource
            ? "Select at least one catalogue value to generate the item name."
            : "Style name, order no, article no, and a valid source are required.",
      }, { status: 400 });
    }
    if (!Number.isFinite(qtyIn) || !Number.isFinite(qtyOut) || qtyIn < 0 || qtyOut < 0) {
      return NextResponse.json({ error: "Quantity values must be non-negative numbers." }, { status: 400 });
    }

    const normalizedStyle = isPosSource ? normalizeUppercase(styleName) : styleName;
    const normalizedColour = isPosSource ? normalizeUppercase(String(body.colour ?? "").trim()) : String(body.colour ?? "").trim();
    const normalizedSize = isPosSource ? normalizeUppercase(String(body.size ?? "").trim()) : String(body.size ?? "").trim();
    const posSkuCode = isPosSource
      ? buildPosStockSkuCode(normalizedStyle, normalizedColour, normalizedSize)
      : null;
    if (isPosSource && !posSkuCode) {
      return NextResponse.json({
        error: "POS stock needs a style name, colour, and size; the generated SKU must be 50 characters or fewer.",
      }, { status: 400 });
    }

    const data = {
        organization_id: organization.id,
        entity_id: location.entity_id,
        location_id: location.id,
        sku_code: posSkuCode ?? await nextSkuCode(organization.id),
        barcode: String(body.barcode ?? "").trim() || null,
        style_name: normalizedStyle,
        order_no: orderNo,
        article_no: articleNo,
        brand: isPosSource ? normalizeUppercase(String(body.brand ?? "").trim()) || null : String(body.brand ?? "").trim() || null,
        size: normalizedSize || null,
        colour: normalizedColour || null,
        product_category: isPosSource ? normalizeUppercase(String(body.productCategory ?? "").trim()) || null : String(body.productCategory ?? "").trim() || null,
        sub_product_category: isPosSource ? normalizeUppercase(String(body.subProductCategory ?? "").trim()) || null : String(body.subProductCategory ?? "").trim() || null,
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
    };

    const record = isPosSource
      ? await prisma.$transaction(async (transaction) => {
        const duplicate = await transaction.finishedGoodsSkuStock.findFirst({
          where: { organization_id: organization.id, sku_code: posSkuCode },
          select: { id: true },
        });
        if (duplicate) {
          throw new Error("POS_SKU_CONFLICT");
        }
        const barcode = await reserveNextPosBarcode(transaction, organization.id);
        return transaction.finishedGoodsSkuStock.create({
          data: { ...data, barcode },
        });
      })
      : await prisma.finishedGoodsSkuStock.create({ data });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({
        error: "A stock item with this SKU or barcode already exists in this organization.",
      }, { status: 409 });
    }
    if (error instanceof Error && error.message === "POS_SKU_CONFLICT") {
      return NextResponse.json({
        error: "A POS stock item with this style, colour, and size already exists. Refresh and check the stock report.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create finished goods SKU stock." }, { status: errorStatus(error) });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organizationId = String(body.organizationId ?? "");
    const recordId = String(body.recordId ?? "");
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
    await requireOrganizationPermission(user.id, organization.id, "ADJUST_FINISHED_GOODS_STOCK");
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
    const usesPosIdentifiers = ["DIRECT_FROM_POS", "POS", "POS_PURCHASE_BILL"].includes(existing.source);
    const location = await prisma.masterLocation.findFirst({
      where: { id: locationId, organization_id: organization.id, is_active: true },
      select: { id: true, entity_id: true },
    });
    if (!location) return NextResponse.json({ error: "Select an active Location for this stock record." }, { status: 400 });
    if (!styleName || !orderNo || !articleNo
      || (usesPosIdentifiers && source !== existing.source)
      || (!MANUAL_SOURCES.includes(source as (typeof MANUAL_SOURCES)[number]) && source !== existing.source)) {
      return NextResponse.json({ error: "Style name, order no, article no, and a valid source are required." }, { status: 400 });
    }
    if (![qtyIn, qtyOut].every((value) => Number.isFinite(value) && value >= 0)) return NextResponse.json({ error: "Quantity values must be non-negative numbers." }, { status: 400 });
    const normalizedStyle = usesPosIdentifiers ? normalizeUppercase(styleName) : styleName;
    const normalizedSize = normalizeUppercase(String(body.size ?? existing.size ?? "").trim());
    const normalizedColour = normalizeUppercase(String(body.colour ?? existing.colour ?? "").trim());
    const skuCode = usesPosIdentifiers
      ? buildPosStockSkuCode(normalizedStyle, normalizedColour, normalizedSize)
      : existing.sku_code;
    if (usesPosIdentifiers && !skuCode) {
      return NextResponse.json({
        error: "POS stock needs a style name, colour, and size; the generated SKU must be 50 characters or fewer.",
      }, { status: 400 });
    }
    if (usesPosIdentifiers) {
      const duplicate = await prisma.finishedGoodsSkuStock.findFirst({
        where: {
          organization_id: organization.id,
          sku_code: skuCode,
          id: { not: existing.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return NextResponse.json({
          error: "A POS stock item with this style, colour, and size already exists.",
        }, { status: 409 });
      }
    }

    const record = await prisma.finishedGoodsSkuStock.update({
      where: { id: recordId, organization_id: organization.id },
      include: {
        location: {
          select: {
            location_name: true,
            entity: { select: { entity_name: true } },
          },
        },
      },
      data: {
        entity_id: location.entity_id,
        location_id: location.id,
        sku_code: skuCode,
        style_name: normalizedStyle, order_no: orderNo, article_no: articleNo,
        barcode: usesPosIdentifiers ? existing.barcode : String(body.barcode ?? "").trim() || null,
        brand: normalizeUppercase(String(body.brand ?? existing.brand ?? "").trim()) || null, size: normalizedSize || null, colour: normalizedColour || null,
        product_category: normalizeUppercase(String(body.productCategory ?? existing.product_category ?? "").trim()) || null, sub_product_category: normalizeUppercase(String(body.subProductCategory ?? existing.sub_product_category ?? "").trim()) || null,
        gst_rate: body.gstRate === "" || body.gstRate === null ? null : Number(body.gstRate), hsn_code: String(body.hsnCode ?? "").trim() || null,
        purchase_price: body.purchasePrice === "" || body.purchasePrice === null ? null : Number(body.purchasePrice), sales_price: body.salesPrice === "" || body.salesPrice === null ? null : Number(body.salesPrice), mrp: body.mrp === "" || body.mrp === null ? null : Number(body.mrp),
        source, qty_in: qtyIn, qty_out: qtyOut, current_stock: qtyIn - qtyOut,
      },
    });
    return NextResponse.json({ record });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({
        error: "A stock item with this SKU or barcode already exists in this organization.",
      }, { status: 409 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update finished goods SKU stock." }, { status: errorStatus(error) });
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