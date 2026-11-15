import { createHash } from "node:crypto";

import {
  FinanceDocumentStatus,
  FinanceDocumentType,
  FinanceExternalProvider,
  FinanceSyncStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import {
  mapToTallyPrimeXml,
  mapToZohoBooksPayload,
  type SyncableFinanceTransaction,
  type TallyLedgerMapping,
  type ZohoBooksMapping,
} from "@/lib/services/finance/accounting-sync-adapter";
import { getFinanceIntegrationSecrets } from "@/lib/services/finance/finance-integration-service";

const MAX_BATCH_SIZE = 50;
const MAX_PROVIDER_RESPONSE_BYTES = 64_000;
const REQUEST_TIMEOUT_MS = 8_000;
const STALE_CLAIM_MS = 15 * 60_000;
const BASE_RETRY_MS = 30_000;
const MAX_RETRY_MS = 6 * 60 * 60_000;

type JsonRecord = Record<string, Prisma.JsonValue>;
type DispatchRow = Prisma.FinanceSyncOutboxLogGetPayload<{
  include: {
    transaction: {
      include: { lines: true };
    };
  };
}>;
type ClaimedDispatchRow = {
  organization_id: string;
  transaction: DispatchRow["transaction"];
};

type ProviderResult = {
  externalSystemId: string;
  externalVoucherNumber: string;
};

function isJsonRecord(value: Prisma.JsonValue | null | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringMap(record: JsonRecord | null, key: string): Record<string, string> {
  const value = record?.[key];
  if (!isJsonRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function readString(record: JsonRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function idempotencyKey(
  row: Pick<DispatchRow, "organization_id" | "transaction">,
  provider: FinanceExternalProvider,
) {
  const source = row.transaction;
  return createHash("sha256")
    .update(`${row.organization_id}:${source.source_type}:${source.source_id}:${provider}`)
    .digest("hex");
}

export function financeOutboxRetryDelayMs(attemptCount: number) {
  const safeAttempt = Math.max(1, Math.trunc(attemptCount));
  return Math.min(BASE_RETRY_MS * (2 ** Math.min(safeAttempt - 1, 16)), MAX_RETRY_MS);
}

function mapTransaction(transaction: DispatchRow["transaction"]): SyncableFinanceTransaction {
  return {
    documentType: transaction.document_type,
    documentNumber: transaction.document_number,
    documentDate: transaction.document_date.toISOString().slice(0, 10),
    currencyCode: transaction.currency_code,
    partyName: transaction.party_name,
    partyGstin: transaction.party_gstin,
    subtotal: transaction.subtotal.toFixed(2),
    cgstAmount: transaction.cgst_amount.toFixed(2),
    sgstAmount: transaction.sgst_amount.toFixed(2),
    igstAmount: transaction.igst_amount.toFixed(2),
    otherTaxAmount: transaction.other_tax_amount.toFixed(2),
    totalAmount: transaction.total_amount.toFixed(2),
    lines: transaction.lines.map((line) => ({
      itemCode: line.item_code,
      description: line.description,
      quantity: line.quantity.toFixed(4),
      unitOfMeasure: line.unit_of_measure,
      unitRate: line.unit_rate.toFixed(4),
      discountAmount: line.discount_amount.toFixed(2),
      hsnCode: line.hsn_code,
      gstRate: line.gst_rate.toFixed(4),
      taxableAmount: line.taxable_amount.toFixed(2),
      cgstAmount: line.cgst_amount.toFixed(2),
      sgstAmount: line.sgst_amount.toFixed(2),
      igstAmount: line.igst_amount.toFixed(2),
      otherTaxAmount: line.other_tax_amount.toFixed(2),
    })),
  };
}

function providerMappings(value: Prisma.JsonValue | null) {
  const root = isJsonRecord(value) ? value : null;
  return {
    tally: isJsonRecord(root?.tally) ? root.tally : null,
    zohoBooks: isJsonRecord(root?.zohoBooks) ? root.zohoBooks : null,
  };
}

function tallyMapping(row: Pick<ClaimedDispatchRow, "transaction">, config: NonNullable<Awaited<ReturnType<typeof getFinanceIntegrationSecrets>>>): TallyLedgerMapping {
  const mappings = providerMappings(config.ledgerMappings).tally;
  const partyId = row.transaction.party_id;
  const partyLedgerName = partyId
    ? readStringMap(mappings, "partyLedgerByPartyId")[partyId]
    : undefined;
  const transactionLedgerName = readStringMap(mappings, "transactionLedgerByDocumentType")[row.transaction.document_type]
    ?? readString(mappings, "transactionLedgerName");
  return {
    companyName: config.tallyCompanyName ?? "",
    partyLedgerName: partyLedgerName ?? readString(mappings, "partyLedgerName") ?? "",
    transactionLedgerName: transactionLedgerName ?? "",
    cgstLedgerName: readString(mappings, "cgstLedgerName") ?? undefined,
    sgstLedgerName: readString(mappings, "sgstLedgerName") ?? undefined,
    igstLedgerName: readString(mappings, "igstLedgerName") ?? undefined,
    otherTaxLedgerName: readString(mappings, "otherTaxLedgerName") ?? undefined,
  };
}

function zohoMapping(row: Pick<ClaimedDispatchRow, "transaction">, config: NonNullable<Awaited<ReturnType<typeof getFinanceIntegrationSecrets>>>): ZohoBooksMapping {
  const mappings = providerMappings(config.ledgerMappings).zohoBooks;
  const documentType = row.transaction.document_type;
  const isCustomerDocument = documentType === FinanceDocumentType.SALES_INVOICE
    || documentType === FinanceDocumentType.CREDIT_NOTE;
  const partyMapKey = isCustomerDocument ? "customerIdByPartyId" : "vendorIdByPartyId";
  const partyId = row.transaction.party_id
    ? readStringMap(mappings, partyMapKey)[row.transaction.party_id]
    : undefined;
  return {
    partyId: partyId ?? "",
    itemIdByCode: readStringMap(mappings, "itemIdByCode"),
    taxIdByRate: readStringMap(mappings, "taxIdByRate"),
  };
}

async function readBoundedBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    totalBytes += result.value.byteLength;
    if (totalBytes > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
    }
    chunks.push(result.value);
  }
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function providerFetch(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function parseJsonObject(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("PROVIDER_INVALID_RESPONSE");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("PROVIDER_INVALID_RESPONSE");
  }
  return parsed as Record<string, unknown>;
}

function zohoResource(documentType: FinanceDocumentType) {
  switch (documentType) {
    case FinanceDocumentType.SALES_INVOICE:
      return { path: "invoices", key: "invoice", id: "invoice_id", number: "invoice_number" };
    case FinanceDocumentType.PURCHASE_INVOICE:
    case FinanceDocumentType.PURCHASE_BILL:
      return { path: "bills", key: "bill", id: "bill_id", number: "bill_number" };
    case FinanceDocumentType.CREDIT_NOTE:
      return { path: "creditnotes", key: "creditnote", id: "creditnote_id", number: "creditnote_number" };
    case FinanceDocumentType.DEBIT_NOTE:
      return { path: "vendorcredits", key: "vendor_credit", id: "vendor_credit_id", number: "vendor_credit_number" };
    case FinanceDocumentType.DELIVERY_CHALLAN:
      throw new Error("LOGISTICS_DOCUMENT_NOT_SYNCABLE");
  }
}

async function sendToTally(
  row: ClaimedDispatchRow,
  config: NonNullable<Awaited<ReturnType<typeof getFinanceIntegrationSecrets>>>,
  key: string,
): Promise<ProviderResult> {
  if (!config.tallyServerUrl) throw new Error("TALLY_CONFIGURATION_INCOMPLETE");
  const xml = mapToTallyPrimeXml(mapTransaction(row.transaction), tallyMapping(row, config), key);
  const response = await providerFetch(config.tallyServerUrl, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: xml,
  });
  if (!response.ok) throw new Error(`TALLY_HTTP_${response.status}`);
  const body = await readBoundedBody(response);
  const errors = body.match(/<ERRORS>\s*(\d+)\s*<\/ERRORS>/i);
  if (!body.includes("<ENVELOPE") || (errors && Number(errors[1]) > 0) || /<LINEERROR>/i.test(body)) {
    throw new Error("TALLY_REJECTED_VOUCHER");
  }
  return {
    externalSystemId: key,
    externalVoucherNumber: row.transaction.document_number,
  };
}

async function sendToZohoBooks(
  row: ClaimedDispatchRow,
  config: NonNullable<Awaited<ReturnType<typeof getFinanceIntegrationSecrets>>>,
  key: string,
): Promise<ProviderResult> {
  if (!config.zohoClientId || !config.zohoClientSecret || !config.zohoRefreshToken || !config.zohoOrganizationId) {
    throw new Error("ZOHO_CONFIGURATION_INCOMPLETE");
  }
  const domainByRegion: Record<string, string> = {
    AU: "com.au",
    CA: "ca",
    EU: "eu",
    IN: "in",
    JP: "jp",
    SA: "sa",
    US: "com",
  };
  const domain = domainByRegion[config.zohoApiRegion];
  if (!domain) throw new Error("ZOHO_REGION_UNSUPPORTED");

  const tokenResponse = await providerFetch(`https://accounts.zoho.${domain}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.zohoClientId,
      client_secret: config.zohoClientSecret,
      refresh_token: config.zohoRefreshToken,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`ZOHO_OAUTH_HTTP_${tokenResponse.status}`);
  const token = parseJsonObject(await readBoundedBody(tokenResponse));
  if (typeof token.access_token !== "string") throw new Error("ZOHO_OAUTH_TOKEN_MISSING");

  const resource = zohoResource(row.transaction.document_type);
  const payload = mapToZohoBooksPayload(mapTransaction(row.transaction), zohoMapping(row, config));
  const response = await providerFetch(
    `https://www.zohoapis.${domain}/books/v3/${resource.path}?organization_id=${encodeURIComponent(config.zohoOrganizationId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token.access_token}`,
        "Content-Type": "application/json",
        "X-Unique-Identifier-Key": key,
      },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) throw new Error(`ZOHO_BOOKS_HTTP_${response.status}`);
  const result = parseJsonObject(await readBoundedBody(response));
  if (result.code !== 0 || typeof result[resource.key] !== "object" || result[resource.key] === null) {
    throw new Error("ZOHO_BOOKS_REJECTED_DOCUMENT");
  }
  const record = result[resource.key] as Record<string, unknown>;
  const externalId = record[resource.id];
  if (typeof externalId !== "string" && typeof externalId !== "number") {
    throw new Error("ZOHO_BOOKS_DOCUMENT_ID_MISSING");
  }
  const externalNumber = record[resource.number];
  return {
    externalSystemId: String(externalId),
    externalVoucherNumber: typeof externalNumber === "string" ? externalNumber : row.transaction.document_number,
  };
}

function safeFailureCode(error: unknown) {
  if (!(error instanceof Error)) return "PROVIDER_REQUEST_FAILED";
  const allowed = /^[A-Z0-9_]+(?:_[0-9]{3})?$/;
  const candidate = error.message.replace(/^([A-Z0-9_]+)_(\d{3})$/, "$1_$2");
  return allowed.test(candidate) ? candidate : "PROVIDER_REQUEST_FAILED";
}

function failureMessage(code: string) {
  if (code.includes("CONFIGURATION") || code.includes("MAPPING")) {
    return "Provider configuration or ledger mappings need attention.";
  }
  if (code.includes("HTTP_") || code.includes("REJECTED")) {
    return "The accounting provider did not accept the document.";
  }
  if (code.includes("NOT_SYNCABLE")) return "This logistics document is not eligible for accounting synchronization.";
  if (code.includes("TOO_LARGE") || code.includes("INVALID_RESPONSE") || code.includes("ID_MISSING")) {
    return "The accounting provider returned an invalid response.";
  }
  return "Provider request failed; verify connectivity, credentials, and mappings.";
}

async function claimOutboxRow(
  organizationId: string,
  outboxId: string,
  provider: FinanceExternalProvider,
  forceRetry: boolean,
) {
  const now = new Date();
  const staleQueuedBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  return prisma.$transaction(async (tx) => {
    const log = await tx.financeSyncOutboxLog.findFirst({
      where: { id: outboxId, organization_id: organizationId },
      select: { id: true, status: true, attempt_count: true, available_at: true, transaction_id: true },
    });
    if (!log) return null;
    const eligible = log.status === FinanceSyncStatus.PENDING
      ? log.available_at <= now
      : log.status === FinanceSyncStatus.FAILED
        ? forceRetry || log.available_at <= now
        : log.status === FinanceSyncStatus.QUEUED && !forceRetry && log.available_at <= staleQueuedBefore;
    if (!eligible) return null;

    const claimed = await tx.financeSyncOutboxLog.updateMany({
      where: {
        id: log.id,
        organization_id: organizationId,
        status: log.status,
        ...(log.status === FinanceSyncStatus.QUEUED ? { available_at: { lte: staleQueuedBefore } } : {}),
        ...(log.status === FinanceSyncStatus.FAILED && !forceRetry ? { available_at: { lte: now } } : {}),
        ...(log.status === FinanceSyncStatus.PENDING ? { available_at: { lte: now } } : {}),
      },
      data: {
        status: FinanceSyncStatus.QUEUED,
        provider,
        attempt_count: { increment: 1 },
        available_at: now,
        error_payload: Prisma.DbNull,
      },
    });
    if (claimed.count !== 1) return null;

    const transaction = await tx.centralFinanceTransaction.findFirst({
      where: {
        id: log.transaction_id,
        organization_id: organizationId,
      },
      include: { lines: { orderBy: { line_number: "asc" } } },
    });
    if (!transaction) throw new Error("OUTBOX_TRANSACTION_MISSING");
    if (
      transaction.status !== FinanceDocumentStatus.POSTED
      && transaction.status !== FinanceDocumentStatus.LOCKED
    ) {
      await tx.financeSyncOutboxLog.updateMany({
        where: { id: log.id, organization_id: organizationId, status: FinanceSyncStatus.QUEUED },
        data: { status: FinanceSyncStatus.SKIPPED, processed_at: now },
      });
      await tx.centralFinanceTransaction.updateMany({
        where: { id: transaction.id, organization_id: organizationId },
        data: { sync_status: FinanceSyncStatus.SKIPPED },
      });
      return { skipped: true as const };
    }

    await tx.centralFinanceTransaction.updateMany({
      where: { id: transaction.id, organization_id: organizationId },
      data: {
        sync_status: FinanceSyncStatus.QUEUED,
        external_provider: provider,
        sync_attempt_count: { increment: 1 },
        sync_error_payload: Prisma.DbNull,
      },
    });
    return {
      skipped: false as const,
      row: {
        ...log,
        organization_id: organizationId,
        provider,
        transaction,
        attemptCount: log.attempt_count + 1,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function finishOutboxRow(
  organizationId: string,
  outboxId: string,
  transactionId: string,
  result: ProviderResult,
) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.financeSyncOutboxLog.updateMany({
      where: { id: outboxId, organization_id: organizationId, status: FinanceSyncStatus.QUEUED },
      data: {
        status: FinanceSyncStatus.SYNCED,
        processed_at: now,
        error_payload: Prisma.DbNull,
      },
    });
    await tx.centralFinanceTransaction.updateMany({
      where: {
        id: transactionId,
        organization_id: organizationId,
        status: { in: [FinanceDocumentStatus.POSTED, FinanceDocumentStatus.LOCKED] },
      },
      data: {
        sync_status: FinanceSyncStatus.SYNCED,
        external_system_id: result.externalSystemId,
        external_voucher_number: result.externalVoucherNumber,
        last_synced_at: now,
        sync_error_payload: Prisma.DbNull,
      },
    });
  });
}

async function failOutboxRow(
  organizationId: string,
  outboxId: string,
  transactionId: string,
  attemptCount: number,
  error: unknown,
) {
  const code = safeFailureCode(error);
  const message = failureMessage(code);
  const availableAt = new Date(Date.now() + financeOutboxRetryDelayMs(attemptCount));
  const errorPayload = { code, message };
  await prisma.$transaction(async (tx) => {
    await tx.financeSyncOutboxLog.updateMany({
      where: { id: outboxId, organization_id: organizationId, status: FinanceSyncStatus.QUEUED },
      data: {
        status: FinanceSyncStatus.FAILED,
        error_payload: errorPayload,
        available_at: availableAt,
      },
    });
    await tx.centralFinanceTransaction.updateMany({
      where: {
        id: transactionId,
        organization_id: organizationId,
        status: { in: [FinanceDocumentStatus.POSTED, FinanceDocumentStatus.LOCKED] },
      },
      data: {
        sync_status: FinanceSyncStatus.FAILED,
        sync_error_payload: errorPayload,
      },
    });
  });
  return { code, message, availableAt: availableAt.toISOString() };
}

export async function dispatchFinanceOutboxForOrganization(
  organizationId: string,
  options: { limit?: number; forceRetry?: boolean; manual?: boolean; transactionId?: string } = {},
) {
  const limit = Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(options.limit ?? 20)));
  const forceRetry = options.forceRetry === true;
  const config = await getFinanceIntegrationSecrets(organizationId);
  if (!config || config.activeProvider === FinanceExternalProvider.NONE) {
    return { processed: 0, synced: 0, failed: 0, skipped: 0, message: "No accounting provider is configured." };
  }
  if (!options.manual && !config.autoSync) {
    return { processed: 0, synced: 0, failed: 0, skipped: 0, message: "Automatic sync is disabled." };
  }

  const now = new Date();
  const staleQueuedBefore = new Date(now.getTime() - STALE_CLAIM_MS);
  const rows = await prisma.financeSyncOutboxLog.findMany({
    where: {
      organization_id: organizationId,
      ...(options.transactionId ? { transaction_id: options.transactionId } : {}),
      OR: [
        { status: FinanceSyncStatus.PENDING, available_at: { lte: now } },
        ...(forceRetry
          ? [{ status: FinanceSyncStatus.FAILED }]
          : [{ status: FinanceSyncStatus.FAILED, available_at: { lte: now } }]),
        ...(!forceRetry ? [{ status: FinanceSyncStatus.QUEUED, available_at: { lte: staleQueuedBefore } }] : []),
      ],
    },
    orderBy: [{ available_at: "asc" }, { created_at: "asc" }],
    take: limit,
    select: { id: true },
  });

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  for (const candidate of rows) {
    const claim = await claimOutboxRow(organizationId, candidate.id, config.activeProvider, forceRetry);
    if (!claim) continue;
    if (claim.skipped) {
      skipped += 1;
      continue;
    }
    const transactionId = claim.row.transaction.id;
    const key = idempotencyKey(claim.row, config.activeProvider);
    let result: ProviderResult;
    try {
      result = config.activeProvider === FinanceExternalProvider.TALLY
        ? await sendToTally(claim.row, config, key)
        : await sendToZohoBooks(claim.row, config, key);
    } catch (error) {
      await failOutboxRow(
        organizationId,
        candidate.id,
        transactionId,
        claim.row.attemptCount,
        error,
      );
      failed += 1;
      continue;
    }
    await finishOutboxRow(organizationId, candidate.id, transactionId, result);
    synced += 1;
  }
  return { processed: synced + failed + skipped, synced, failed, skipped };
}
