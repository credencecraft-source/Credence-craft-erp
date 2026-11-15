import { FinanceDocumentStatus, FinanceDocumentType, FinanceExternalProvider, FinanceSyncStatus, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  getConfig: vi.fn(),
  logFindFirst: vi.fn(),
  logUpdateMany: vi.fn(),
  transactionFindFirst: vi.fn(),
  transactionUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    financeSyncOutboxLog: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/services/finance/finance-integration-service", () => ({
  getFinanceIntegrationSecrets: mocks.getConfig,
}));

import {
  dispatchFinanceOutboxForOrganization,
  financeOutboxRetryDelayMs,
} from "@/lib/services/finance/finance-outbox-dispatcher";

describe("FinanceOutboxDispatcher", () => {
  let outboxStatus: FinanceSyncStatus;
  let outboxAttemptCount: number;
  let lastOutboxUpdate: Record<string, unknown> | null;
  let lastTransactionUpdate: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    outboxStatus = FinanceSyncStatus.PENDING;
    outboxAttemptCount = 0;
    lastOutboxUpdate = null;
    lastTransactionUpdate = null;

    mocks.getConfig.mockResolvedValue({
      activeProvider: FinanceExternalProvider.TALLY,
      autoSync: true,
      tallyServerUrl: "http://127.0.0.1:9000",
      tallyCompanyName: "TEST COMPANY",
      zohoApiRegion: "IN",
      zohoOrganizationId: null,
      zohoClientId: null,
      zohoClientSecret: null,
      zohoRefreshToken: null,
      ledgerMappings: {
        tally: {
          partyLedgerName: "CUSTOMER",
          transactionLedgerName: "SALES",
          cgstLedgerName: "CGST",
          sgstLedgerName: "SGST",
        },
      },
    });
    mocks.findMany.mockResolvedValue([{ id: "outbox-1" }]);
    mocks.logFindFirst.mockImplementation(async () => ({
      id: "outbox-1",
      status: outboxStatus,
      attempt_count: outboxAttemptCount,
      available_at: new Date(Date.now() - 1_000),
      transaction_id: "finance-1",
    }));
    mocks.logUpdateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      lastOutboxUpdate = data;
      if (typeof data.status === "string") outboxStatus = data.status as FinanceSyncStatus;
      if (data.attempt_count && typeof data.attempt_count === "object" && "increment" in data.attempt_count) {
        outboxAttemptCount += Number(data.attempt_count.increment);
      }
      return { count: 1 };
    });
    mocks.transactionFindFirst.mockResolvedValue({
      id: "finance-1",
      organization_id: "org-A",
      document_type: FinanceDocumentType.SALES_INVOICE,
      document_number: "INV-1",
      document_date: new Date("2026-11-18T00:00:00.000Z"),
      currency_code: "INR",
      party_name: "CUSTOMER",
      party_gstin: "27FGHIJ6789K1Z2",
      subtotal: new Prisma.Decimal("100"),
      cgst_amount: new Prisma.Decimal("9"),
      sgst_amount: new Prisma.Decimal("9"),
      igst_amount: new Prisma.Decimal("0"),
      other_tax_amount: new Prisma.Decimal("0"),
      total_amount: new Prisma.Decimal("118"),
      party_id: "party-1",
      source_type: "POS_SALES_INVOICE",
      source_id: "source-1",
      status: FinanceDocumentStatus.POSTED,
      lines: [{
        item_code: "SKU-1",
        description: "ITEM",
        quantity: new Prisma.Decimal("1"),
        unit_of_measure: "PCS",
        unit_rate: new Prisma.Decimal("100"),
        discount_amount: new Prisma.Decimal("0"),
        hsn_code: "6109",
        gst_rate: new Prisma.Decimal("18"),
        taxable_amount: new Prisma.Decimal("100"),
        cgst_amount: new Prisma.Decimal("9"),
        sgst_amount: new Prisma.Decimal("9"),
        igst_amount: new Prisma.Decimal("0"),
        other_tax_amount: new Prisma.Decimal("0"),
      }],
    });
    mocks.transactionUpdateMany.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      lastTransactionUpdate = data;
      return { count: 1 };
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      financeSyncOutboxLog: {
        findFirst: mocks.logFindFirst,
        updateMany: mocks.logUpdateMany,
      },
      centralFinanceTransaction: {
        findFirst: mocks.transactionFindFirst,
        updateMany: mocks.transactionUpdateMany,
      },
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("<ENVELOPE><BODY><DATA><ERRORS>0</ERRORS></DATA></BODY></ENVELOPE>", { status: 200 }),
    ));
  });

  it("claims and marks a pending outbox entry synced", async () => {
    const result = await dispatchFinanceOutboxForOrganization("org-A", { manual: true });

    expect(result).toMatchObject({ processed: 1, synced: 1, failed: 0 });
    expect(lastOutboxUpdate).toMatchObject({ status: FinanceSyncStatus.SYNCED });
    expect(lastTransactionUpdate).toMatchObject({ sync_status: FinanceSyncStatus.SYNCED });
    expect(outboxAttemptCount).toBe(1);
  });

  it("marks provider errors failed and schedules a retry", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("unavailable", { status: 503 }));

    const result = await dispatchFinanceOutboxForOrganization("org-A", { manual: true });

    expect(result).toMatchObject({ processed: 1, synced: 0, failed: 1 });
    expect(outboxStatus).toBe(FinanceSyncStatus.FAILED);
    expect(lastOutboxUpdate).toMatchObject({
      status: FinanceSyncStatus.FAILED,
      error_payload: expect.objectContaining({ code: "TALLY_HTTP_503" }),
    });
    expect(lastTransactionUpdate).toMatchObject({ sync_status: FinanceSyncStatus.FAILED });
  });

  it("supports manual dispatch when automatic sync is disabled and bounds exponential retries", async () => {
    mocks.getConfig.mockResolvedValue({
      activeProvider: FinanceExternalProvider.TALLY,
      autoSync: false,
      tallyServerUrl: "http://127.0.0.1:9000",
      tallyCompanyName: "TEST COMPANY",
      zohoApiRegion: "IN",
      zohoOrganizationId: null,
      zohoClientId: null,
      zohoClientSecret: null,
      zohoRefreshToken: null,
      ledgerMappings: {
        tally: {
          partyLedgerName: "CUSTOMER",
          transactionLedgerName: "SALES",
          cgstLedgerName: "CGST",
          sgstLedgerName: "SGST",
        },
      },
    });

    const manualResult = await dispatchFinanceOutboxForOrganization("org-A", { manual: true });
    const automaticResult = await dispatchFinanceOutboxForOrganization("org-A");

    expect(manualResult.synced).toBe(1);
    expect(automaticResult.message).toBe("Automatic sync is disabled.");
    expect(financeOutboxRetryDelayMs(1)).toBe(30_000);
    expect(financeOutboxRetryDelayMs(100)).toBe(6 * 60 * 60_000);
  });

  it("refreshes Zoho OAuth and sends an invoice to Books v3 with its organization ID", async () => {
    mocks.getConfig.mockResolvedValue({
      activeProvider: FinanceExternalProvider.ZOHO_BOOKS,
      autoSync: true,
      tallyServerUrl: null,
      tallyCompanyName: null,
      zohoApiRegion: "IN",
      zohoOrganizationId: "123456789",
      zohoClientId: "client-id",
      zohoClientSecret: "client-secret",
      zohoRefreshToken: "refresh-token",
      ledgerMappings: {
        zohoBooks: {
          customerIdByPartyId: { "party-1": "zoho-customer-1" },
          itemIdByCode: { "SKU-1": "zoho-item-1" },
          taxIdByRate: { "18.0000": "zoho-tax-18" },
        },
      },
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        invoice: { invoice_id: "zoho-invoice-1", invoice_number: "INV-1" },
      }), { status: 200 }));

    const result = await dispatchFinanceOutboxForOrganization("org-A", { manual: true });

    expect(result).toMatchObject({ processed: 1, synced: 1, failed: 0 });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://accounts.zoho.in/oauth/v2/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://www.zohoapis.in/books/v3/invoices?organization_id=123456789",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Zoho-oauthtoken access-token",
          "X-Unique-Identifier-Key": expect.any(String),
        }),
      }),
    );
    expect(lastOutboxUpdate).toMatchObject({ status: FinanceSyncStatus.SYNCED });
  });
});
