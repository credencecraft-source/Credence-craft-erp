import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaCounterMock = vi.hoisted(() => ({
  upsert: vi.fn(),
  procurementCounterUpsert: vi.fn(),
  orderFindFirst: vi.fn(),
  orderFindMany: vi.fn(),
  orderCreate: vi.fn(),
  orderUpdate: vi.fn(),
  formRestriction: vi.fn(),
  validateMonthlyFormLimits: vi.fn(),
  validateRestrictedFormFields: vi.fn(),
  orderQuantityLimitLock: vi.fn(),
  requireActiveEntity: vi.fn(),
  bookingFindMany: vi.fn(),
  workOrderFindMany: vi.fn(),
  factoryGrnFindMany: vi.fn(),
  generalStockReceiptFindMany: vi.fn(),
  orderDeleteMany: vi.fn(),
  createAuditEvent: vi.fn(),
  articleFindMany: vi.fn(),
  articleVariantFindMany: vi.fn(),
  bomItemFindMany: vi.fn(),
  sizeGroupFindMany: vi.fn(),
  sizeGroupSizeFindMany: vi.fn(),
  finishedGoodsSizeWiseFindFirst: vi.fn(),
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: prismaCounterMock.createAuditEvent,
}));

vi.mock("@/lib/services/organizations/organization-entity-service", () => ({
  requireActiveOrganizationEntity: prismaCounterMock.requireActiveEntity,
}));

vi.mock("@/lib/services/platform/segment-form-restriction-service", () => ({
  getEffectiveSegmentFormRestriction: prismaCounterMock.formRestriction,
  validateMonthlyFormLimits: prismaCounterMock.validateMonthlyFormLimits,
  validateRestrictedFormFields: prismaCounterMock.validateRestrictedFormFields,
}));

vi.mock("@/lib/services/platform/order-quantity-limit-service", () => ({
  lockOrganizationOrderQuantityLimit: prismaCounterMock.orderQuantityLimitLock,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      organizationOrderCounter: { upsert: prismaCounterMock.upsert },
      procurementDocumentCounter: { upsert: prismaCounterMock.procurementCounterUpsert },
      merchandisingOrder: {
        findFirst: prismaCounterMock.orderFindFirst,
        create: prismaCounterMock.orderCreate,
        update: prismaCounterMock.orderUpdate,
      },
      masterArticle: { findMany: prismaCounterMock.articleFindMany },
      masterArticleVariant: { findMany: prismaCounterMock.articleVariantFindMany },
    })),
    organizationOrderCounter: {
      upsert: prismaCounterMock.upsert,
    },
    procurementDocumentCounter: {
      upsert: prismaCounterMock.procurementCounterUpsert,
    },
    merchandisingOrder: {
      findFirst: prismaCounterMock.orderFindFirst,
      findMany: prismaCounterMock.orderFindMany,
      deleteMany: prismaCounterMock.orderDeleteMany,
    },
    advanceBooking: { findMany: prismaCounterMock.bookingFindMany },
    factoryWorkOrder: { findMany: prismaCounterMock.workOrderFindMany },
    factoryGrn: { findMany: prismaCounterMock.factoryGrnFindMany },
    finishedGoodsGeneralStockReceipt: {
      findMany: prismaCounterMock.generalStockReceiptFindMany,
    },
    masterArticle: {
      findMany: prismaCounterMock.articleFindMany,
    },
    masterArticleVariant: {
      findMany: prismaCounterMock.articleVariantFindMany,
    },
    masterSizeGroup: {
      findMany: prismaCounterMock.sizeGroupFindMany,
    },
    masterSizeGroupSize: {
      findMany: prismaCounterMock.sizeGroupSizeFindMany,
    },
    billOfMaterialItem: {
      findMany: prismaCounterMock.bomItemFindMany,
    },
    finishedGoodsSizeWise: {
      findFirst: prismaCounterMock.finishedGoodsSizeWiseFindFirst,
    },
    organizationDummyDataBatch: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import {
  deleteOrders,
  createOrder,
  getArticleOrderSummaries,
  getOrderCoreById,
  getOrderDetailSection,
  getOrderById,
  listBomItemsPage,
  listOrdersPage,
  reserveNextFinishedGoodsBarcode,
  reserveNextOrderBarcode,
  reserveNextOrderNumber,
  reserveNextOrderNumbers,
  reserveNextOrderSkuCode,
  updateFinishedGoodsForOrder,
  resolveOrderMasterSnapshots,
  updateOrderWithDetails,
} from "./order-service";

