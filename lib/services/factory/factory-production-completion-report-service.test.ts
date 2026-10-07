import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ factoryGrnFindMany: vi.fn() }));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { factoryGrn: { findMany: mocks.factoryGrnFindMany } },
}));

import { listFactoryProductionCompletionReport } from "./factory-production-completion-report-service";

describe("factory production completion report service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes report rows to the authorized organization and paginates", async () => {
    const createdAt = new Date("2025-01-02T10:30:00.000Z");
    mocks.factoryGrnFindMany.mockResolvedValue([
      {
        id: "grn-1",
        grn_no: "GRN-001",
        created_at: createdAt,
        received_qty: 9,
        received_by: "Factory Receiver",
        status: "DRAFT",
        workOrder: { work_order_no: "WO-001", order: { orderNo: "ORD-001", article: "ST-01", styleName: "Style 1" } },
        bundleTransfer: { issued_qty: 12 },
        fromProcess: { process_name: "Cutting" },
        toProcess: { process_name: "Stitching" },
        lines: [{ operation_name: "Join", actual_made_qty: 8 }],
      },
      { id: "grn-extra" },
    ]);

    const result = await listFactoryProductionCompletionReport("org-internal-1", { cursor: "grn-cursor", limit: 1 });

    expect(mocks.factoryGrnFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "org-internal-1",
        workOrder: { organization_id: "org-internal-1", order: { organization_id: "org-internal-1" } },
        bundleTransfer: { organization_id: "org-internal-1" },
      },
      cursor: { id: "grn-cursor" },
      skip: 1,
      take: 2,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }));
    expect(result).toEqual({
      records: [{
        id: "grn-1",
        grnNo: "GRN-001",
        acceptedAt: createdAt,
        orderNo: "ORD-001",
        styleNo: "ST-01",
        styleName: "Style 1",
        workOrderNo: "WO-001",
        fromProcess: "Cutting",
        toProcess: "Stitching",
        transferQty: 12,
        acceptedQty: 9,
        acceptedBy: "Factory Receiver",
        status: "DRAFT",
        operations: ["Join (8)"],
      }],
      nextCursor: "grn-1",
    });
  });

  it("rejects invalid page sizes before querying", async () => {
    await expect(listFactoryProductionCompletionReport("org-1", { limit: 101 })).rejects.toThrow("Report page size must be between 1 and 100.");
    expect(mocks.factoryGrnFindMany).not.toHaveBeenCalled();
  });
});
