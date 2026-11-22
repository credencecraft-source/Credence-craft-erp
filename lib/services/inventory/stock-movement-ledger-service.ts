import { Prisma } from "@prisma/client";

export type StockMovementClass = "RAW_MATERIAL" | "FINISHED_GOODS" | "FG_SKU";
export type StockMovementType =
  | "GRN_RECEIPT"
  | "RESERVATION"
  | "RESERVATION_RELEASE"
  | "ISSUE_OUTWARD"
  | "POS_SALE"
  | "POS_RETURN"
  | "WO_FG_GRN"
  | "ADJUSTMENT"
  | "REVERSAL";

type LedgerInput = {
  organizationId: string;
  stockClass: StockMovementClass;
  stockRecordId: string;
  itemId?: string | null;
  variantId?: string | null;
  skuId?: string | null;
  storageNodeId?: string | null;
  movementType: StockMovementType;
  quantityDelta: Prisma.Decimal | string | number;
  uom: string;
  sourceDocType: string;
  sourceDocId: string;
  sourceLineId?: string | null;
  idempotencyKey: string;
  reason?: string | null;
  actorId?: string | null;
};

export async function postStockMovement(
  tx: Prisma.TransactionClient,
  input: LedgerInput,
): Promise<{ beforeQty: Prisma.Decimal; afterQty: Prisma.Decimal }> {
  const existing = await tx.stockMovement.findFirst({
    where: {
      organization_id: input.organizationId,
      idempotency_key: input.idempotencyKey,
    },
  });
  if (existing) {
    return {
      beforeQty: new Prisma.Decimal(existing.before_qty),
      afterQty: new Prisma.Decimal(existing.after_qty),
    };
  }

  const table = input.stockClass === "RAW_MATERIAL"
    ? "raw_material_stocks"
    : input.stockClass === "FINISHED_GOODS"
      ? "finished_goods_stocks"
      : "finished_goods_sku_stocks";
  await tx.$queryRawUnsafe(
    `SELECT "id" FROM "${table}" WHERE "organization_id" = $1 AND "id" = $2 FOR UPDATE`,
    input.organizationId,
    input.stockRecordId,
  );

  let beforeQty: Prisma.Decimal;
  let afterQty: Prisma.Decimal;
  if (input.stockClass === "RAW_MATERIAL") {
    const stock = await tx.rawMaterialStock.findFirst({
      where: { organization_id: input.organizationId, id: input.stockRecordId },
      select: { quantity_on_hand: true },
    });
    if (!stock) throw new Error("Raw material stock record was not found.");
    beforeQty = new Prisma.Decimal(stock.quantity_on_hand);
    const delta = new Prisma.Decimal(input.quantityDelta);
    afterQty = beforeQty.plus(delta);
    await tx.rawMaterialStock.update({
      where: { organization_id_id: { organization_id: input.organizationId, id: input.stockRecordId } },
      data: { quantity_on_hand: afterQty },
    });
  } else if (input.stockClass === "FINISHED_GOODS") {
    const stock = await tx.finishedGoodsStock.findFirst({
      where: { organization_id: input.organizationId, id: input.stockRecordId },
      select: { quantity_on_hand: true },
    });
    if (!stock) throw new Error("Finished goods stock record was not found.");
    beforeQty = new Prisma.Decimal(stock.quantity_on_hand);
    const delta = new Prisma.Decimal(input.quantityDelta);
    afterQty = beforeQty.plus(delta);
    await tx.finishedGoodsStock.update({
      where: { organization_id_id: { organization_id: input.organizationId, id: input.stockRecordId } },
      data: { quantity_on_hand: afterQty },
    });
  } else {
    const stock = await tx.finishedGoodsSkuStock.findFirst({
      where: { organization_id: input.organizationId, id: input.stockRecordId },
      select: { current_stock: true, qty_in: true, qty_out: true },
    });
    if (!stock) throw new Error("FG SKU stock record was not found.");
    beforeQty = new Prisma.Decimal(stock.current_stock);
    const delta = new Prisma.Decimal(input.quantityDelta);
    afterQty = beforeQty.plus(delta);
    await tx.finishedGoodsSkuStock.update({
      where: { organization_id_id: { organization_id: input.organizationId, id: input.stockRecordId } },
      data: {
        current_stock: afterQty,
        ...(delta.gte(0) ? { qty_in: { increment: delta } } : { qty_out: { increment: delta.abs() } }),
      },
    });
  }

  await tx.stockMovement.create({
    data: {
      organization_id: input.organizationId,
      stock_class: input.stockClass,
      stock_record_id: input.stockRecordId,
      item_id: input.itemId ?? null,
      variant_id: input.variantId ?? null,
      sku_id: input.skuId ?? null,
      storage_node_id: input.storageNodeId ?? null,
      movement_type: input.movementType,
      quantity_delta: new Prisma.Decimal(input.quantityDelta),
      before_qty: beforeQty,
      after_qty: afterQty,
      uom: input.uom,
      source_doc_type: input.sourceDocType,
      source_doc_id: input.sourceDocId,
      source_line_id: input.sourceLineId ?? null,
      idempotency_key: input.idempotencyKey,
      reason: input.reason ?? null,
      actor_id: input.actorId ?? null,
    },
  });
  return { beforeQty, afterQty };
}