describe("reserveNextOrderNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Size Group ordering for order forms", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns order sizes according to the selected Size Group", async () => {
      prismaCounterMock.orderFindFirst.mockResolvedValueOnce({
        id: "order-1",
        sizeGroup: "CORE",
        finishedGoods: [
          { id: "fg-m", size: "M", buyerSize: "M" },
          { id: "fg-xl", size: "XL", buyerSize: "XL" },
          { id: "fg-s", size: "S", buyerSize: "S" },
        ],
      });
      prismaCounterMock.sizeGroupFindMany.mockResolvedValueOnce([{
        id: "group-id",
        value_id: "group-value-id",
        size_group: "CORE",
        size_links: ["XL", "S", "M"].map((size) => ({
          size: { organization_id: "org-1", size },
        })),
      }]);
      prismaCounterMock.sizeGroupSizeFindMany.mockResolvedValueOnce([
        { size_group_id: "group-id", size: { id: "size-xl", value_id: "size-xl-value", organization_id: "org-1", size: "XL", is_active: true, status: "ACTIVE", legacy_metadata: null } },
        { size_group_id: "group-id", size: { id: "size-s", value_id: "size-s-value", organization_id: "org-1", size: "S", is_active: true, status: "ACTIVE", legacy_metadata: null } },
        { size_group_id: "group-id", size: { id: "size-m", value_id: "size-m-value", organization_id: "org-1", size: "M", is_active: true, status: "ACTIVE", legacy_metadata: null } },
      ]);

      const order = await getOrderById("order-1", "org-1");

      expect(order?.finishedGoods.map((row) => row.size)).toEqual(["XL", "S", "M"]);
      expect(prismaCounterMock.orderFindFirst.mock.calls[0][0].select.finishedGoods.select).toMatchObject({
        sku_code: true,
        barcode: true,
      });
    });

    it("loads finished goods only when requesting that order section", async () => {
      prismaCounterMock.orderFindFirst.mockResolvedValueOnce({
        sizeGroup: "CORE",
        finishedGoods: [
          { id: "fg-m", size: "M", buyerSize: "M" },
          { id: "fg-xl", size: "XL", buyerSize: "XL" },
        ],
      });
      prismaCounterMock.sizeGroupFindMany.mockResolvedValueOnce([{
        id: "group-id",
        value_id: "group-value-id",
        size_group: "CORE",
        size_links: ["XL", "M"].map((size) => ({
          size: { organization_id: "org-1", size },
        })),
      }]);
      prismaCounterMock.sizeGroupSizeFindMany.mockResolvedValueOnce([]);

      await getOrderDetailSection("order-1", "org-1", "finishedGoods");

      expect(prismaCounterMock.orderFindFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "order-1", organization_id: "org-1" },
        select: expect.objectContaining({
          finishedGoods: {
            select: expect.objectContaining({
              sku_code: true,
              barcode: true,
            }),
          },
        }),
      }));
      expect(prismaCounterMock.orderFindFirst.mock.calls[0][0].select).not.toHaveProperty("bomItems");
      expect(prismaCounterMock.orderFindFirst.mock.calls[0][0].select).not.toHaveProperty("processSteps");
    });
  });

  it("loads only order header fields for the initial edit view", async () => {
    prismaCounterMock.orderFindFirst.mockResolvedValueOnce({ id: "order-1", orderNo: "OD-1" });

    await getOrderCoreById("order-1", "org-1");

    const query = prismaCounterMock.orderFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: "order-1", organization_id: "org-1" });
    expect(query.select).not.toHaveProperty("finishedGoods");
    expect(query.select).not.toHaveProperty("bomItems");
    expect(query.select).not.toHaveProperty("processSteps");
    expect(query.select.variantCode).toBe(true);
  });

  it("falls back to the base prisma client when a closed transaction is reused", async () => {
    const staleTransaction = {
      organizationOrderCounter: {
        upsert: vi.fn().mockRejectedValue(new Error("Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore, or was obtained before disconnecting.")),
      },
    } as unknown as Prisma.TransactionClient;

    prismaCounterMock.upsert.mockResolvedValue({ current_value: 7 });

    await expect(reserveNextOrderNumber("org-123", staleTransaction)).resolves.toBe("OD-7");
    expect(staleTransaction.organizationOrderCounter.upsert).toHaveBeenCalledTimes(1);
    expect(prismaCounterMock.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("reserveNextOrderIdentifiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates the next unique order SKU and barcode for a new merchandising order", async () => {
    prismaCounterMock.procurementCounterUpsert
      .mockResolvedValueOnce({ current_value: 42 })
      .mockResolvedValueOnce({ current_value: 15 });
    prismaCounterMock.orderFindFirst.mockResolvedValue(null);

    await expect(reserveNextOrderSkuCode("org-123")).resolves.toBe("SKU-000042");
    await expect(reserveNextOrderBarcode("org-123")).resolves.toBe("BC-00000015");

    expect(prismaCounterMock.procurementCounterUpsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { organization_id_document_type: { organization_id: "org-123", document_type: "MERCH_ORDER_SKU" } },
    }));
    expect(prismaCounterMock.procurementCounterUpsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { organization_id_document_type: { organization_id: "org-123", document_type: "MERCH_ORDER_BARCODE" } },
    }));
  });

  it("reserves the next unique finished-goods barcode marker", async () => {
    prismaCounterMock.procurementCounterUpsert.mockResolvedValueOnce({ current_value: 11 });
    prismaCounterMock.finishedGoodsSizeWiseFindFirst.mockResolvedValue(null);

    await expect(reserveNextFinishedGoodsBarcode("org-123")).resolves.toBe("FGBC-00000011");

    expect(prismaCounterMock.procurementCounterUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id_document_type: { organization_id: "org-123", document_type: "MERCH_FG_BARCODE" } },
    }));
  });
});

