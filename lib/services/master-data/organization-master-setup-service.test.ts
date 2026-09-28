import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock } = vi.hoisted(() => {
  const delegate = (name: string) => {
    let sequence = 0;
    return {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `${name}-${++sequence}`,
        is_active: true,
        ...data,
      })),
      findFirst: vi.fn().mockResolvedValue(null),
    };
  };
  const transactionMock = {
    masterBrand: delegate("brand"),
    masterBuyer: delegate("buyer"),
    masterCategory: delegate("category"),
    masterProduct: delegate("product"),
    masterSize: delegate("size"),
    masterSizeGroup: delegate("group"),
    masterSizeGroupSize: delegate("group-size"),
    masterSubCategory: delegate("subcategory"),
  };
  const prismaMock = { $transaction: vi.fn() };
  return { prismaMock, transactionMock };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));

import { createOrganizationMerchandisingStarterMasters } from "./organization-master-setup-service";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  transactionMock.masterProduct.findFirst.mockResolvedValue({ id: "finished-goods-id" });
});

describe("createOrganizationMerchandisingStarterMasters", () => {
  it("creates normal organization masters and their required relationships", async () => {
    const result = await createOrganizationMerchandisingStarterMasters("org-id");

    expect(result.createdCount).toBe(38);
    expect(transactionMock.masterBrand.create.mock.calls.map(([call]) => call.data.brand)).toEqual([
      "Louis Philippe", "Peter England", "Allen Solly", "Andamen", "Benetton",
      "Royal Enfield", "Blackberry", "Snitch", "Polar Bear",
    ]);
    expect(transactionMock.masterBuyer.create.mock.calls.map(([call]) => call.data.buyer_name)).toEqual([
      "Madurai Fashion", "Lifestyle Fashion",
    ]);
    expect(transactionMock.masterSize.create.mock.calls.map(([call]) => call.data.size)).toEqual([
      "S", "M", "L", "XL", "XXL", "32", "34", "36", "38", "40",
    ]);
    expect(transactionMock.masterCategory.create.mock.calls.map(([call]) => call.data.category_name)).toEqual([
      "Shirt", "Pant", "Kurta", "Suits",
    ]);
    expect(transactionMock.masterCategory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ product_master_id: "finished-goods-id", organization_id: "org-id", is_active: true }),
    }));
    expect(transactionMock.masterSizeGroup.create.mock.calls.map(([call]) => call.data.size_group)).toEqual([
      "Shirt S-XXL", "Pant 32-40",
    ]);
    expect(transactionMock.masterSizeGroup.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ brand_id: "brand-1", organization_id: "org-id" }),
    }));
    expect(transactionMock.masterSizeGroupSize.create).toHaveBeenCalledTimes(10);
    expect(transactionMock.masterSubCategory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ category_id: "category-1", sub_category: "Full Sleeve" }),
    }));
  });

  it("reuses active values and existing group links on repeat runs", async () => {
    transactionMock.masterBrand.findFirst.mockResolvedValue({ id: "brand-id", is_active: true });
    transactionMock.masterBuyer.findFirst.mockResolvedValue({ id: "buyer-id", is_active: true });
    transactionMock.masterSize.findFirst.mockResolvedValue({ id: "size-id", is_active: true });
    transactionMock.masterSizeGroup.findFirst.mockResolvedValue({ id: "group-id", is_active: true, brand_id: "brand-id" });
    transactionMock.masterSizeGroupSize.findFirst.mockResolvedValue({ id: "link-id" });
    transactionMock.masterCategory.findFirst.mockResolvedValue({ id: "category-id", is_active: true, product_master_id: "finished-goods-id" });
    transactionMock.masterSubCategory.findFirst.mockResolvedValue({ id: "subcategory-id", is_active: true, category_id: "category-id" });

    const result = await createOrganizationMerchandisingStarterMasters("org-id");

    expect(result.createdCount).toBe(0);
    expect(transactionMock.masterBrand.create).not.toHaveBeenCalled();
    expect(transactionMock.masterSizeGroupSize.create).not.toHaveBeenCalled();
  });

  it("stops before creating records when Finished Goods is missing", async () => {
    transactionMock.masterProduct.findFirst.mockResolvedValue(null);

    await expect(createOrganizationMerchandisingStarterMasters("org-id"))
      .rejects.toThrow("An active Finished Goods product type is required.");

    expect(transactionMock.masterBrand.create).not.toHaveBeenCalled();
    expect(transactionMock.masterBuyer.create).not.toHaveBeenCalled();
  });

  it("rejects an existing size group assigned to another brand", async () => {
    transactionMock.masterBrand.findFirst.mockResolvedValue({ id: "brand-id", is_active: true });
    transactionMock.masterBuyer.findFirst.mockResolvedValue({ id: "buyer-id", is_active: true });
    transactionMock.masterSize.findFirst.mockResolvedValue({ id: "size-id", is_active: true });
    transactionMock.masterSizeGroup.findFirst.mockResolvedValue({ id: "group-id", is_active: true, brand_id: "other-brand-id" });

    await expect(createOrganizationMerchandisingStarterMasters("org-id"))
      .rejects.toThrow('Size group "Shirt S-XXL" already exists with a different parent or brand.');
  });
});