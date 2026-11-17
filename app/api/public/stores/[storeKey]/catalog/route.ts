import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { GENERAL_FINISHED_GOODS_SKU_SOURCES } from "@/lib/services/inventory/finished-goods-stock-overview";
import { listEnabledOnlineStoreLocations } from "@/lib/services/pos/online-store-inventory-service";
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
    const locationId = searchParams.get("locationId")?.trim() || null;
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

    const locations = await listEnabledOnlineStoreLocations(store.id);
    if (!locationId) {
      return NextResponse.json({
        storeName: store.organization_name,
        locations: locations.map(({ id, name }) => ({ id, name })),
        records: [],
        hasMore: false,
      });
    }
    const location = locations.find((item) => item.id === locationId);
    if (!location) {
      return NextResponse.json({ error: "Select an active online-store location." }, { status: 400 });
    }

    const records = await prisma.finishedGoodsSkuStock.findMany({
      where: {
        organization_id: store.id,
        entity_id: location.entityId,
        location_id: location.id,
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
      locations: locations.map(({ id, name }) => ({ id, name })),
      records: records.slice(0, limit).map((record) => ({ ...record, stock_type: "SKU" as const })),
      hasMore: records.length > limit,
    });
  } catch (error) {
    console.error("Public online-store catalog failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "The store catalog could not be loaded." }, { status: 500 });
  }
}
