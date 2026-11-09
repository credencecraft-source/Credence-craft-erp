import {
  FGMaterialIssueMovement,
  FGMaterialIssueSource,
  FGMaterialIssueStockType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";

type Database = Prisma.TransactionClient | typeof prisma;

export type FgIssuedFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  sourceType?: FGMaterialIssueSource;
  movement?: FGMaterialIssueMovement;
  skuStockId?: string;
  page: number;
  pageSize: number;
};

export type FgMaterialIssueLineInput = {
  stockType: FGMaterialIssueStockType;
  skuStockId?: string | null;
  generalReceiptId?: string | null;
  allocatedReceiptId?: string | null;
  shipmentBoxLineId?: string | null;
  posInvoiceLineId?: string | null;
  reversalOfLineId?: string | null;
  itemCode?: string | null;
  styleName: string;
  articleNo?: string | null;
  size?: string | null;
  colour?: string | null;
  quantity: Prisma.Decimal;
  uomCode: string;
  stockBefore: Prisma.Decimal;
  stockAfter: Prisma.Decimal;
};

export type CreateFgMaterialIssueInput = {
  organizationId: string;
  sourceType: FGMaterialIssueSource;
  movement: FGMaterialIssueMovement;
  packingListId?: string | null;
  posInvoiceId?: string | null;
  reversalOfId?: string | null;
  idempotencyKey: string;
  sourceReference?: string | null;
  issuedBy: string;
  issuedAt?: Date;
  reason?: string | null;
  lines: FgMaterialIssueLineInput[];
};

export async function createFgMaterialIssue(
  database: Database,
  input: CreateFgMaterialIssueInput,
) {
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 160) {
    throw new Error("A valid FG issue idempotency key is required.");
  }
  if (input.sourceType === FGMaterialIssueSource.PACKING_LIST && !input.packingListId) {
    throw new Error("A packing-list FG issue must reference its packing list.");
  }
  if (input.sourceType === FGMaterialIssueSource.POS_INVOICE && !input.posInvoiceId) {
    throw new Error("A POS FG issue must reference its invoice.");
  }
  if (input.sourceType === FGMaterialIssueSource.MANUAL_ADJUSTMENT && (input.packingListId || input.posInvoiceId)) {
    throw new Error("A manual FG adjustment cannot reference a packing list or POS invoice.");
  }
  if (input.packingListId && input.posInvoiceId) {
    throw new Error("An FG issue can only reference one source document.");
  }
  if (input.lines.length === 0 || input.lines.length > 500) {
    throw new Error("An FG issue must contain between 1 and 500 stock movement lines.");
  }
  for (const line of input.lines) {
    const stockSourceIds = [
      line.skuStockId,
      line.generalReceiptId,
      line.allocatedReceiptId,
    ].filter(Boolean);
    const expectedStockSourceId = line.stockType === FGMaterialIssueStockType.SKU
      ? line.skuStockId
      : line.stockType === FGMaterialIssueStockType.GENERAL
        ? line.generalReceiptId
        : line.allocatedReceiptId;
    if (stockSourceIds.length !== 1 || !expectedStockSourceId) {
      throw new Error("Each FG issue line must reference exactly one matching stock record.");
    }
    if (!line.quantity.isFinite() || !line.quantity.gt(0)) {
      throw new Error("FG issue quantities must be positive finite values.");
    }
    const expectedAfter = input.movement === FGMaterialIssueMovement.ISSUE
      ? line.stockBefore.minus(line.quantity)
      : line.stockBefore.plus(line.quantity);
    if (!line.stockBefore.isFinite() || line.stockBefore.lt(0)
      || !line.stockAfter.isFinite() || line.stockAfter.lt(0)
      || !expectedAfter.equals(line.stockAfter)) {
      throw new Error("FG issue stock snapshots do not match the recorded movement.");
    }
    if (!line.styleName.trim() || !line.uomCode.trim()) {
      throw new Error("FG issue lines require a style name and unit of measure.");
    }
  }

  const existing = await database.fGMaterialIssue.findFirst({
    where: {
      organization_id: input.organizationId,
      idempotency_key: idempotencyKey,
    },
    select: { id: true, issue_no: true },
  });
  if (existing) return existing;

  const issueNo = await reserveProcurementDocumentNumber(
    input.organizationId,
    "FG_MATERIAL_ISSUE",
    database,
  );
  const data: Prisma.FGMaterialIssueUncheckedCreateInput = {
    organization_id: input.organizationId,
    issue_no: issueNo,
    source_type: input.sourceType,
    movement: input.movement,
    packing_list_id: input.packingListId ?? null,
    pos_invoice_id: input.posInvoiceId ?? null,
    reversal_of_id: input.reversalOfId ?? null,
    idempotency_key: idempotencyKey,
    source_reference: input.sourceReference ?? null,
    issued_by: input.issuedBy,
    issued_at: input.issuedAt,
    reason: input.reason ?? null,
    lines: {
      create: input.lines.map((line, index) => ({
        line_no: index + 1,
        stock_type: line.stockType,
        sku_stock_id: line.skuStockId ?? null,
        general_receipt_id: line.generalReceiptId ?? null,
        allocated_receipt_id: line.allocatedReceiptId ?? null,
        shipment_box_line_id: line.shipmentBoxLineId ?? null,
        pos_invoice_line_id: line.posInvoiceLineId ?? null,
        reversal_of_line_id: line.reversalOfLineId ?? null,
        item_code: line.itemCode ?? null,
        style_name: line.styleName,
        article_no: line.articleNo ?? null,
        size: line.size ?? null,
        colour: line.colour ?? null,
        quantity: line.quantity,
        uom_code: line.uomCode,
        stock_before: line.stockBefore,
        stock_after: line.stockAfter,
      })),
    },
  };
  return database.fGMaterialIssue.create({
    data,
    select: { id: true, issue_no: true },
  });
}

