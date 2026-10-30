import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaCounterMock = vi.hoisted(() => ({
  upsert: vi.fn(),
  orderFindFirst: vi.fn(),
  orderFindMany: vi.fn(),
  bookingFindMany: vi.fn(),
  factoryGrnFindMany: vi.fn(),
  orderDeleteMany: vi.fn(),
  createAuditEvent: vi.fn(),
  articleFindMany: vi.fn(),
  articleVariantFindMany: vi.fn(),
  bomItemFindMany: vi.fn(),
  sizeGroupFindMany: vi.fn(),
  sizeGroupSizeFindMany: vi.fn(),
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: prismaCounterMock.createAuditEvent,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    organizationOrderCounter: {
      upsert: prismaCounterMock.upsert,
    },
    merchandisingOrder: {
      findFirst: prismaCounterMock.orderFindFirst,
      findMany: prismaCounterMock.orderFindMany,
      deleteMany: prismaCounterMock.orderDeleteMany,
    },
    advanceBooking: { findMany: prismaCounterMock.bookingFindMany },
    factoryGrn: { findMany: prismaCounterMock.factoryGrnFindMany },
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
  },
}));

import {
  deleteOrders,
  getArticleOrderSummaries,
  getOrderCoreById,
  getOrderDetailSection,
  getOrderById,
  listBomItemsPage,
  listOrdersPage,
  reserveNextOrderNumber,
  reserveNextOrderNumbers,
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
          finishedGoods: expect.any(Object),
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

describe("deleteOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaCounterMock.bookingFindMany.mockResolvedValue([]);
    prismaCounterMock.factoryGrnFindMany.mockResolvedValue([]);
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
    expect(prismaCounterMock.factoryGrnFindMany).not.toHaveBeenCalled();
    expect(prismaCounterMock.orderDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes tenant-scoped orders only when no booking or GRN dependency exists", async () => {
    await expect(deleteOrders(["order-1"], "org-1", "user-1"))
      .resolves.toEqual({ deletedCount: 1 });

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

    it("adds organization-scoped article codes to order rows", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([
        {
          id: "order-1",
          article: "Jacket",
          created_at: new Date("2026-10-01T00:00:00.000Z"),
          deliveryDate: null,
        },
      ]);
      prismaCounterMock.articleFindMany.mockResolvedValue([
        { id: "article-id", article: "Jacket", article_code: "Ar-1" },
      ]);
      prismaCounterMock.articleVariantFindMany.mockResolvedValue([]);

      const page = await listOrdersPage("org-1");

      expect(prismaCounterMock.articleFindMany).toHaveBeenCalledWith({
        where: { organization_id: "org-1", article: { in: ["Jacket"] } },
        select: { id: true, article: true, article_code: true },
      });
      expect(page.orders[0]).toMatchObject({ article: "Jacket", articleCode: "Ar-1" });
    });

    it("adds the tenant-scoped color variant code to the separate order report fields", async () => {
      prismaCounterMock.orderFindMany.mockResolvedValue([
        {
          id: "order-1",
          article: "Jacket",
          colors: "Navy",
          created_at: new Date("2026-10-01T00:00:00.000Z"),
          deliveryDate: null,
        },
      ]);
      prismaCounterMock.articleFindMany.mockResolvedValue([
        { id: "article-id", article: "Jacket", article_code: "AR4" },
      ]);
      prismaCounterMock.articleVariantFindMany.mockResolvedValue([
        { article_id: "article-id", variant_code: "AR4-02", color: { organization_id: "org-1", colors: "Navy" } },
      ]);

      const page = await listOrdersPage("org-1");

      expect(prismaCounterMock.articleVariantFindMany).toHaveBeenCalledWith({
        where: {
          organization_id: "org-1",
          article_id: { in: ["article-id"] },
          color: { organization_id: "org-1" },
        },
        select: {
          article_id: true,
          variant_code: true,
          color: { select: { organization_id: true, colors: true } },
        },
      });
      expect(page.orders[0]).toMatchObject({
        article: "Jacket",
        articleCode: "AR4",
        variantCode: "AR4-02",
      });
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
