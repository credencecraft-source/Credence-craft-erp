import { beforeEach, describe, expect, it, vi } from "vitest";

const { transaction } = vi.hoisted(() => ({
  transaction: {
    masterArticleSize: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    masterSizeGroup: {
      findFirst: vi.fn().mockResolvedValue({ id: "group-1", legacy_metadata: null }),
    },
    organizationDummyDataBatch: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    masterSizeGroupSize: {
      findMany: vi.fn().mockResolvedValue([
        {
          size_id: "size-small",
          size: {
            id: "size-small",
            value_id: "size-value-small",
            organization_id: "org-1",
            size: "S",
            legacy_metadata: null,
          },
        },
        {
          size_id: "size-medium",
          size: {
            id: "size-medium",
            value_id: "size-value-medium",
            organization_id: "org-1",
            size: "M",
            legacy_metadata: null,
          },
        },
      ]),
    },
  },
}));

import { syncFinishedGoodsSizes } from "./finished-goods-size-service";

beforeEach(() => {
  vi.clearAllMocks();
  transaction.masterSizeGroup.findFirst.mockResolvedValue({ id: "group-1", legacy_metadata: null });
  transaction.organizationDummyDataBatch.findFirst.mockResolvedValue(null);
  transaction.masterSizeGroupSize.findMany.mockResolvedValue([
    {
      size_id: "size-small",
      size: { id: "size-small", value_id: "size-value-small", organization_id: "org-1", size: "S", legacy_metadata: null },
    },
    {
      size_id: "size-medium",
      size: { id: "size-medium", value_id: "size-value-medium", organization_id: "org-1", size: "M", legacy_metadata: null },
    },
  ]);
});

describe("finished goods style sizes", () => {
  it("persists only selected sizes linked to the style size group", async () => {
    await syncFinishedGoodsSizes(transaction as never, "org-1", "style-1", "group-1", ["S", "size-value-medium"]);

    expect(transaction.masterArticleSize.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "org-1", article_id: "style-1" },
    });
    expect(transaction.masterArticleSize.createMany).toHaveBeenCalledWith({
      data: [
        { organization_id: "org-1", article_id: "style-1", size_id: "size-small" },
        { organization_id: "org-1", article_id: "style-1", size_id: "size-medium" },
      ],
    });
  });

  it("rejects sizes that are not in the selected organization size group", async () => {
    await expect(syncFinishedGoodsSizes(transaction as never, "org-1", "style-1", "group-1", ["XL"]))
      .rejects.toThrow("Every selected size must belong to the chosen Size Group in this organization.");

    expect(transaction.masterArticleSize.createMany).not.toHaveBeenCalled();
  });

  it("does not allow sizes without a selected size group", async () => {
    await expect(syncFinishedGoodsSizes(transaction as never, "org-1", "style-1", null, ["S"]))
      .rejects.toThrow("Select a Size Group before choosing sizes.");
  });
});
