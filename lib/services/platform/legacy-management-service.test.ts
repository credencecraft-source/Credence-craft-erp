import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const organization = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  };
  const contactAddress = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const merchandisingOrder = {
    count: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const masterArticleVariant = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const finishedGoodsSizeWise = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const finishedGoodsSkuStock = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  };
  const finishedGoodsGeneralStockReceipt = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  };
  const storageNode = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  };
  const masterLocation = {
    findFirst: vi.fn(),
  };
  const organizationOrderCounter = {
    findUnique: vi.fn(),
    createMany: vi.fn(),
    updateMany: vi.fn(),
  };
  const platformMigrationAuditLog = {
    aggregate: vi.fn(),
    create: vi.fn(),
  };
  const transaction = {
    organization,
    contactAddress,
    merchandisingOrder,
    organizationOrderCounter,
    platformMigrationAuditLog,
    masterArticleVariant,
    finishedGoodsSizeWise,
    finishedGoodsSkuStock,
    finishedGoodsGeneralStockReceipt,
    storageNode,
    masterLocation,
  };

  return {
    admin: { id: "platform-admin-1", team_role: "CTO" },
    transaction,
    prisma: {
      ...transaction,
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: vi.fn(async () => mocks.admin),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: mocks.prisma,
}));

import {
  dryRunLegacyManagementTask,
  executeLegacyManagementTask,
  refreshLegacyManagementTasks,
} from "./legacy-management-service";

function contactAddressCandidate({
  id,
  stateName = "Karnataka",
  salesOrderCount = 0,
}: {
  id: string;
  stateName?: string;
  salesOrderCount?: number;
}) {
  return {
    id,
    country_code: "IN",
    state_code: null,
    state_name: stateName,
    is_active: true,
    tax_registration_id: null,
    tax_registration: null,
    contact: {
      is_active: true,
      _count: {
        purchase_orders: 0,
        sales_orders: salesOrderCount,
        pos_sales_invoices: 0,
        pos_coupon_issues: 0,
        distributionQuotations: 0,
      },
    },
  };
}

function prepareBaseMocks() {
  vi.clearAllMocks();
  mocks.admin.team_role = "CTO";
  mocks.transaction.organization.findUnique.mockResolvedValue({ id: "org-1" });
  mocks.prisma.organization.findUnique.mockResolvedValue({ id: "org-1" });
  mocks.prisma.masterArticleVariant.findMany.mockResolvedValue([]);
  mocks.prisma.finishedGoodsSizeWise.findMany.mockResolvedValue([]);
  mocks.prisma.finishedGoodsSkuStock.findMany.mockResolvedValue([]);
  mocks.prisma.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
  mocks.prisma.finishedGoodsSkuStock.count.mockResolvedValue(0);
  mocks.prisma.finishedGoodsGeneralStockReceipt.count.mockResolvedValue(0);
  mocks.prisma.storageNode.findMany.mockResolvedValue([]);
  mocks.prisma.merchandisingOrder.findMany.mockResolvedValue([]);
  mocks.prisma.merchandisingOrder.count.mockResolvedValue(0);
  mocks.prisma.platformMigrationAuditLog.aggregate.mockResolvedValue({
    _sum: { records_processed: null },
  });
  mocks.prisma.platformMigrationAuditLog.create.mockResolvedValue({});
  mocks.prisma.$transaction.mockImplementation(
    async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      operation(mocks.transaction),
  );
}

