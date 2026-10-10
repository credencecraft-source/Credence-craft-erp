import { beforeEach, describe, expect, it, vi } from "vitest";

const { masterValues, variantFindMany, articleSizeFindMany, createOrdersAtomically } = vi.hoisted(() => ({
  masterValues: {} as Record<string, Array<Record<string, unknown>>>,
  variantFindMany: vi.fn(),
  articleSizeFindMany: vi.fn(),
  createOrdersAtomically: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    masterArticleVariant: { findMany: variantFindMany },
    masterArticleSize: { findMany: articleSizeFindMany },
  },
}));

vi.mock("@/lib/master-data/master-data-constants", () => ({
  getMasterValuesForOrganization: vi.fn(async (_organizationId: string, moduleKey: string) => masterValues[moduleKey] ?? []),
}));

vi.mock("./order-service", () => ({
  createOrdersAtomically,
}));

import { createArticleBasedOrders } from "./article-based-order-service";

const article = {
  id: "article-id",
  value_id: "article-value-id",
  label: "Oxford Shirt",
  fields: {
    Category: "Shirts",
    Subcategory: "Casual",
    Size_Group: "Standard",
    Sizes: ["S", "M"],
    default_price: "12.50",
    variants: [
      { id: "blue-variant", color: "Blue", price_override: null },
      { id: "green-variant", color: "Green", price_override: "14.25" },
    ],
  },
};

function validRequest() {
  return {
    articleId: article.value_id,
    entityId: "entity-value-id",
    buyerId: "buyer-value-id",
    seasonId: "season-value-id",
    deliveryDate: "2026-12-15",
    colors: [
      { variantId: "blue-variant", quantities: [{ size: "S", quantity: 10 }, { size: "M", quantity: 5 }] },
      { variantId: "green-variant", quantities: [{ size: "M", quantity: 7 }] },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  masterValues.article = [article];
  masterValues["size-group"] = [{ id: "size-group-id", value_id: "size-group-value-id", label: "Standard", fields: { Brand1: "Northstar" } }];
  masterValues.entity = [{ id: "entity-id", value_id: "entity-value-id", label: "Main Factory", fields: {} }];
  masterValues.buyer = [{ id: "buyer-id", value_id: "buyer-value-id", label: "Buyer One", fields: {} }];
  masterValues.season = [{ id: "season-id", value_id: "season-value-id", label: "Winter 2026", fields: {} }];
  variantFindMany.mockResolvedValue([
    { id: "blue-variant", color: { colors: "Blue" } },
    { id: "green-variant", color: { colors: "Green" } },
  ]);
  articleSizeFindMany.mockResolvedValue([{ size: { size: "S" } }, { size: { size: "M" } }]);
  createOrdersAtomically.mockResolvedValue([
    { id: "order-1", orderNo: "OD-1" },
    { id: "order-2", orderNo: "OD-2" },
  ]);
});

describe("createArticleBasedOrders", () => {
  it("creates one order per color with its size quantities and master price", async () => {
    await createArticleBasedOrders("org-id", validRequest(), "user-id");

    expect(variantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-id",
        article_id: "article-id",
        is_active: true,
      }),
    }));
    expect(articleSizeFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-id",
        article_id: "article-id",
      }),
    }));
    expect(createOrdersAtomically).toHaveBeenCalledWith("org-id", [
      expect.objectContaining({
        entityName: "Main Factory",
        category: "Shirts",
        subCategory: "Casual",
        article: "Oxford Shirt",
        styleName: "Oxford Shirt",
        colors: "Blue",
        buyer: "Buyer One",
        brand: "Northstar",
        sizeGroup: "Standard",
        rows: [
          { size: "S", buyerSize: "S", beforeExcessQty: 10, buyerPoPrice: "12.50" },
          { size: "M", buyerSize: "M", beforeExcessQty: 5, buyerPoPrice: "12.50" },
        ],
      }),
      expect.objectContaining({
        colors: "Green",
        rows: [{ size: "M", buyerSize: "M", beforeExcessQty: 7, buyerPoPrice: "14.25" }],
      }),
    ], "user-id");
  });

  it("rejects an Article that is not found in the authorized organization", async () => {
    masterValues.article = [];

    await expect(createArticleBasedOrders("org-id", validRequest(), "user-id"))
      .rejects.toThrow("Select an active Article belonging to this organization.");
    expect(createOrdersAtomically).not.toHaveBeenCalled();
  });

  it("rejects colors that do not belong to the selected Article", async () => {
    variantFindMany.mockResolvedValue([{ id: "other-variant", color: { colors: "Red" } }]);
    const request = validRequest();
    request.colors = [{ variantId: "other-variant", quantities: [{ size: "S", quantity: 10 }] }];

    await expect(createArticleBasedOrders("org-id", request, "user-id"))
      .rejects.toThrow("Every selected color must be an active variant of this Article.");
    expect(createOrdersAtomically).not.toHaveBeenCalled();
  });

  it("rejects sizes not selected on the Article", async () => {
    const request = validRequest();
    request.colors = [{ variantId: "blue-variant", quantities: [{ size: "XL", quantity: 10 }] }];
    variantFindMany.mockResolvedValue([{ id: "blue-variant", color: { colors: "Blue" } }]);
    articleSizeFindMany.mockResolvedValue([]);

    await expect(createArticleBasedOrders("org-id", request, "user-id"))
      .rejects.toThrow("Every order size must be active and selected on this Article.");
    expect(createOrdersAtomically).not.toHaveBeenCalled();
  });

  it("requires positive whole-number quantities", async () => {
    const request = validRequest();
    request.colors = [{ variantId: "blue-variant", quantities: [{ size: "S", quantity: 0 }] }];

    await expect(createArticleBasedOrders("org-id", request, "user-id"))
      .rejects.toThrow("Enter a positive whole-number quantity for S.");
    expect(createOrdersAtomically).not.toHaveBeenCalled();
  });
});