describe("resolveOrderMasterSnapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves order article and variant references within the organization", async () => {
    prismaCounterMock.articleFindMany.mockResolvedValue([{
      id: "article-1",
      article: "Jacket",
      article_code: "AR-1",
    }]);
    prismaCounterMock.articleVariantFindMany.mockResolvedValue([{
      id: "variant-1",
      article_id: "article-1",
      color: { colors: "Navy Blue" },
    }]);
    const database = {
      masterArticle: { findMany: prismaCounterMock.articleFindMany },
      masterArticleVariant: { findMany: prismaCounterMock.articleVariantFindMany },
    } as unknown as Prisma.TransactionClient;

    await expect(resolveOrderMasterSnapshots(database, "org-1", [{
      article: "JACKET",
      colors: "NAVY BLUE",
    }])).resolves.toEqual([{
      articleCode: "AR-1",
      master_article_id: "article-1",
      master_variant_id: "variant-1",
    }]);
    expect(prismaCounterMock.articleFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "org-1" }),
    }));
    expect(prismaCounterMock.articleVariantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "org-1" }),
    }));
  });

  it("rejects ambiguous case-insensitive article matches rather than persisting the wrong identity", async () => {
    prismaCounterMock.articleFindMany.mockResolvedValue([
      { id: "article-1", article: "Jacket", article_code: "AR-1" },
      { id: "article-2", article: "JACKET", article_code: "AR-2" },
    ]);
    const database = {
      masterArticle: { findMany: prismaCounterMock.articleFindMany },
      masterArticleVariant: { findMany: prismaCounterMock.articleVariantFindMany },
    } as unknown as Prisma.TransactionClient;

    await expect(resolveOrderMasterSnapshots(database, "org-1", [{
      article: "Jacket",
      colors: "Navy Blue",
    }])).rejects.toThrow("matches more than one master record");
    expect(prismaCounterMock.articleVariantFindMany).not.toHaveBeenCalled();
  });

  it("preserves an existing article snapshot when only the order colour changes", async () => {
    prismaCounterMock.articleVariantFindMany.mockResolvedValue([{
      id: "variant-2",
      article_id: "article-1",
      color: { colors: "Red" },
    }]);
    const database = {
      masterArticle: { findMany: prismaCounterMock.articleFindMany },
      masterArticleVariant: { findMany: prismaCounterMock.articleVariantFindMany },
    } as unknown as Prisma.TransactionClient;

    await expect(resolveOrderMasterSnapshots(database, "org-1", [{
      article: "Old article label",
      colors: "Red",
      existingMasterArticleId: "article-1",
      existingArticleCode: "AR-1",
      preserveExistingArticle: true,
    }])).resolves.toEqual([{
      articleCode: "AR-1",
      master_article_id: "article-1",
      master_variant_id: "variant-2",
    }]);
    expect(prismaCounterMock.articleFindMany).not.toHaveBeenCalled();
  });
});