describe("legacy management service", () => {
  beforeEach(prepareBaseMocks);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dry-runs only the selected organization and skips addresses tied to orders without writing", async () => {
    mocks.prisma.contactAddress.findMany.mockResolvedValue([
      contactAddressCandidate({ id: "address-eligible" }),
      contactAddressCandidate({ id: "address-with-history", salesOrderCount: 1 }),
    ]);

    const result = await dryRunLegacyManagementTask(
      "contact-address-state-from-state-name",
      "org-1",
    );

    expect(result).toMatchObject({
      totalEligible: 1,
      previouslyProcessed: 0,
      skippedCount: 1,
      sampleChanges: [{ to: "29" }],
    });
    expect(mocks.prisma.contactAddress.findMany.mock.calls[0][0].where).toMatchObject({
      organization_id: "org-1",
      country_code: "IN",
      state_code: null,
    });
    expect(mocks.prisma.contactAddress.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.platformMigrationAuditLog.create).not.toHaveBeenCalled();
  });

  it("rejects dry-run requests unless the effective platform role is CTO", async () => {
    mocks.admin.team_role = "ADMIN";

    await expect(dryRunLegacyManagementTask(
      "contact-address-state-from-state-name",
      "org-1",
    )).rejects.toThrow("CTO platform access is required");

    expect(mocks.prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.contactAddress.findMany).not.toHaveBeenCalled();
  });

  it("refreshes registered task metrics from the selected organization without writing", async () => {
    mocks.prisma.contactAddress.findMany.mockResolvedValue([]);
    mocks.prisma.merchandisingOrder.findMany.mockResolvedValue([]);
    mocks.prisma.organizationOrderCounter.findUnique.mockResolvedValue(null);

    const refreshedTasks = await refreshLegacyManagementTasks("org-1");

    expect(refreshedTasks).toHaveLength(7);
    expect(refreshedTasks.map((task) => task.taskId)).toEqual([
      "contact-address-state-from-tax-registration",
      "contact-address-state-from-state-name",
      "legacy-order-number-sequences",
      "legacy-order-variant-codes",
      "legacy-article-variant-code-format",
      "legacy-finished-goods-identifiers",
      "legacy-finished-goods-storage-nodes",
    ]);
    expect(refreshedTasks.every((task) => task.status === "DRY_RUN_PASSED")).toBe(true);
    expect(mocks.prisma.contactAddress.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.contactAddress.findMany.mock.calls[0][0].where.organization_id).toBe("org-1");
    expect(mocks.prisma.contactAddress.findMany.mock.calls[1][0].where.organization_id).toBe("org-1");
    expect(mocks.prisma.merchandisingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-1" },
    }));
    expect(mocks.prisma.contactAddress.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.merchandisingOrder.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.organizationOrderCounter.updateMany).not.toHaveBeenCalled();
  });

  it("dry-runs order variant codes and reports orders missing a style or colour", async () => {
    mocks.prisma.merchandisingOrder.findMany.mockResolvedValueOnce([
      { id: "order-1", orderNo: "OD-1", styleName: "Oxford Shirt", colors: "Navy Blue" },
      { id: "order-2", orderNo: "OD-2", styleName: "Oxford Shirt", colors: null },
    ]);

    const result = await dryRunLegacyManagementTask("legacy-order-variant-codes", "org-1");

    expect(result).toMatchObject({
      totalEligible: 1,
      previouslyProcessed: 0,
      skippedCount: 1,
      sampleChanges: [{ subject: "Order OD-1", from: "MISSING", to: "OXFORD-SHIRT-NAVY-BLUE" }],
      sampleSkips: [{ subject: "Order OD-2", reason: expect.stringContaining("Style Name or Colour is missing") }],
    });
    expect(mocks.prisma.merchandisingOrder.findMany.mock.calls[0][0].where)
      .toEqual({ organization_id: "org-1", variantCode: null });
    expect(mocks.prisma.merchandisingOrder.updateMany).not.toHaveBeenCalled();
  });

  it("backfills order variant codes idempotently and writes its tenant-scoped audit record", async () => {
    mocks.transaction.merchandisingOrder.findMany.mockResolvedValueOnce([
      { id: "order-1", orderNo: "OD-1", styleName: "Oxford Shirt", colors: "Navy Blue" },
    ]);
    mocks.transaction.merchandisingOrder.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.transaction.platformMigrationAuditLog.create.mockResolvedValue({});

    const result = await executeLegacyManagementTask("legacy-order-variant-codes", "org-1");

    expect(result).toEqual({ processedCount: 1, skippedCount: 0, status: "SUCCESS", sampleSkips: [] });
    expect(mocks.transaction.merchandisingOrder.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        id: "order-1",
        variantCode: null,
        styleName: "Oxford Shirt",
        colors: "Navy Blue",
      },
      data: { variantCode: "OXFORD-SHIRT-NAVY-BLUE" },
    });
    expect(mocks.transaction.platformMigrationAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        task_id: "legacy-order-variant-codes",
        organization_id: "org-1",
        status: "SUCCESS",
        records_processed: 1,
      }),
    });
  });

  it("dry-runs style-name-plus-color codes without writing variant records", async () => {
    mocks.prisma.masterArticleVariant.findMany.mockResolvedValue([{
      id: "variant-1",
      article_id: "article-1",
      color_id: "color-1",
      variant_code: "OLD-01",
      article: { article: "CLASSIC TEE", article_code: "CT01" },
      color: { colors: "Navy Blue" },
      _count: { uniformAssignments: 0 },
    }]);
    mocks.prisma.merchandisingOrder.findMany.mockResolvedValue([]);

    const result = await dryRunLegacyManagementTask(
      "legacy-article-variant-code-format",
      "org-1",
    );

    expect(result).toMatchObject({
      totalEligible: 1,
      skippedCount: 0,
      sampleChanges: [{ from: "OLD-01", to: "CLASSIC-TEE-NAVY-BLUE" }],
    });
    expect(mocks.prisma.masterArticleVariant.findMany.mock.calls[0][0].where)
      .toEqual({
        organization_id: "org-1",
        article: { organization_id: "org-1" },
        color: { organization_id: "org-1" },
      });
    expect(mocks.prisma.masterArticleVariant.updateMany).not.toHaveBeenCalled();
  });

  it("keeps the variant-code dry run scoped to variant records when orders exist", async () => {
    mocks.prisma.masterArticleVariant.findMany.mockResolvedValue([{
      id: "variant-1",
      article_id: "article-1",
      color_id: "color-1",
      variant_code: "OLD-01",
      article: { article: "CLASSIC TEE", article_code: "CT01" },
      color: { colors: "Navy Blue" },
      _count: { uniformAssignments: 0 },
    }]);
    mocks.prisma.merchandisingOrder.findMany.mockResolvedValue([{
      id: "order-1",
      article: "Classic Tee",
      colors: "NAVY BLUE",
    }]);

    const result = await dryRunLegacyManagementTask(
      "legacy-article-variant-code-format",
      "org-1",
    );

    expect(result).toMatchObject({
      totalEligible: 1,
      skippedCount: 0,
      sampleChanges: [{ from: "OLD-01", to: "CLASSIC-TEE-NAVY-BLUE" }],
    });
    expect(mocks.prisma.merchandisingOrder.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.masterArticleVariant.updateMany).not.toHaveBeenCalled();
  });

  it("executes a tenant-scoped variant code update and writes its audit record", async () => {
    mocks.transaction.masterArticleVariant.findMany.mockResolvedValue([{
      id: "variant-1",
      article_id: "article-1",
      color_id: "color-1",
      variant_code: "OLD-01",
      article: { article: "CLASSIC TEE", article_code: "CT01" },
      color: { colors: "Navy Blue" },
      _count: { uniformAssignments: 0 },
    }]);
    mocks.transaction.merchandisingOrder.findMany.mockResolvedValue([]);
    mocks.transaction.masterArticleVariant.updateMany.mockResolvedValue({ count: 1 });

    const result = await executeLegacyManagementTask(
      "legacy-article-variant-code-format",
      "org-1",
    );

    expect(result).toMatchObject({ processedCount: 1, skippedCount: 0, status: "SUCCESS" });
    expect(mocks.transaction.masterArticleVariant.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        id: "variant-1",
        article_id: "article-1",
        color_id: "color-1",
        variant_code: "OLD-01",
      },
      data: { variant_code: "CLASSIC-TEE-NAVY-BLUE" },
    });
    expect(mocks.transaction.platformMigrationAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        task_id: "legacy-article-variant-code-format",
        organization_id: "org-1",
        status: "SUCCESS",
        records_processed: 1,
      }),
    });
  });

  it("explains an unavailable audit schema when both execution and failure audit fail", async () => {
    const missingAuditTableError = Object.assign(
      new Error("database details are intentionally not exposed"),
      { code: "P2021" },
    );
    mocks.prisma.$transaction.mockRejectedValue(missingAuditTableError);
    mocks.prisma.platformMigrationAuditLog.create.mockRejectedValue(missingAuditTableError);
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(executeLegacyManagementTask(
      "legacy-article-variant-code-format",
      "org-1",
    )).rejects.toThrow(
      "The platform audit-log database schema is unavailable. Apply the pending audit-log migration in an approved environment before retrying.",
    );

    expect(mocks.prisma.platformMigrationAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        error_details: expect.objectContaining({
          message: "A required database table or column is missing. Check pending migrations before retrying.",
          errorCode: "P2021",
        }),
      }),
    });
  });

  it("dry-runs missing finished-goods identifiers only when a unique existing variant barcode is available", async () => {
    const existing = {
      id: "fg-existing",
      sku_code: "CLASSIC-TEE-BLACK-M",
      barcode: "FGBC-00000001",
      size: "M",
      order: { styleName: "Classic Tee", colors: "Black" },
    };
    const candidate = {
      id: "fg-missing",
      order_id: "order-draft",
      sku_code: null,
      barcode: null,
      size: "M",
      order: {
        organization_id: "org-1",
        styleName: "Classic Tee",
        colors: "Black",
        finalStatus: "Draft",
        workOrders: [],
        finishedGoodsGeneralStockReceipts: [],
        finishedGoodsAllocatedStockReceipts: [],
        qrPrintRequests: [],
      },
      _count: {
        workOrderLines: 0,
        productionUpdateSizeLines: 0,
        bundleTransferSizeLines: 0,
      },
    };
    mocks.prisma.finishedGoodsSizeWise.findMany
      .mockResolvedValueOnce([existing, candidate])
      .mockResolvedValueOnce([candidate]);

    const result = await dryRunLegacyManagementTask(
      "legacy-finished-goods-identifiers",
      "org-1",
    );

    expect(result).toMatchObject({
      totalEligible: 1,
      skippedCount: 0,
      sampleChanges: [{
        from: "SKU MISSING / BARCODE MISSING",
        to: "CLASSIC-TEE-BLACK-M / FGBC-00000001",
      }],
    });
    expect(mocks.prisma.finishedGoodsSizeWise.updateMany).not.toHaveBeenCalled();
  });

  it("backfills only null finished-goods identifiers under an unreferenced draft order", async () => {
    const existing = {
      id: "fg-existing",
      sku_code: "CLASSIC-TEE-BLACK-M",
      barcode: "FGBC-00000001",
      size: "M",
      order: { styleName: "Classic Tee", colors: "Black" },
    };
    const candidate = {
      id: "fg-missing",
      order_id: "order-draft",
      sku_code: null,
      barcode: null,
      size: "M",
      order: {
        organization_id: "org-1",
        styleName: "Classic Tee",
        colors: "Black",
        finalStatus: "Draft",
        workOrders: [],
        finishedGoodsGeneralStockReceipts: [],
        finishedGoodsAllocatedStockReceipts: [],
        qrPrintRequests: [],
      },
      _count: {
        workOrderLines: 0,
        productionUpdateSizeLines: 0,
        bundleTransferSizeLines: 0,
      },
    };
    mocks.transaction.finishedGoodsSizeWise.findMany
      .mockResolvedValueOnce([existing, candidate])
      .mockResolvedValueOnce([candidate]);
    mocks.transaction.finishedGoodsSizeWise.updateMany.mockResolvedValue({ count: 1 });

    const result = await executeLegacyManagementTask(
      "legacy-finished-goods-identifiers",
      "org-1",
    );

    expect(result).toMatchObject({ processedCount: 1, skippedCount: 0, status: "SUCCESS" });
    expect(mocks.transaction.finishedGoodsSizeWise.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "fg-missing",
        order_id: "order-draft",
        sku_code: null,
        barcode: null,
        order: { is: expect.objectContaining({ organization_id: "org-1", finalStatus: "Draft" }) },
      }),
      data: {
        sku_code: "CLASSIC-TEE-BLACK-M",
        barcode: "FGBC-00000001",
      },
    });
  });

  it("reports missing barcode mappings rather than inventing an identifier for legacy rows", async () => {
    const candidate = {
      id: "fg-missing",
      order_id: "order-draft",
      sku_code: null,
      barcode: null,
      size: "M",
      order: {
        organization_id: "org-1",
        styleName: "Classic Tee",
        colors: "Black",
        finalStatus: "Draft",
        workOrders: [],
        finishedGoodsGeneralStockReceipts: [],
        finishedGoodsAllocatedStockReceipts: [],
        qrPrintRequests: [],
      },
      _count: {
        workOrderLines: 0,
        productionUpdateSizeLines: 0,
        bundleTransferSizeLines: 0,
      },
    };
    mocks.prisma.finishedGoodsSizeWise.findMany
      .mockResolvedValueOnce([candidate])
      .mockResolvedValueOnce([candidate]);

    const result = await dryRunLegacyManagementTask(
      "legacy-finished-goods-identifiers",
      "org-1",
    );

    expect(result).toMatchObject({
      totalEligible: 0,
      skippedCount: 1,
      sampleSkips: [{ reason: expect.stringContaining("No existing barcode source") }],
    });
    expect(mocks.prisma.finishedGoodsSizeWise.updateMany).not.toHaveBeenCalled();
  });

  it("does not backfill finished-goods identifiers on an order with historical status", async () => {
    const existing = {
      id: "fg-existing",
      sku_code: "CLASSIC-TEE-BLACK-M",
      barcode: "FGBC-00000001",
      size: "M",
      order: { styleName: "Classic Tee", colors: "Black" },
    };
    const candidate = {
      id: "fg-missing",
      order_id: "order-completed",
      sku_code: "CLASSIC-TEE-BLACK-M",
      barcode: null,
      size: "M",
      order: {
        organization_id: "org-1",
        styleName: "Classic Tee",
        colors: "Black",
        finalStatus: "Completed",
        workOrders: [{ id: "wo-1" }],
        finishedGoodsGeneralStockReceipts: [],
        finishedGoodsAllocatedStockReceipts: [],
        qrPrintRequests: [],
      },
      _count: {
        workOrderLines: 0,
        productionUpdateSizeLines: 0,
        bundleTransferSizeLines: 0,
      },
    };
    mocks.prisma.finishedGoodsSizeWise.findMany
      .mockResolvedValueOnce([existing, candidate])
      .mockResolvedValueOnce([candidate]);

    const result = await dryRunLegacyManagementTask(
      "legacy-finished-goods-identifiers",
      "org-1",
    );

    expect(result).toMatchObject({
      totalEligible: 0,
      skippedCount: 1,
      sampleSkips: [{ reason: expect.stringContaining("Only draft orders") }],
    });
    expect(mocks.prisma.finishedGoodsSizeWise.updateMany).not.toHaveBeenCalled();
  });

  it("maps unmapped stock only to one active leaf in the same organization and location", async () => {
    mocks.transaction.finishedGoodsSkuStock.count.mockResolvedValue(0);
    mocks.transaction.finishedGoodsGeneralStockReceipt.count.mockResolvedValue(0);
    mocks.transaction.finishedGoodsSkuStock.findMany.mockResolvedValue([{
      id: "stock-1",
      entity_id: "entity-1",
      location_id: "location-1",
    }]);
    mocks.transaction.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.transaction.storageNode.findMany.mockResolvedValue([{
      id: "node-1",
      node_code: "SUB-01",
      node_name: "Sub-store 1",
    }]);
    mocks.transaction.storageNode.findFirst
      .mockResolvedValueOnce({
        id: "node-1",
        parent_node_id: "warehouse-1",
        parent_node_type: "WAREHOUSE",
      })
      .mockResolvedValueOnce({
        id: "warehouse-1",
        parent_node_id: "site-1",
        parent_node_type: "LOCATION_SITE",
      })
      .mockResolvedValueOnce({
        id: "site-1",
        entity_id: "entity-1",
        master_location_id: "location-1",
        parent_node_id: null,
        parent_node_type: null,
      });
    mocks.transaction.masterLocation.findFirst.mockResolvedValue({
      id: "location-1",
      entity_id: "entity-1",
      division_id: "division-1",
    });
    mocks.transaction.finishedGoodsSkuStock.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.platformMigrationAuditLog.create.mockResolvedValue({});

    const result = await executeLegacyManagementTask(
      "legacy-finished-goods-storage-nodes",
      "org-1",
    );

    expect(result).toMatchObject({ processedCount: 1, skippedCount: 0, status: "SUCCESS" });
    expect(mocks.transaction.finishedGoodsSkuStock.findMany.mock.calls[0][0].where)
      .toEqual({ organization_id: "org-1", storage_node_id: null });
    expect(mocks.transaction.finishedGoodsSkuStock.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        id: { in: ["stock-1"] },
        storage_node_id: null,
      },
      data: { storage_node_id: "node-1" },
    });
    expect(mocks.transaction.platformMigrationAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        task_id: "legacy-finished-goods-storage-nodes",
        organization_id: "org-1",
        status: "SUCCESS",
        records_processed: 1,
      }),
    });
  });

  it("skips unmapped stock when multiple active storage leaves could match", async () => {
    mocks.prisma.finishedGoodsSkuStock.count.mockResolvedValue(0);
    mocks.prisma.finishedGoodsGeneralStockReceipt.count.mockResolvedValue(0);
    mocks.prisma.finishedGoodsSkuStock.findMany.mockResolvedValue([{
      id: "stock-ambiguous",
      entity_id: "entity-1",
      location_id: "location-1",
    }]);
    mocks.prisma.finishedGoodsGeneralStockReceipt.findMany.mockResolvedValue([]);
    mocks.prisma.storageNode.findMany.mockResolvedValue([
      { id: "node-1", node_code: "SUB-01", node_name: "Sub-store 1" },
      { id: "node-2", node_code: "SUB-02", node_name: "Sub-store 2" },
    ]);

    const result = await dryRunLegacyManagementTask(
      "legacy-finished-goods-storage-nodes",
      "org-1",
    );

    expect(result).toMatchObject({
      totalEligible: 0,
      skippedCount: 1,
      sampleSkips: [{ reason: expect.stringContaining("No single active Sub-sub-location") }],
    });
    expect(mocks.prisma.storageNode.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.finishedGoodsSkuStock.updateMany).not.toHaveBeenCalled();
  });

  it("executes a tenant-scoped state-code update and writes its immutable audit summary", async () => {
    mocks.transaction.contactAddress.findMany.mockResolvedValue([
      contactAddressCandidate({ id: "address-eligible" }),
    ]);
    mocks.transaction.contactAddress.updateMany.mockResolvedValue({ count: 1 });

    const result = await executeLegacyManagementTask(
      "contact-address-state-from-state-name",
      "org-1",
    );

    expect(result).toEqual({ processedCount: 1, skippedCount: 0, status: "SUCCESS" });
    expect(mocks.transaction.contactAddress.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        organization_id: "org-1",
        state_code: null,
        id: { in: ["address-eligible"] },
      },
      data: { state_code: "29" },
    });
    expect(mocks.transaction.platformMigrationAuditLog.create).toHaveBeenCalledWith({
      data: {
        task_id: "contact-address-state-from-state-name",
        task_name: "Normalize Contact Address GST State Codes",
        organization_id: "org-1",
        executed_by: "platform-admin-1",
        status: "SUCCESS",
        records_processed: 1,
        records_skipped: 0,
      },
    });
  });

  it("only raises an order counter to the highest valid organization order sequence", async () => {
    mocks.transaction.merchandisingOrder.findMany.mockResolvedValue([
      { id: "order-1", orderNo: "OD-42" },
    ]);
    mocks.transaction.organizationOrderCounter.findUnique.mockResolvedValue({
      current_value: 10,
    });
    mocks.transaction.organizationOrderCounter.updateMany.mockResolvedValue({ count: 1 });

    await executeLegacyManagementTask("legacy-order-number-sequences", "org-1");

    expect(mocks.transaction.organizationOrderCounter.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "org-1",
        current_value: { lt: 42 },
      },
      data: { current_value: 42 },
    });
    expect(mocks.transaction.organizationOrderCounter.createMany).not.toHaveBeenCalled();
  });

  it("reports order sequences outside the counter range as skipped", async () => {
    mocks.prisma.merchandisingOrder.findMany.mockResolvedValue([
      { id: "order-invalid", orderNo: "OD-2147483648" },
      { id: "order-malformed", orderNo: "legacy-42" },
    ]);
    mocks.prisma.organizationOrderCounter.findUnique.mockResolvedValue({
      current_value: 0,
    });

    const result = await dryRunLegacyManagementTask(
      "legacy-order-number-sequences",
      "org-1",
    );

    expect(result).toMatchObject({
      totalEligible: 0,
      skippedCount: 2,
      sampleChanges: [],
    });
    expect(mocks.prisma.organizationOrderCounter.updateMany).not.toHaveBeenCalled();
  });

  it("records a failure audit after the execution transaction rolls back", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.transaction.contactAddress.findMany.mockResolvedValue([
      contactAddressCandidate({ id: "address-eligible" }),
    ]);
    mocks.transaction.contactAddress.updateMany.mockRejectedValue(
      new TypeError("Cannot read properties of undefined (reading 'updateMany')"),
    );

    await expect(executeLegacyManagementTask(
      "contact-address-state-from-state-name",
      "org-1",
    )).rejects.toThrow(
      "Legacy task was rolled back. Failure reason: The task hit a runtime TypeError: Cannot read properties of undefined (reading 'updateMany').",
    );

    expect(mocks.prisma.platformMigrationAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        task_id: "contact-address-state-from-state-name",
        task_name: "Normalize Contact Address GST State Codes",
        organization_id: "org-1",
        executed_by: "platform-admin-1",
        status: "FAILED",
        records_processed: 0,
        error_details: expect.objectContaining({
          message: "The task hit a runtime TypeError: Cannot read properties of undefined (reading 'updateMany').",
          errorType: "TypeError",
        }),
      }),
    });
    expect(consoleError).toHaveBeenCalled();
  });
});
