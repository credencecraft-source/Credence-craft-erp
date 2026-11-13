import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction } = vi.hoisted(() => ({
  transaction: {
    masterArticle: {
      findFirst: vi.fn().mockResolvedValue({ article: "Oxford Shirt", article_code: "AR1" }),
    },
    masterArticleVariant: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: "variant-created", ...data })),
      update: vi.fn().mockImplementation(async ({ where, data }) => ({ id: where.id, ...data })),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    masterColor: {
      findFirst: vi.fn().mockResolvedValue({ id: "color-blue", colors: "Blue", legacy_metadata: null }),
    },
    organizationDummyDataBatch: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

import { syncFinishedGoodsVariants } from "./finished-goods-variant-service";

beforeEach(() => {
  vi.clearAllMocks();
  transaction.masterArticle.findFirst.mockResolvedValue({ article: "Oxford Shirt", article_code: "AR1" });
  transaction.masterArticleVariant.findMany.mockResolvedValue([]);
  transaction.masterArticleVariant.create.mockImplementation(async ({ data }) => ({ id: "variant-created", ...data }));
  transaction.masterArticleVariant.update.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
  transaction.masterColor.findFirst.mockResolvedValue({ id: "color-blue", colors: "Blue", legacy_metadata: null });
  transaction.organizationDummyDataBatch.findFirst.mockResolvedValue(null);
});

describe("finished goods color variants", () => {
  it("creates an organization-scoped color variant and preserves decimal price precision", async () => {
    await syncFinishedGoodsVariants(transaction as never, "org-1", "style-1", [{
      fields: {
        color: "Blue",
        sku: "APPLE-BLUE",
        price_override: "125.1234",
      },
    }]);

    expect(transaction.masterColor.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "org-1" }),
    }));
    const createCall = transaction.masterArticleVariant.create.mock.calls[0][0];
    expect(createCall.data).toMatchObject({
      organization_id: "org-1",
      article_id: "style-1",
      color_id: "color-blue",
      variant: "Blue",
      variant_code: "OXFORD-SHIRT-BLUE",
      sku: "APPLE-BLUE",
    });
    expect(createCall.data.price_override.toString()).toBe("125.1234");
  });

  it("generates codes from the style name and normalized color name", async () => {
    transaction.masterColor.findFirst
      .mockResolvedValueOnce({ id: "color-blue", colors: "Navy Blue", legacy_metadata: null })
      .mockResolvedValueOnce({ id: "color-red", colors: "Red/White", legacy_metadata: null });

    await syncFinishedGoodsVariants(transaction as never, "org-1", "style-1", [
      { fields: { color: "Navy Blue" } },
      { fields: { color: "Red" } },
    ]);

    expect(transaction.masterArticleVariant.create.mock.calls.map(([call]) => call.data.variant_code))
      .toEqual(["OXFORD-SHIRT-NAVY-BLUE", "OXFORD-SHIRT-RED-WHITE"]);
  });

  it("rejects colors that do not belong to the current organization", async () => {
    transaction.masterColor.findFirst.mockResolvedValue(null);

    await expect(syncFinishedGoodsVariants(transaction as never, "org-1", "style-1", [{
      fields: { color: "foreign-color" },
    }])).rejects.toThrow("Every variant color must belong to this organization.");

    expect(transaction.masterArticleVariant.create).not.toHaveBeenCalled();
  });

  it("rejects invalid prices before writing variant data", async () => {
    await expect(syncFinishedGoodsVariants(transaction as never, "org-1", "style-1", [{
      fields: { color: "Blue", price_override: "-10" },
    }])).rejects.toThrow("Variant price must be a non-negative amount with up to four decimal places.");

    expect(transaction.masterArticleVariant.create).not.toHaveBeenCalled();
  });

  it("rejects generated codes that exceed the variant-code column limit", async () => {
    transaction.masterArticle.findFirst.mockResolvedValue({ article: "A".repeat(96), article_code: "AR1" });

    await expect(syncFinishedGoodsVariants(transaction as never, "org-1", "style-1", [{
      fields: { color: "Blue" },
    }])).rejects.toThrow("Style name and color must produce a variant code no longer than 100 characters.");

    expect(transaction.masterArticleVariant.create).not.toHaveBeenCalled();
  });

  it("updates only variants owned by the style and removes omitted variants atomically", async () => {
    transaction.masterArticleVariant.findMany.mockResolvedValue([
      { id: "variant-existing", article_id: "style-1", color_id: "color-blue", variant_code: "AR1-01" },
      { id: "variant-removed", article_id: "style-1", color_id: "color-green", variant_code: "AR1-02" },
    ]);

    await syncFinishedGoodsVariants(transaction as never, "org-1", "style-1", [{
      id: "variant-existing",
      fields: { color: "Blue", sku: "APPLE-BLUE-V2" },
    }]);

    expect(transaction.masterArticleVariant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "variant-existing" },
      data: expect.objectContaining({ sku: "APPLE-BLUE-V2" }),
    }));
    expect(transaction.masterArticleVariant.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", article_id: "style-1", id: { notIn: ["variant-existing"] } },
    });
  });
});
