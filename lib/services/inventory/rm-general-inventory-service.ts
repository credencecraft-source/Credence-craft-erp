import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

const zero = () => new Prisma.Decimal(0);

function stockKey(locationId: string, rawMaterial: string) {
  return `${locationId}\u0000${rawMaterial}`;
}

export async function listRawMaterialGeneralInventory(organizationId: string) {
  const [stockRows, receiptLines] = await Promise.all([
    prisma.rawMaterialStock.findMany({
      where: { organization_id: organizationId },
      orderBy: [{ location_id: "asc" }, { raw_material: "asc" }, { created_at: "desc" }],
      include: {
        location: { select: { location_name: true } },
        receiptLine: {
          select: {
            id: true,
            rejected_quantity: true,
            receipt: { select: { receipt_no: true, received_date: true } },
            rmGrnVerification: { select: { fresh_excess: true, rejected_quantity: true, total_excess: true } },
          },
        },
      },
    }),
    prisma.inventoryReceiptLine.findMany({
      where: { receipt: { organization_id: organizationId } },
      select: {
        id: true,
        raw_material: true,
        rejected_quantity: true,
        receipt: {
          select: {
            location_id: true,
            location: { select: { location_name: true } },
          },
        },
        rmGrnVerification: {
          select: {
            fresh_excess: true,
            rejected_quantity: true,
            total_excess: true,
          },
        },
      },
    }),
  ]);

  const totalsByStockKey = new Map<string, {
    locationId: string;
    location: { location_name: string };
    rawMaterial: string;
    freshExcess: Prisma.Decimal;
    rejectedQuantity: Prisma.Decimal;
    totalExcess: Prisma.Decimal;
  }>();
  const linkedReceiptLineIds = new Set(
    stockRows.map((row) => row.inventory_receipt_line_id).filter((id): id is string => Boolean(id)),
  );
  const legacyStockKeys = new Set(
    stockRows
      .filter((row) => row.source_type === "LEGACY")
      .map((row) => stockKey(row.location_id, row.raw_material)),
  );

  for (const line of receiptLines) {
    if (!line.raw_material || linkedReceiptLineIds.has(line.id)) continue;
    const { location_id: locationId, location } = line.receipt;
    const key = stockKey(locationId, line.raw_material);
    const totals = totalsByStockKey.get(key) ?? {
      locationId,
      location,
      rawMaterial: line.raw_material,
      freshExcess: zero(),
      rejectedQuantity: zero(),
      totalExcess: zero(),
    };
    totals.freshExcess = totals.freshExcess.plus(line.rmGrnVerification?.fresh_excess ?? zero());
    totals.rejectedQuantity = totals.rejectedQuantity.plus(
      line.rmGrnVerification?.rejected_quantity ?? line.rejected_quantity,
    );
    totals.totalExcess = totals.totalExcess.plus(line.rmGrnVerification?.total_excess ?? zero());
    totalsByStockKey.set(key, totals);
  }

  const existingRows = stockRows.map((row) => {
    const sourceType = row.source_type ?? (row.inventory_receipt_line_id ? "GRN" : "LEGACY");
    const totals = sourceType === "LEGACY" ? totalsByStockKey.get(stockKey(row.location_id, row.raw_material)) : undefined;
    const verification = row.receiptLine?.rmGrnVerification;
    return {
      ...row,
      source_type: sourceType,
      receipt_no: row.receiptLine?.receipt.receipt_no ?? null,
      received_at: row.receiptLine?.receipt.received_date ?? row.created_at ?? null,
      fresh_excess: sourceType === "GRN" ? verification?.fresh_excess ?? zero() : totals?.freshExcess ?? zero(),
      rejected_quantity: sourceType === "GRN"
        ? verification?.rejected_quantity ?? row.receiptLine?.rejected_quantity ?? zero()
        : totals?.rejectedQuantity ?? zero(),
      total_excess: sourceType === "GRN" ? verification?.total_excess ?? zero() : totals?.totalExcess ?? zero(),
    };
  });
  const receiptOnlyRows = [...totalsByStockKey.entries()]
    .filter(([key]) => !legacyStockKeys.has(key))
    .map(([, totals]) => ({
      id: `grn:${totals.locationId}:${totals.rawMaterial}`,
      location_id: totals.locationId,
      location: totals.location,
      raw_material: totals.rawMaterial,
      source_type: "LEGACY",
      receipt_no: null,
      received_at: null,
      quantity_on_hand: zero(),
      quantity_reserved: zero(),
      quantity_issued: zero(),
      fresh_excess: totals.freshExcess,
      rejected_quantity: totals.rejectedQuantity,
      total_excess: totals.totalExcess,
    }));

  return [...existingRows, ...receiptOnlyRows];
}