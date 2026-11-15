import { describe, expect, it } from "vitest";

import { buildFinishedGoodsStockOverview } from "./finished-goods-stock-overview";

describe("buildFinishedGoodsStockOverview", () => {
  it("counts each current-stock ledger row once and categorizes source and stock type", () => {
    const overview = buildFinishedGoodsStockOverview([
      {
        id: "general-1",
        source: "WO_ORDER_GRN",
        inventory_bucket: "GENERAL",
        current_stock: "8",
        qty_in: 10,
        qty_out: 2,
      },
      {
        id: "allocated-1",
        source: "PACKING_LIST_GRN",
        inventory_bucket: "ALLOCATED",
        current_stock: 3,
      },
      {
        id: "pos-1",
        source: "POS_PURCHASE_BILL",
        current_stock: 5,
      },
    ]);

    expect(overview).toMatchObject({
      total: 16,
      general: 13,
      allocated: 3,
      inventory: 11,
      pos: 5,
    });
    expect(overview.rows.map(({ source_label, stock_type }) => [source_label, stock_type])).toEqual([
      ["Work Order GRN", "GENERAL"],
      ["Packing List GRN", "ALLOCATED"],
      ["POS Purchase Bill", "GENERAL"],
    ]);
    expect(overview.rows.map(({ main_source, sub_source }) => [main_source, sub_source])).toEqual([
      ["Inventory Module", "WO Order GRN"],
      ["Inventory Module", "Packing List GRN"],
      ["POS Module", "POS Bill"],
    ]);
  });

  it("uses only the two main-source labels and marks direct-entry sub-sources as unavailable", () => {
    const overview = buildFinishedGoodsStockOverview([
      { id: "inventory-direct", source: "DIRECT_FROM_INVENTORY", current_stock: 2 },
      { id: "pos-direct", source: "DIRECT_FROM_POS", current_stock: 3 },
    ]);

    expect(overview.rows.map(({ main_source, sub_source }) => [main_source, sub_source])).toEqual([
      ["Inventory Module", "—"],
      ["POS Module", "POS Bill"],
    ]);
  });

  it("rejects malformed stock quantities", () => {
    expect(() => buildFinishedGoodsStockOverview([
      { id: "bad", source: "DIRECT", current_stock: "unknown" },
    ])).toThrow("Finished-goods stock returned an invalid current stock quantity.");
  });
});
