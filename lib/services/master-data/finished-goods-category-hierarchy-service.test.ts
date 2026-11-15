import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction, prismaMock, createMasterValueMock, createAuditEventMock } = vi.hoisted(() => {
  const transaction = {
    masterProduct: { findFirst: vi.fn() },
    masterCategory: { findFirst: vi.fn() },
    masterSubCategory: { findFirst: vi.fn(), updateMany: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn((callback: (database: typeof transaction) => Promise<unknown>) => callback(transaction)),
  };
  return {
    transaction,
    prismaMock,
    createMasterValueMock: vi.fn(),
    createAuditEventMock: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/master-data/master-data-constants", () => ({
  createMasterValueForOrganization: createMasterValueMock,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: createAuditEventMock,
}));

import { createFinishedGoodsCategoryHierarchy } from "./finished-goods-category-hierarchy-service";

const input = {
  organizationId: "org-internal",
  actorUserId: "user-1",
  productType: "Finished Goods",
  category: "Indigo Denim",
  subcategory: "Coord Set",
};

beforeEach(() => {
  vi.clearAllMocks();
  transaction.masterProduct.findFirst.mockResolvedValue({
    id: "type-1",
    product_master_name: "FINISHED GOODS",
    is_active: true,
  });
  transaction.masterCategory.findFirst.mockResolvedValue(null);
  transaction.masterSubCategory.findFirst.mockResolvedValue(null);
  transaction.masterSubCategory.updateMany.mockResolvedValue({ count: 1 });
  createMasterValueMock
    .mockResolvedValueOnce({ id: "category-1", value_id: "category-value-1", is_active: true })
    .mockResolvedValueOnce({ id: "subcategory-1", value_id: "subcategory-value-1", is_active: true });
  createAuditEventMock.mockResolvedValue({});
});

describe("createFinishedGoodsCategoryHierarchy", () => {
  it("creates the category and its subcategory in one tenant-scoped transaction", async () => {
    const result = await createFinishedGoodsCategoryHierarchy(input);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.masterProduct.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ organization_id: "org-internal" }),
    }));
    expect(createMasterValueMock).toHaveBeenNthCalledWith(
      1,
      "org-internal",
      "category",
      expect.objectContaining({
        label: "INDIGO DENIM",
        fields: { Product_Master: "FINISHED GOODS", Category_Name: "INDIGO DENIM" },
        parentValueId: "type-1",
      }),
      transaction,
    );
    expect(createMasterValueMock).toHaveBeenNthCalledWith(
      2,
      "org-internal",
      "sub-category",
      expect.objectContaining({
        label: "COORD SET",
        fields: { category: "INDIGO DENIM", sub_category: "COORD SET" },
        parentValueId: "category-1",
      }),
      transaction,
    );
    expect(result).toEqual({
      category: "INDIGO DENIM",
      subcategory: "COORD SET",
      createdCategory: true,
      createdSubcategory: true,
      relinkedSubcategory: false,
    });
    expect(createAuditEventMock).toHaveBeenCalledTimes(2);
  });

  it("reuses matching active values without mutating existing records", async () => {
    transaction.masterCategory.findFirst.mockResolvedValue({
      id: "category-1",
      value_id: "category-value-1",
      is_active: true,
    });
    transaction.masterSubCategory.findFirst.mockResolvedValue({
      id: "subcategory-1",
      value_id: "subcategory-value-1",
      category_id: "category-1",
      is_active: true,
    });

    const result = await createFinishedGoodsCategoryHierarchy(input);

    expect(createMasterValueMock).not.toHaveBeenCalled();
    expect(createAuditEventMock).not.toHaveBeenCalled();
    expect(result.createdCategory).toBe(false);
    expect(result.createdSubcategory).toBe(false);
    expect(result.relinkedSubcategory).toBe(false);
  });

  it("relinks an existing tenant subcategory instead of violating its organization-wide unique key", async () => {
    transaction.masterSubCategory.findFirst.mockResolvedValue({
      id: "subcategory-1",
      value_id: "subcategory-value-1",
      category_id: "old-category",
      is_active: true,
    });

    const result = await createFinishedGoodsCategoryHierarchy(input);

    expect(transaction.masterSubCategory.updateMany).toHaveBeenCalledWith({
      where: { organization_id: "org-internal", id: "subcategory-1" },
      data: { category_id: "category-1" },
    });
    expect(transaction.masterSubCategory.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: "org-internal",
        sub_category: { equals: "COORD SET", mode: "insensitive" },
      },
      select: { id: true, value_id: true, category_id: true, is_active: true },
    });
    expect(createMasterValueMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      category: "INDIGO DENIM",
      subcategory: "COORD SET",
      createdCategory: true,
      createdSubcategory: false,
      relinkedSubcategory: true,
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "UPDATE",
      entityType: "sub-category",
      entityId: "subcategory-value-1",
      details: expect.objectContaining({
        before: { categoryId: "old-category" },
        after: { categoryId: "category-1", category: "INDIGO DENIM" },
      }),
    }), transaction);
  });

  it("retries once when a concurrent request wins the unique-key race", async () => {
    createMasterValueMock
      .mockReset()
      .mockRejectedValueOnce(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }))
      .mockResolvedValueOnce({ id: "category-1", value_id: "category-value-1", is_active: true })
      .mockResolvedValueOnce({ id: "subcategory-1", value_id: "subcategory-value-1", is_active: true });

    const result = await createFinishedGoodsCategoryHierarchy(input);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
    expect(result.relinkedSubcategory).toBe(false);
  });

  it("infers the Finished Goods Type from the existing category for legacy import errors", async () => {
    transaction.masterCategory.findFirst
      .mockResolvedValueOnce({ product_master_id: "type-1", is_active: true })
      .mockResolvedValueOnce(null);

    await createFinishedGoodsCategoryHierarchy({
      ...input,
      productType: "",
      existingCategory: "Coord Set",
    });

    expect(transaction.masterProduct.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-internal", id: "type-1" },
    }));
    expect(createMasterValueMock).toHaveBeenNthCalledWith(
      1,
      "org-internal",
      "category",
      expect.objectContaining({
        fields: { Product_Master: "FINISHED GOODS", Category_Name: "INDIGO DENIM" },
      }),
      transaction,
    );
  });

  it("rejects inactive parent records and does not create child masters", async () => {
    transaction.masterProduct.findFirst.mockResolvedValue({ id: "type-1", is_active: false });

    await expect(createFinishedGoodsCategoryHierarchy(input))
      .rejects.toThrow('Finished Goods Type "FINISHED GOODS" is unavailable.');

    expect(createMasterValueMock).not.toHaveBeenCalled();
  });
});
