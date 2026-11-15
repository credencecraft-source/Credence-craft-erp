import { describe, expect, it } from "vitest";
import { buildVariantOrderInput, type VariantSourceOrder } from "./order-variant-input";

const sourceOrder: VariantSourceOrder = {
  entityName: "Factory",
  category: "Tops",
  subCategory: "Shirts",
  season: "Winter",
  article: "A-100",
  styleName: "Original style",
  colors: "Blue",
  buyer: "Buyer",
  brand: "Brand",
  sizeGroup: "Alpha",
  haveSizeRatio: true,
  ratioOrderQty: 120,
  deliveryDate: "2026-10-15T00:00:00.000Z",
  finishedGoods: [
    { buyerSize: "M", size: "M", buyerPoPrice: 10, exchangePrice: 9, priceInInr: 800 },
    { buyerSize: "L", size: "L", buyerPoPrice: 11, exchangePrice: 10, priceInInr: 900 },
  ],
  bomItems: [{
    categoryType: "Fabric",
    category: "Woven",
    subCategory: "Cotton",
    rawMaterialName: "Poplin",
    stockUom: "Meter",
    size: "M,L",
    buyerConsumption: 1.2,
    buyerPrice: 4,
    internalConsumption: 1.1,
    internalPrice: 3,
    valuePerGarmentRm: 3.3,
    consumption: 1.1,
    requiredQty: 132,
    itemWiseExcessPercentage: 5,
    itemWiseExcessQty: 6.6,
    totalRequiredQty: 138.6,
  }],
  processTemplateId: "template-id",
  processSteps: [{
    source_template_step_id: "source-process-step-id",
    process_id: "process-id",
    process_name: "Sewing",
    sl_no: 1,
    operations: [{
      id: "operation-id",
      source_operation_template_step_id: "source-operation-id",
      operation: "Join shoulder",
      sl_no: 1,
      price: 2.5,
    }],
  }],
};

describe("variant order input", () => {
  it("copies source order data and replaces only variant fields and quantities", () => {
    const input = buildVariantOrderInput(sourceOrder, {
      styleName: "New style",
      colors: "Red",
      rows: [{ size: "M", qty: "12" }, { size: "L", qty: "8" }],
    }, ["M", "L"]);

    expect(input).toMatchObject({
      entityName: "Factory",
      article: undefined,
      styleName: "New style",
      colors: "Red",
      sizeGroup: "Alpha",
      ratioOrderQty: undefined,
      orderQty: 20,
      finalStatus: "Draft",
      processStatus: "Draft",
      processTemplateId: "template-id",
      rows: [
        { size: "M", beforeExcessQty: 12, buyerPoPrice: "10", excess: 0 },
        { size: "L", beforeExcessQty: 8, buyerPoPrice: "11", excess: 0 },
      ],
      bomRows: [{ rawMaterialName: "Poplin" }],
      processRows: [{ processId: "process-id", processName: "Sewing" }],
    });
    expect(input.bomRows?.[0]).not.toHaveProperty("id");
    expect(input.processRows?.[0].operations?.[0]).toMatchObject({
      sourceOperationId: "source-operation-id",
      price: "2.5",
    });
  });

  it.each([
    { label: "negative quantity", rows: [{ size: "M", qty: "-1" }] },
    { label: "fractional quantity", rows: [{ size: "M", qty: "1.5" }] },
    { label: "exponent quantity", rows: [{ size: "M", qty: "1e3" }] },
    { label: "quantity over database integer range", rows: [{ size: "M", qty: "2147483648" }] },
    { label: "unknown size", rows: [{ size: "XL", qty: "1" }] },
    { label: "zero total quantity", rows: [{ size: "M", qty: "0" }] },
  ])("rejects $label", ({ rows }) => {
    expect(() => buildVariantOrderInput(sourceOrder, {
      styleName: "New style",
      colors: "Red",
      rows,
    }, ["M", "L"])).toThrow();
  });
});