export async function listFgIssued(
  organizationId: string,
  filters: FgIssuedFilters,
) {
  const where: Prisma.FGMaterialIssueWhereInput = {
    organization_id: organizationId,
    ...(filters.sourceType ? { source_type: filters.sourceType } : {}),
    ...(filters.movement ? { movement: filters.movement } : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          issued_at: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
    ...(filters.skuStockId
      ? {
          lines: {
            some: {
              organization_id: organizationId,
              stock_type: FGMaterialIssueStockType.SKU,
              sku_stock_id: filters.skuStockId,
            },
          },
        }
      : {}),
  };
  const lineWhere: Prisma.FGMaterialIssueLineWhereInput = filters.skuStockId
    ? {
        organization_id: organizationId,
        stock_type: FGMaterialIssueStockType.SKU,
        sku_stock_id: filters.skuStockId,
      }
    : {};
  const skip = (filters.page - 1) * filters.pageSize;
  const [issues, total] = await Promise.all([
    prisma.fGMaterialIssue.findMany({
      where,
      orderBy: [{ issued_at: "desc" }, { id: "desc" }],
      skip,
      take: filters.pageSize,
      select: {
        id: true,
        issue_no: true,
        source_type: true,
        movement: true,
        packing_list_id: true,
        pos_invoice_id: true,
        source_reference: true,
        issued_by: true,
        issued_at: true,
        packingList: { select: { packing_list_no: true } },
        posInvoice: { select: { invoice_no: true } },
        lines: {
          where: lineWhere,
          orderBy: [{ line_no: "asc" }, { id: "asc" }],
          take: 500,
          select: {
            id: true,
            line_no: true,
            stock_type: true,
            item_code: true,
            style_name: true,
            article_no: true,
            size: true,
            colour: true,
            quantity: true,
            uom_code: true,
            stock_before: true,
            stock_after: true,
          },
        },
      },
    }),
    prisma.fGMaterialIssue.count({ where }),
  ]);
  const records = issues.flatMap((issue) => {
    const sourceReference = issue.source_reference
      ?? issue.packingList?.packing_list_no
      ?? issue.posInvoice?.invoice_no
      ?? null;
    return issue.lines.map((line) => ({
      id: line.id,
      issueId: issue.id,
      issueNo: issue.issue_no,
      issuedAt: issue.issued_at.toISOString(),
      sourceType: issue.source_type,
      movement: issue.movement,
      sourceDocumentId: issue.packing_list_id ?? issue.pos_invoice_id,
      sourceReference,
      issuedBy: issue.issued_by,
      stockType: line.stock_type,
      itemCode: line.item_code,
      styleName: line.style_name,
      articleNo: line.article_no,
      size: line.size,
      colour: line.colour,
      quantity: line.quantity.toFixed(2),
      uomCode: line.uom_code,
      stockBefore: line.stock_before.toFixed(2),
      stockAfter: line.stock_after.toFixed(2),
    }));
  });
  return {
    records,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    hasMore: skip + issues.length < total,
  };
}
