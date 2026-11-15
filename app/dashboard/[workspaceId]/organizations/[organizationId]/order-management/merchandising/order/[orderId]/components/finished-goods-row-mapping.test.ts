import { describe, expect, it } from "vitest";
import {
  buildFinishedGoodsRowsFromSizes,
  normalizeFinishedGoodsOrderRow,
} from "./finished-goods-row-mapping";

describe("normalizeFinishedGoodsOrderRow", () => {
  it("maps persisted snake-case SKU values to the form field without changing identifiers", () => {
    expect(normalizeFinishedGoodsOrderRow({
      sku_code: "FGSKU-000007",
      barcode: "FGBC-00000011",
      size: "M",
    })).toMatchObject({
      skuCode: "FGSKU-000007",
      barcode: "FGBC-00000011",
      size: "M",
    });
  });

  it("preserves already-normalized identifiers and safely handles missing values", () => {
    expect(normalizeFinishedGoodsOrderRow({ skuCode: "FGSKU-000008", barcode: null })).toMatchObject({
      skuCode: "FGSKU-000008",
      barcode: "",
    });
    expect(normalizeFinishedGoodsOrderRow({})).toMatchObject({
      skuCode: "",
      barcode: "",
    });
  });

  describe("buildFinishedGoodsRowsFromSizes", () => {
    it("preserves saved rows when the size-group lookup has no sizes yet", () => {
      const existingRows = [{
        size: "M",
        skuCode: "FGSKU-000007",
        barcode: "FGBC-00000011",
        beforeExcessQty: 10,
        totalQty: 10,
      }];

      expect(buildFinishedGoodsRowsFromSizes(existingRows, [])).toBeNull();
      expect(existingRows[0]).toMatchObject({
        size: "M",
        skuCode: "FGSKU-000007",
        barcode: "FGBC-00000011",
        totalQty: 10,
      });
    });

    it("keeps saved row identifiers while creating rows for a loaded size group", () => {
      const rows = buildFinishedGoodsRowsFromSizes(
        [{ size: "M", skuCode: "FGSKU-000007", barcode: "FGBC-00000011", beforeExcessQty: 10 }],
        [{ label: "M" }, { label: "L" }],
      );

      expect(rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ size: "M", skuCode: "FGSKU-000007", barcode: "FGBC-00000011" }),
        expect.objectContaining({ size: "L", skuCode: "", barcode: "" }),
      ]));
    });
  });
});
