import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const prismaCounterMock = vi.hoisted(() => ({
  upsert: vi.fn(),
  orderFindMany: vi.fn(),
  articleFindMany: vi.fn(),
  bomItemFindMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    organizationOrderCounter: {
      upsert: prismaCounterMock.upsert,
    },
    merchandisingOrder: {
      findMany: prismaCounterMock.orderFindMany,
    },
    masterArticle: {
      findMany: prismaCounterMock.articleFindMany,
    },
    billOfMaterialItem: {
      findMany: prismaCounterMock.bomItemFindMany,
    },
  },
}));

import {
  getArticleOrderSummaries,
  listBomItemsPage,
  listOrdersPage,
  reserveNextOrderNumber,
  reserveNextOrderNumbers,
} from "./order-service";

describe("reserveNextOrderNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        { article: "Jacket", article_code: "Ar-1" },
      ]);

      const page = await listOrdersPage("org-1");

      expect(prismaCounterMock.articleFindMany).toHaveBeenCalledWith({
        where: { organization_id: "org-1", article: { in: ["Jacket"] } },
        select: { article: true, article_code: true },
      });
      expect(page.orders[0]).toMatchObject({ article: "Jacket", articleCode: "Ar-1" });
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
      }));
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
