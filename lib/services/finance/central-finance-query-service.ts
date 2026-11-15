import {
  FinanceDocumentStatus,
  FinanceDocumentType,
  FinanceExternalProvider,
  FinanceSourceModule,
  FinanceSyncStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

type TransactionCursor = { id: string; documentDate: Date };
type OutboxCursor = { id: string; createdAt: Date };

function sanitizedSyncError(value: Prisma.JsonValue | null | undefined) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Prisma.JsonObject;
  const code = typeof candidate.code === "string" && /^[A-Z0-9_]{1,80}$/.test(candidate.code)
    ? candidate.code
    : "PROVIDER_REQUEST_FAILED";
  return {
    code,
    message: "Provider synchronization failed. Review the saved provider settings and retry.",
  };
}

function transactionWhere(input: {
  organizationId: string;
  search?: string;
  status?: FinanceDocumentStatus;
  documentType?: FinanceDocumentType;
  sourceModule?: FinanceSourceModule;
}): Prisma.CentralFinanceTransactionWhereInput {
  const search = input.search?.trim() ?? "";
  return {
    organization_id: input.organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.documentType ? { document_type: input.documentType } : {}),
    ...(input.sourceModule ? { source_module: input.sourceModule } : {}),
    ...(search ? {
      OR: [
        { document_number: { contains: search, mode: "insensitive" } },
        { source_document_number: { contains: search, mode: "insensitive" } },
        { party_name: { contains: search, mode: "insensitive" } },
        { entity_name_snapshot: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };
}

export async function listCentralFinanceTransactions(input: {
  organizationId: string;
  search?: string;
  status?: FinanceDocumentStatus;
  documentType?: FinanceDocumentType;
  sourceModule?: FinanceSourceModule;
  take: number;
  cursor?: TransactionCursor | null;
}) {
  const where: Prisma.CentralFinanceTransactionWhereInput = {
    ...transactionWhere(input),
    ...(input.cursor ? {
      AND: [{
        OR: [
          { document_date: { lt: input.cursor.documentDate } },
          { document_date: input.cursor.documentDate, id: { lt: input.cursor.id } },
        ],
      }],
    } : {}),
  };
  const [records, count, aggregate] = await Promise.all([
    prisma.centralFinanceTransaction.findMany({
      where,
      orderBy: [{ document_date: "desc" }, { id: "desc" }],
      take: input.take + 1,
      select: {
        id: true,
        document_type: true,
        document_number: true,
        document_date: true,
        status: true,
        source_module: true,
        source_type: true,
        source_id: true,
        source_document_number: true,
        party_id: true,
        party_name: true,
        entity_name_snapshot: true,
        subtotal: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        total_tax_amount: true,
        total_amount: true,
        sync_status: true,
        external_provider: true,
        external_system_id: true,
        external_voucher_number: true,
        posted_at: true,
        _count: { select: { lines: true } },
      },
    }),
    prisma.centralFinanceTransaction.count({ where: transactionWhere(input) }),
    prisma.centralFinanceTransaction.aggregate({
      where: transactionWhere(input),
      _sum: {
        subtotal: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        total_tax_amount: true,
        total_amount: true,
      },
    }),
  ]);
  const hasMore = records.length > input.take;
  const pageRecords = records.slice(0, input.take);
  const next = hasMore ? pageRecords[pageRecords.length - 1] : null;

  return {
    transactions: pageRecords.map((record) => ({
      id: record.id,
      documentType: record.document_type,
      documentNumber: record.document_number,
      documentDate: record.document_date.toISOString().slice(0, 10),
      status: record.status,
      sourceModule: record.source_module,
      sourceType: record.source_type,
      sourceId: record.source_id,
      sourceDocumentNumber: record.source_document_number,
      partyId: record.party_id,
      partyName: record.party_name,
      entityName: record.entity_name_snapshot,
      subtotal: record.subtotal.toFixed(2),
      cgstAmount: record.cgst_amount.toFixed(2),
      sgstAmount: record.sgst_amount.toFixed(2),
      igstAmount: record.igst_amount.toFixed(2),
      totalTaxAmount: record.total_tax_amount.toFixed(2),
      totalAmount: record.total_amount.toFixed(2),
      syncStatus: record.sync_status,
      externalProvider: record.external_provider,
      externalSystemId: record.external_system_id,
      externalVoucherNumber: record.external_voucher_number,
      postedAt: record.posted_at?.toISOString() ?? null,
      lineCount: record._count.lines,
    })),
    count,
    totals: {
      subtotal: aggregate._sum.subtotal?.toFixed(2) ?? "0.00",
      cgstAmount: aggregate._sum.cgst_amount?.toFixed(2) ?? "0.00",
      sgstAmount: aggregate._sum.sgst_amount?.toFixed(2) ?? "0.00",
      igstAmount: aggregate._sum.igst_amount?.toFixed(2) ?? "0.00",
      totalTaxAmount: aggregate._sum.total_tax_amount?.toFixed(2) ?? "0.00",
      totalAmount: aggregate._sum.total_amount?.toFixed(2) ?? "0.00",
    },
    hasMore,
    nextCursor: next ? { id: next.id, documentDate: next.document_date } : null,
  };
}

export async function getCentralFinanceTransaction(organizationId: string, id: string) {
  const record = await prisma.centralFinanceTransaction.findFirst({
    where: { id, organization_id: organizationId },
    include: {
      lines: { orderBy: { line_number: "asc" } },
      outbox_logs: {
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          provider: true,
          status: true,
          event_type: true,
          attempt_count: true,
          available_at: true,
          processed_at: true,
          created_at: true,
          error_payload: true,
        },
      },
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    documentType: record.document_type,
    documentNumber: record.document_number,
    documentDate: record.document_date.toISOString().slice(0, 10),
    status: record.status,
    sourceModule: record.source_module,
    sourceType: record.source_type,
    sourceId: record.source_id,
    sourceDocumentNumber: record.source_document_number,
    subSource: record.sub_source,
    entityId: record.entity_id,
    entityName: record.entity_name_snapshot,
    entityGstin: record.entity_gstin,
    partyId: record.party_id,
    partyName: record.party_name,
    partyGstin: record.party_gstin,
    placeOfSupplyStateCode: record.place_of_supply_state_code,
    currencyCode: record.currency_code,
    subtotal: record.subtotal.toFixed(2),
    taxableAmount: record.taxable_amount.toFixed(2),
    cgstAmount: record.cgst_amount.toFixed(2),
    sgstAmount: record.sgst_amount.toFixed(2),
    igstAmount: record.igst_amount.toFixed(2),
    otherTaxAmount: record.other_tax_amount.toFixed(2),
    totalTaxAmount: record.total_tax_amount.toFixed(2),
    totalAmount: record.total_amount.toFixed(2),
    createdByUserId: record.created_by_user_id,
    createdByEmail: record.created_by_email,
    approvedByUserId: record.approved_by_user_id,
    approvedByEmail: record.approved_by_email,
    createdAt: record.created_at.toISOString(),
    postedAt: record.posted_at?.toISOString() ?? null,
    lockedAt: record.locked_at?.toISOString() ?? null,
    reversedAt: record.reversed_at?.toISOString() ?? null,
    reversalOfId: record.reversal_of_id,
    syncStatus: record.sync_status,
    externalProvider: record.external_provider,
    externalSystemId: record.external_system_id,
    externalVoucherNumber: record.external_voucher_number,
    lastSyncedAt: record.last_synced_at?.toISOString() ?? null,
    syncAttemptCount: record.sync_attempt_count,
    syncError: sanitizedSyncError(record.sync_error_payload)
      ?? sanitizedSyncError(record.outbox_logs[0]?.error_payload),
    lines: record.lines.map((line) => ({
      id: line.id,
      sourceLineId: line.source_line_id,
      lineNumber: line.line_number,
      itemCode: line.item_code,
      description: line.description,
      quantity: line.quantity.toFixed(4),
      unitOfMeasure: line.unit_of_measure,
      unitRate: line.unit_rate.toFixed(4),
      discountAmount: line.discount_amount.toFixed(2),
      taxableAmount: line.taxable_amount.toFixed(2),
      hsnCode: line.hsn_code,
      gstRate: line.gst_rate.toFixed(4),
      cgstAmount: line.cgst_amount.toFixed(2),
      sgstAmount: line.sgst_amount.toFixed(2),
      igstAmount: line.igst_amount.toFixed(2),
      otherTaxAmount: line.other_tax_amount.toFixed(2),
      totalTaxAmount: line.total_tax_amount.toFixed(2),
      totalAmount: line.total_amount.toFixed(2),
    })),
    outboxLogs: record.outbox_logs.map((log) => ({
      id: log.id,
      provider: log.provider,
      status: log.status,
      eventType: log.event_type,
      attemptCount: log.attempt_count,
      availableAt: log.available_at.toISOString(),
      processedAt: log.processed_at?.toISOString() ?? null,
      createdAt: log.created_at.toISOString(),
      error: sanitizedSyncError(log.error_payload),
    })),
  };
}

export async function listFinanceSyncQueue(input: {
  organizationId: string;
  status?: FinanceSyncStatus;
  provider?: FinanceExternalProvider;
  take: number;
  cursor?: OutboxCursor | null;
}) {
  const baseWhere: Prisma.FinanceSyncOutboxLogWhereInput = {
    organization_id: input.organizationId,
    ...(input.status ? { status: input.status } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
  };
  const where: Prisma.FinanceSyncOutboxLogWhereInput = {
    ...baseWhere,
    ...(input.cursor ? {
      AND: [{
        OR: [
          { created_at: { lt: input.cursor.createdAt } },
          { created_at: input.cursor.createdAt, id: { lt: input.cursor.id } },
        ],
      }],
    } : {}),
  };
  const [logs, count] = await Promise.all([
    prisma.financeSyncOutboxLog.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: input.take + 1,
      select: {
        id: true,
        transaction_id: true,
        provider: true,
        status: true,
        event_type: true,
        attempt_count: true,
        available_at: true,
        processed_at: true,
        created_at: true,
        error_payload: true,
        transaction: {
          select: {
            document_type: true,
            document_number: true,
            source_module: true,
            source_type: true,
            source_document_number: true,
            total_amount: true,
          },
        },
      },
    }),
    prisma.financeSyncOutboxLog.count({ where: baseWhere }),
  ]);
  const hasMore = logs.length > input.take;
  const pageLogs = logs.slice(0, input.take);
  const next = hasMore ? pageLogs[pageLogs.length - 1] : null;
  return {
    logs: pageLogs.map((log) => ({
      id: log.id,
      transactionId: log.transaction_id,
      provider: log.provider,
      status: log.status,
      eventType: log.event_type,
      attemptCount: log.attempt_count,
      availableAt: log.available_at.toISOString(),
      processedAt: log.processed_at?.toISOString() ?? null,
      createdAt: log.created_at.toISOString(),
      transaction: {
        documentType: log.transaction.document_type,
        documentNumber: log.transaction.document_number,
        sourceModule: log.transaction.source_module,
        sourceType: log.transaction.source_type,
        sourceDocumentNumber: log.transaction.source_document_number,
        totalAmount: log.transaction.total_amount.toFixed(2),
      },
      error: sanitizedSyncError(log.error_payload),
    })),
    count,
    hasMore,
    nextCursor: next ? { id: next.id, createdAt: next.created_at } : null,
  };
}
