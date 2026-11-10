import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { GENERAL_FINISHED_GOODS_SKU_SOURCES } from "@/lib/services/inventory/finished-goods-stock-overview";
import { findPublishedOnlineStore } from "@/lib/services/pos/public-online-store-service";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 50;

export async function GET(
  request: Request,
  context: { params: Promise<{ storeKey: string }> },
) {
  try {
    const { storeKey } = await context.params;
    const store = await findPublishedOnlineStore(storeKey);
    if (!store) return NextResponse.json({ error: "This store is not available." }, { status: 404 });

    const searchParams = new URL(request.url).searchParams;
    const entityId = searchParams.get("entityId")?.trim() || null;
    const search = searchParams.get("search")?.trim() ?? "";
    const rawLimit = searchParams.get("limit");
    const rawOffset = searchParams.get("offset");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    const offset = rawOffset === null ? 0 : Number(rawOffset);
    if (
      (rawLimit !== null && (!/^\d{1,2}$/.test(rawLimit) || limit < 1 || limit > MAX_PAGE_SIZE))
      || (rawOffset !== null && (!/^\d{1,5}$/.test(rawOffset) || offset > 10000))
      || (search.length > 0 && (search.length < 2 || search.length > 100))
    ) {
      return NextResponse.json({ error: "Enter valid bounded catalog search details." }, { status: 400 });
    }

    const entities = await prisma.masterEntity.findMany({
      where: { organization_id: store.id, is_active: true },
      select: { id: true, entity_name: true },
      orderBy: [{ sort_order: "asc" }, { entity_name: "asc" }, { id: "asc" }],
      take: 100,
    });
    if (!entityId) {
      return NextResponse.json({
        storeName: store.organization_name,
        entities: entities.map(({ id, entity_name }) => ({ id, name: entity_name })),
        records: [],
        hasMore: false,
      });
    }
    if (!entities.some((entity) => entity.id === entityId)) {
      return NextResponse.json({ error: "Select an active store." }, { status: 400 });
    }

    const records = await prisma.finishedGoodsSkuStock.findMany({
      where: {
        organization_id: store.id,
        entity_id: entityId,
        source: { in: [...GENERAL_FINISHED_GOODS_SKU_SOURCES] },
        current_stock: { gt: 0 },
        OR: [{ sales_price: { gt: 0 } }, { mrp: { gt: 0 } }],
        ...(search
          ? {
              AND: [{
                OR: [
                  { style_name: { contains: search, mode: "insensitive" as const } },
                  { article_no: { contains: search, mode: "insensitive" as const } },
                  { brand: { contains: search, mode: "insensitive" as const } },
                  { size: { contains: search, mode: "insensitive" as const } },
                  { colour: { contains: search, mode: "insensitive" as const } },
                ],
              }],
            }
          : {}),
      },
      select: {
        id: true,
        style_name: true,
        order_no: true,
        article_no: true,
        brand: true,
        size: true,
        colour: true,
        current_stock: true,
        gst_rate: true,
        hsn_code: true,
        sales_price: true,
        mrp: true,
      },
      orderBy: [{ style_name: "asc" }, { order_no: "asc" }, { size: "asc" }, { id: "asc" }],
      skip: offset,
      take: limit + 1,
    });

    return NextResponse.json({
      storeName: store.organization_name,
      entities: entities.map(({ id, entity_name }) => ({ id, name: entity_name })),
      records: records.slice(0, limit).map((record) => ({ ...record, stock_type: "SKU" as const })),
      hasMore: records.length > limit,
    });
  } catch {
    return NextResponse.json({ error: "The store catalog could not be loaded." }, { status: 500 });
  }
}
