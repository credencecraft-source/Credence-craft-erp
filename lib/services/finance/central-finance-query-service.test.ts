import { FinanceExternalProvider, FinanceSyncStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    financeSyncOutboxLog: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
}));

import { listFinanceSyncQueue } from "@/lib/services/finance/central-finance-query-service";

describe("listFinanceSyncQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a safe error summary while excluding raw provider response details", async () => {
    mocks.findMany.mockResolvedValue([{
      id: "outbox-1",
      transaction_id: "transaction-1",
      provider: FinanceExternalProvider.ZOHO_BOOKS,
      status: FinanceSyncStatus.FAILED,
      event_type: "POSTED",
      attempt_count: 2,
      available_at: new Date("2026-11-14T00:00:00.000Z"),
      processed_at: new Date("2026-11-14T00:01:00.000Z"),
      created_at: new Date("2026-11-14T00:00:00.000Z"),
      error_payload: {
        code: "ZOHO_BOOKS_HTTP_401",
        message: "provider response contained sensitive data",
      },
      transaction: {
        document_type: "SALES_INVOICE",
        document_number: "INV-1",
        source_module: "POS",
        source_type: "POS_SALES_INVOICE",
        source_document_number: "POS-1",
        total_amount: { toFixed: () => "118.00" },
      },
    }]);
    mocks.count.mockResolvedValue(1);

    const result = await listFinanceSyncQueue({
      organizationId: "org-A",
      provider: FinanceExternalProvider.ZOHO_BOOKS,
      take: 5,
    });

    expect(result.logs[0]?.error).toEqual({
      code: "ZOHO_BOOKS_HTTP_401",
      message: "Provider synchronization failed. Review the saved provider settings and retry.",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive data");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-A", provider: FinanceExternalProvider.ZOHO_BOOKS },
      take: 6,
    }));
  });
});