describe("order snapshot writes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists article and variant snapshots when creating an order", async () => {
    prismaCounterMock.formRestriction.mockResolvedValue(null);
    prismaCounterMock.orderQuantityLimitLock.mockResolvedValue(undefined);
    prismaCounterMock.validateMonthlyFormLimits.mockResolvedValue(undefined);
    prismaCounterMock.validateRestrictedFormFields.mockResolvedValue(undefined);
    prismaCounterMock.requireActiveEntity.mockResolvedValue({
      id: "entity-1",
      entity_name: "Entity",
    });
    prismaCounterMock.upsert.mockResolvedValue({ current_value: 1 });
    prismaCounterMock.procurementCounterUpsert.mockResolvedValue({ current_value: 1 });
    prismaCounterMock.orderFindFirst.mockResolvedValue(null);
    prismaCounterMock.articleFindMany.mockResolvedValue([{
      id: "article-1",
      article: "Jacket",
      article_code: "AR-1",
    }]);
    prismaCounterMock.articleVariantFindMany.mockResolvedValue([{
      id: "variant-1",
      article_id: "article-1",
      color: { colors: "Navy Blue" },
    }]);
    prismaCounterMock.orderCreate.mockResolvedValue({
      id: "order-1",
      orderNo: "OD-1",
      finalStatus: "Draft",
      deliveryDate: null,
    });

    await createOrder("org-1", {
      entityName: "Entity",
      article: "Jacket",
      styleName: "Oxford Shirt",
      colors: "Navy Blue",
    }, "user-1");

    expect(prismaCounterMock.orderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-1",
        articleCode: "AR-1",
        master_article_id: "article-1",
        master_variant_id: "variant-1",
        variantCode: "OXFORD-SHIRT-NAVY-BLUE",
      }),
    });
  });

  it("updates the stored variant reference without refreshing the article snapshot", async () => {
    const existingOrder = {
      id: "order-1",
      orderNo: "OD-1",
      entity_id: "entity-1",
      entityName: "Entity",
      sourceStatus: "DEMO",
      article: "Old article label",
      articleCode: "AR-1",
      master_article_id: "article-1",
      master_variant_id: "variant-1",
      styleName: "Classic",
      colors: "Blue",
      orderQty: 10,
      finalStatus: "Draft",
    };
    prismaCounterMock.orderFindFirst.mockResolvedValue(existingOrder);
    prismaCounterMock.orderUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...existingOrder, ...data }),
    );
    prismaCounterMock.requireActiveEntity.mockResolvedValue({
      id: "entity-1",
      entity_name: "Entity",
    });
    prismaCounterMock.orderQuantityLimitLock.mockResolvedValue(undefined);
    prismaCounterMock.validateMonthlyFormLimits.mockResolvedValue(undefined);
    prismaCounterMock.validateRestrictedFormFields.mockResolvedValue(undefined);
    prismaCounterMock.articleVariantFindMany.mockResolvedValue([{
      id: "variant-2",
      article_id: "article-1",
      color: { colors: "Red" },
    }]);

    await updateOrderWithDetails("order-1", "org-1", { colors: "Red" }, "user-1");

    expect(prismaCounterMock.orderUpdate).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: expect.objectContaining({
        articleCode: "AR-1",
        master_article_id: "article-1",
        master_variant_id: "variant-2",
        variantCode: "CLASSIC-RED",
      }),
    });
    expect(prismaCounterMock.articleFindMany).not.toHaveBeenCalled();
  });
});

