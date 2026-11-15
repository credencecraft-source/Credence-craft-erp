import { describe, expect, it, vi } from "vitest";

import {
  buildPosStockSkuCode,
  reserveNextPosBarcode,
} from "./pos-stock-identifiers";

describe("POS stock identifiers", () => {
  it("builds a normalized SKU from style, colour, and size", () => {
    expect(buildPosStockSkuCode("Classic Tee", "Navy Blue", "M")).toBe(
      "CLASSIC-TEE-NAVY-BLUE-M",
    );
  });

  it("requires all SKU parts and respects the database length limit", () => {
    expect(buildPosStockSkuCode("Classic Tee", "", "M")).toBeNull();
    expect(buildPosStockSkuCode("S".repeat(45), "NAVY", "M")).toBeNull();
  });

  it("reserves the next organization-scoped POS barcode atomically", async () => {
    const upsert = vi.fn().mockResolvedValue({ current_value: 7 });
    const findFirst = vi.fn().mockResolvedValue(null);
    const database = {
      procurementDocumentCounter: { upsert },
      finishedGoodsSkuStock: { findFirst },
    };

    await expect(reserveNextPosBarcode(database, "organization-1")).resolves.toBe("POS7");
    expect(upsert).toHaveBeenCalledWith({
      where: {
        organization_id_document_type: {
          organization_id: "organization-1",
          document_type: "POS_BARCODE",
        },
      },
      create: {
        organization_id: "organization-1",
        document_type: "POS_BARCODE",
        current_value: 1,
      },
      update: { current_value: { increment: 1 } },
      select: { current_value: true },
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { organization_id: "organization-1", barcode: "POS7" },
      select: { id: true },
    });
  });

  it("skips a previously assigned barcode", async () => {
    const upsert = vi.fn()
      .mockResolvedValueOnce({ current_value: 2 })
      .mockResolvedValueOnce({ current_value: 3 });
    const findFirst = vi.fn()
      .mockResolvedValueOnce({ id: "existing" })
      .mockResolvedValueOnce(null);
    const database = {
      procurementDocumentCounter: { upsert },
      finishedGoodsSkuStock: { findFirst },
    };

    await expect(reserveNextPosBarcode(database, "organization-1")).resolves.toBe("POS3");
    expect(upsert).toHaveBeenCalledTimes(2);
  });
});
