import { describe, expect, it } from "vitest";
import type { OrderFormState } from "./order-form-types";
import { buildOrderSavePayload } from "./order-save-payload";

const form = {
  rows: [],
  bomRows: [],
  costingRows: [],
  techPackRows: [],
  measurementRows: [],
  processRows: [],
  processTemplateId: "template-1",
  attachmentRows: [],
  orderQty: 10,
  sellingPricePerPcs: 0,
  orderNo: "OD-1",
  sourceStatus: "DIRECT",
  article: "ARTICLE-1",
  entityName: "ENTITY-1",
  category: "CATEGORY-1",
  subCategory: "SUB-CATEGORY-1",
  season: "SEASON-1",
  styleName: "STYLE-1",
  colors: "BLUE",
  buyer: "BUYER-1",
  brand: "BRAND-1",
  sizeGroup: "SIZE-GROUP-1",
  haveSizeRatio: false,
  ratioOrderQty: "",
  deliveryDate: "",
  finalStatus: "Draft",
  processStatus: "Draft",
} satisfies OrderFormState;

describe("buildOrderSavePayload", () => {
  it("omits unloaded child sections from edit requests", () => {
    const payload = buildOrderSavePayload(form, "org-1", "order-1", new Set(["bom"]));

    expect(payload).toMatchObject({ id: "order-1", organizationId: "org-1", bomRows: [] });
    expect(payload).not.toHaveProperty("rows");
    expect(payload).not.toHaveProperty("processRows");
    expect(payload).not.toHaveProperty("processTemplateId");
  });

  it("includes all child arrays for create requests, including intentionally empty sections", () => {
    const payload = buildOrderSavePayload(form, "org-1", undefined, new Set());

    expect(payload).toMatchObject({
      organizationId: "org-1",
      rows: [],
      bomRows: [],
      processRows: [],
      processTemplateId: "template-1",
    });
    expect(payload).not.toHaveProperty("id");
  });
});