describe("updateFinishedGoodsForOrder SKU identity", () => {
  it("derives each SKU from style, color, and size instead of trusting a submitted counter SKU", async () => {
    const database = {
      merchandisingOrder: {
        findFirst: vi.fn().mockResolvedValue({ styleName: "Classic Tee", colors: "Black" }),
      },
      finishedGoodsSizeWise: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as Prisma.TransactionClient;

    await updateFinishedGoodsForOrder(
      "order-1",
      "org-1",
      [{ size: "L", skuCode: "FGSKU-000007", barcode: "FGBC-00000011", totalQty: 1 }],
      database,
    );

    expect(database.finishedGoodsSizeWise.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        sku_code: "CLASSIC-TEE-BLACK-L",
        barcode: "FGBC-00000011",
      })],
    });
  });

  it("validates the SKU source before deleting saved finished-goods rows", async () => {
    const deleteMany = vi.fn();
    const database = {
      merchandisingOrder: {
        findFirst: vi.fn().mockResolvedValue({ styleName: "Classic Tee", colors: "" }),
      },
      finishedGoodsSizeWise: {
        deleteMany,
        createMany: vi.fn(),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(updateFinishedGoodsForOrder("order-1", "org-1", [{ size: "L" }], database))
      .rejects.toThrow("Finished-goods SKU requires a style, color, and size");
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaCounterMock.bookingFindMany.mockResolvedValue([]);
    prismaCounterMock.workOrderFindMany.mockResolvedValue([]);
    prismaCounterMock.factoryGrnFindMany.mockResolvedValue([]);
    prismaCounterMock.generalStockReceiptFindMany.mockResolvedValue([]);
    prismaCounterMock.orderDeleteMany.mockResolvedValue({ count: 1 });
    prismaCounterMock.createAuditEvent.mockResolvedValue({});
  });

  it("blocks deleting an order referenced by advance bookings and names the next step", async () => {
    prismaCounterMock.bookingFindMany.mockResolvedValue([
      { booking_no: "BK-100" },
      { booking_no: "BK-101" },
    ]);

    await expect(deleteOrders(["order-1"], "org-1", "user-1"))
      .rejects.toThrow(
        "Cannot delete these orders because advance bookings BK-100, BK-101 still reference them. Resolve or delete the linked bookings in Advance Booking first.",
      );

    expect(prismaCounterMock.bookingFindMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", order_id: { in: ["order-1"] } },
      select: { booking_no: true },
      take: 6,
    });
    expect(prismaCounterMock.workOrderFindMany).not.toHaveBeenCalled();
    expect(prismaCounterMock.factoryGrnFindMany).not.toHaveBeenCalled();
    expect(prismaCounterMock.orderDeleteMany).not.toHaveBeenCalled();
  });

  it("blocks deleting orders linked to work orders before checking GRNs or stock receipts", async () => {
    prismaCounterMock.workOrderFindMany.mockResolvedValueOnce([
      { work_order_no: "WO-100" },
    ]);

    await expect(deleteOrders(["order-1"], "org-1", "user-1"))
      .rejects.toThrow(
        "These orders cannot be deleted because work order(s) are created for them. Delete the related work orders first before deleting the order.",
      );

    expect(prismaCounterMock.workOrderFindMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", order_id: { in: ["order-1"] } },
      select: { work_order_no: true },
      take: 1,
    });
    expect(prismaCounterMock.factoryGrnFindMany).not.toHaveBeenCalled();
    expect(prismaCounterMock.generalStockReceiptFindMany).not.toHaveBeenCalled();
    expect(prismaCounterMock.orderDeleteMany).not.toHaveBeenCalled();
    expect(prismaCounterMock.createAuditEvent).not.toHaveBeenCalled();
  });

  it("deletes tenant-scoped orders only when no booking or GRN dependency exists", async () => {
    await expect(deleteOrders(["order-1"], "org-1", "user-1"))
      .resolves.toEqual({ deletedCount: 1 });

    expect(prismaCounterMock.generalStockReceiptFindMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", order_id: { in: ["order-1"] } },
      select: { order_no: true },
      take: 1,
    });
    expect(prismaCounterMock.orderDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["order-1"] }, organization_id: "org-1" },
    });
    expect(prismaCounterMock.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      userId: "user-1",
      action: "DELETE",
      entityType: "MerchandisingOrder",
    }));
  });

  it("blocks deleting orders linked to finished-goods general stock receipts", async () => {
    prismaCounterMock.generalStockReceiptFindMany.mockResolvedValueOnce([
      { order_no: "OD-100" },
    ]);

    await expect(deleteOrders(["order-1"], "org-1", "user-1"))
      .rejects.toThrow(
        "These orders cannot be deleted because finished goods general stock receipt records exist for them. Reverse or remove the related stock receipts first.",
      );

    expect(prismaCounterMock.generalStockReceiptFindMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", order_id: { in: ["order-1"] } },
      select: { order_no: true },
      take: 1,
    });
    expect(prismaCounterMock.orderDeleteMany).not.toHaveBeenCalled();
    expect(prismaCounterMock.createAuditEvent).not.toHaveBeenCalled();
  });

  it("returns a safe dependency message if a reference appears during deletion", async () => {
    prismaCounterMock.orderDeleteMany.mockRejectedValue({ code: "P2003" });

    await expect(deleteOrders(["order-1"], "org-1", "user-1"))
      .rejects.toThrow(
        "One or more selected orders still have related business records, such as advance bookings, production, or GRN records. Resolve those records before deleting the orders.",
      );
  });
});

describe("reserveNextOrderNumbers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reserves a contiguous range with one atomic counter update", async () => {
    const database = {
      organizationOrderCounter: {
        upsert: vi.fn().mockResolvedValue({ current_value: 14 }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(reserveNextOrderNumbers("org-123", 10, database)).resolves.toEqual([
      "OD-5", "OD-6", "OD-7", "OD-8", "OD-9", "OD-10", "OD-11", "OD-12", "OD-13", "OD-14",
    ]);
    expect(database.organizationOrderCounter.upsert).toHaveBeenCalledTimes(1);
    expect(database.organizationOrderCounter.upsert).toHaveBeenCalledWith({
      where: { organization_id: "org-123" },
      create: { organization_id: "org-123", current_value: 10 },
      update: { current_value: { increment: 10 } },
      select: { current_value: true },
    });
  });

  describe("listOrdersPage", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("scopes the query by organization and status and returns a cursor when another page exists", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([
        { id: "order-2", created_at: new Date("2026-10-02T00:00:00.000Z"), deliveryDate: null },
        { id: "order-1", created_at: new Date("2026-10-01T00:00:00.000Z"), deliveryDate: null },
      ]);

      const page = await listOrdersPage("org-1", { limit: 1, status: "Approved" });

      expect(prismaCounterMock.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { organization_id: "org-1", finalStatus: "Approved" },
        take: 2,
      }));
      expect(page.orders).toHaveLength(1);
      expect(page.nextCursor).toBeTruthy();
    });

    it("loads a lean order page without fetching finished goods for the list", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([
        { id: "order-1", created_at: new Date("2026-10-01T00:00:00.000Z"), deliveryDate: null },
      ]);

      await listOrdersPage("org-1", { limit: 25 });

      expect(prismaCounterMock.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { organization_id: "org-1" },
        take: 26,
        select: expect.not.objectContaining({ finishedGoods: expect.anything() }),
      }));
    });

    it("applies server-side text search and column filters within the organization", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([]);

      await listOrdersPage("org-1", {
        status: "Draft",
        search: "Jacket",
        filters: { buyer: { operator: "contains", value: "Acme" } },
      });

      expect(prismaCounterMock.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          finalStatus: "Draft",
          AND: [
            { OR: expect.arrayContaining([
              { orderNo: { contains: "Jacket", mode: "insensitive" } },
              { styleName: { contains: "Jacket", mode: "insensitive" } },
              { articleCode: { contains: "Jacket", mode: "insensitive" } },
            ]) },
            { buyer: { contains: "Acme", mode: "insensitive" } },
          ],
        }),
      }));
      expect(prismaCounterMock.articleFindMany).not.toHaveBeenCalled();
    });

    it("uses exact matching for numeric quantities and rejects text operators", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([]);

      await listOrdersPage("org-1", {
        filters: { orderQty: { operator: "is", value: "42" } },
      });

      expect(prismaCounterMock.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ AND: [{ orderQty: 42 }] }),
      }));
      await expect(listOrdersPage("org-1", {
        filters: { orderQty: { operator: "contains", value: "4" } },
      })).rejects.toThrow("Order quantity filters support exact or empty matching only.");
    });

    it("filters article codes directly against the persisted order column", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([]);

      await listOrdersPage("org-1", {
        filters: { articleCode: { operator: "is", value: "AR-1" } },
      });

      expect(prismaCounterMock.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          organization_id: "org-1",
          AND: [{ articleCode: { equals: "AR-1", mode: "insensitive" } }],
        }),
      }));
      expect(prismaCounterMock.articleFindMany).not.toHaveBeenCalled();
    });

    it("uses a minimal order projection for the advance-booking selector", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([
        {
          id: "order-1",
          orderNo: "OD-1",
          created_at: new Date("2026-10-01T00:00:00.000Z"),
          deliveryDate: null,
        },
      ]);

      const page = await listOrdersPage("org-1", { purpose: "advance-booking" });

      expect(prismaCounterMock.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
        select: {
          id: true,
          orderNo: true,
          entityName: true,
          buyer: true,
          brand: true,
          articleCode: true,
          variantCode: true,
          styleName: true,
          orderQty: true,
          deliveryDate: true,
          finalStatus: true,
          created_at: true,
        },
      }));
      expect(prismaCounterMock.articleFindMany).not.toHaveBeenCalled();
      expect(prismaCounterMock.articleVariantFindMany).not.toHaveBeenCalled();
      expect(page.orders[0]).toMatchObject({ orderNo: "OD-1" });
    });

    it("returns stored article and variant codes from the order report query", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([
        {
          id: "order-1",
          article: "Jacket",
          articleCode: "AR-1",
          variantCode: "STORED-ORDER-CODE",
          created_at: new Date("2026-10-01T00:00:00.000Z"),
          deliveryDate: null,
        },
      ]);

      const page = await listOrdersPage("org-1");

      expect(prismaCounterMock.orderFindMany.mock.calls[0][0].select.articleCode).toBe(true);
      expect(prismaCounterMock.orderFindMany.mock.calls[0][0].select.variantCode).toBe(true);
      expect(page.orders[0]).toMatchObject({
        article: "Jacket",
        articleCode: "AR-1",
        variantCode: "STORED-ORDER-CODE",
      });
      expect(prismaCounterMock.articleFindMany).not.toHaveBeenCalled();
      expect(prismaCounterMock.articleVariantFindMany).not.toHaveBeenCalled();
    });

    it("filters variant codes directly against the persisted column", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([{
        id: "order-1",
        article: "Jacket",
        styleName: "Oxford Shirt",
        colors: "Navy Blue",
        variantCode: "OXFORD-SHIRT-NAVY-BLUE",
        created_at: new Date("2026-10-01T00:00:00.000Z"),
        deliveryDate: null,
      }]);

      await listOrdersPage("org-1", {
        filters: { variantCode: { operator: "is", value: "Oxford Shirt-Navy Blue" } },
      });

      const where = prismaCounterMock.orderFindMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({
        variantCode: { equals: "OXFORD-SHIRT-NAVY-BLUE", mode: "insensitive" },
      });
    });

    it("searches persisted variant codes directly without reading master variant codes", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([]);

      await listOrdersPage("org-1", { search: "Oxford Shirt-Navy Blue" });

      const where = prismaCounterMock.orderFindMany.mock.calls[0][0].where;
      const searchConditions = where.AND[0].OR;
      expect(searchConditions).toContainEqual({
        variantCode: { contains: "OXFORD-SHIRT-NAVY-BLUE", mode: "insensitive" },
      });
      expect(searchConditions).toContainEqual({
        articleCode: { contains: "Oxford Shirt-Navy Blue", mode: "insensitive" },
      });
      expect(prismaCounterMock.articleFindMany).not.toHaveBeenCalled();
      expect(prismaCounterMock.articleVariantFindMany).not.toHaveBeenCalled();
    });

    it("returns no variant code when the order has no color", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([{
        id: "order-1",
        article: "Jacket",
        colors: null,
        articleCode: null,
        variantCode: null,
        created_at: new Date("2026-10-01T00:00:00.000Z"),
        deliveryDate: null,
      }]);

      const page = await listOrdersPage("org-1");

      expect(page.orders[0].variantCode).toBeNull();
      expect(page.orders[0].articleCode).toBeNull();
      expect(prismaCounterMock.articleFindMany).not.toHaveBeenCalled();
      expect(prismaCounterMock.articleVariantFindMany).not.toHaveBeenCalled();
    });
  });

  describe("getArticleOrderSummaries", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("filters article detail reads by organization, season, and article", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([]);

      await expect(getArticleOrderSummaries("org-1", { season: "Winter", article: "Jacket" }))
        .resolves.toEqual([]);

      expect(prismaCounterMock.orderFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { organization_id: "org-1", season: "Winter", article: "Jacket" },
        select: expect.not.objectContaining({
          finishedGoods: expect.anything(),
          bomItems: expect.anything(),
        }),
      }));
    });

    it("keeps report size columns and rows in Size Group order", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValueOnce([{
        id: "order-1",
        orderNo: "OD-1",
        entityName: "Factory",
        category: "Top",
        subCategory: "Shirt",
        season: "Winter",
        article: "Shirt",
        styleName: "Shirt",
        colors: "Navy",
        buyer: "Buyer",
        brand: "Brand",
        sizeGroup: "CORE",
        orderQty: 30,
        deliveryDate: null,
        finalStatus: "Draft",
        processStatus: null,
        finishedGoods: [
          { id: "fg-m", buyerSize: "M", size: "M", beforeExcessQty: 10, excess: null, excessQty: 0, totalQty: 10 },
          { id: "fg-xl", buyerSize: "XL", size: "XL", beforeExcessQty: 10, excess: null, excessQty: 0, totalQty: 10 },
          { id: "fg-s", buyerSize: "S", size: "S", beforeExcessQty: 10, excess: null, excessQty: 0, totalQty: 10 },
        ],
        bomItems: [],
      }]);
      prismaCounterMock.sizeGroupFindMany.mockResolvedValueOnce([{
        id: "group-id",
        value_id: "group-value-id",
        size_group: "CORE",
        size_links: ["XL", "S", "M"].map((size) => ({
          size: { organization_id: "org-1", size },
        })),
      }]);
      prismaCounterMock.sizeGroupSizeFindMany.mockResolvedValueOnce([
        { size_group_id: "group-id", size: { id: "size-xl", value_id: "size-xl-value", organization_id: "org-1", size: "XL", is_active: true, status: "ACTIVE", legacy_metadata: null } },
        { size_group_id: "group-id", size: { id: "size-s", value_id: "size-s-value", organization_id: "org-1", size: "S", is_active: true, status: "ACTIVE", legacy_metadata: null } },
        { size_group_id: "group-id", size: { id: "size-m", value_id: "size-m-value", organization_id: "org-1", size: "M", is_active: true, status: "ACTIVE", legacy_metadata: null } },
      ]);

      const [summary] = await getArticleOrderSummaries("org-1", { season: "Winter", article: "Shirt" }, "finishedGoods");

      expect(summary.sizeOrder).toEqual(["XL", "S", "M"]);
      expect(summary.sizes.map(({ size }) => size)).toEqual(["XL", "S", "M"]);
      expect((summary.orders[0] as { finishedGoods: Array<{ size: string }> }).finishedGoods.map(({ size }) => size))
        .toEqual(["XL", "S", "M"]);
    });
  });

  describe("listBomItemsPage", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns tenant-scoped BOM rows with JSON-safe decimal values", async () => {
      prismaCounterMock.bomItemFindMany.mockResolvedValue([
        {
          id: "bom-1",
          order_id: "order-1",
          orderQty: new Prisma.Decimal("120.50"),
          categoryType: "Fabric",
          category: null,
          subCategory: null,
          rawMaterialName: "Cotton",
          stockUom: "Meter",
          size: null,
          consumption: new Prisma.Decimal("1.25"),
          buyerConsumption: null,
          buyerPrice: null,
          internalConsumption: null,
          internalPrice: null,
          valuePerGarmentRm: null,
          requiredQty: null,
          itemWiseExcessPercentage: null,
          itemWiseExcessQty: null,
          totalRequiredQty: null,
          created_at: new Date("2026-10-01T00:00:00.000Z"),
          order: {
            orderNo: "OD-1",
            styleName: "Style 1",
            brand: null,
            buyer: null,
            entity_id: null,
            entityName: null,
          },
        },
      ]);

      const page = await listBomItemsPage("org-1", { limit: 1 });

      expect(prismaCounterMock.bomItemFindMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { order: { organization_id: "org-1" } },
        take: 2,
      }));
      expect(page.bomItems[0]).toMatchObject({
        id: "bom-1",
        orderQty: "120.5",
        consumption: "1.25",
      });
    });
  });

  it("rejects invalid range sizes without touching the counter", async () => {
    await expect(reserveNextOrderNumbers("org-123", 0)).rejects.toThrow("Order number count must be a positive integer.");
    expect(prismaCounterMock.upsert).not.toHaveBeenCalled();
  });
});
