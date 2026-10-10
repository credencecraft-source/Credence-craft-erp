import { describe, expect, it } from "vitest";

import { MASTER_DEFINITIONS } from "@/lib/master-data/master-data-registry";

import { getMasterDataCategory, getMastersForCategory, MASTER_DATA_CATEGORIES } from "./master-data-categories";

const visibleMasters = MASTER_DEFINITIONS.filter((master) => !master.hidden);

describe("master data categories", () => {
  it("orders raw material type, category, and subcategory first", () => {
    const category = getMasterDataCategory("RAWMATERIL");

    expect(category).toBeDefined();
    expect(getMastersForCategory(visibleMasters, category!).slice(0, 3).map((master) => master.key)).toEqual([
      "raw-material-type",
      "raw-material-category",
      "raw-material-sub-category",
    ]);
  });

  it("includes Size Wise Consumption under Others", () => {
    const others = MASTER_DATA_CATEGORIES.find((category) => category.id === "other");

    expect(others).toBeDefined();
    expect(getMastersForCategory(visibleMasters, others!).map((master) => master.key)).toContain("size-wise-consumption");
  });

  it("includes Article under Finished Goods", () => {
    const finishedGoods = MASTER_DATA_CATEGORIES.find((category) => category.id === "finished-goods");

    expect(finishedGoods).toBeDefined();
    expect(getMastersForCategory(visibleMasters, finishedGoods!).map((master) => master.key)).toEqual([
      "product-master",
      "category",
      "sub-category",
      "article",
    ]);
  });

  it("groups processes and operations under their own category", () => {
    const category = getMasterDataCategory("PROCESS%20AND%20OPERATIONS");

    expect(category?.id).toBe("process-and-operations");
    expect(getMastersForCategory(visibleMasters, category!).map((master) => master.key)).toEqual([
      "process-master",
      "operation",
      "process-template",
      "operation-template",
    ]);
    expect(getMastersForCategory(visibleMasters, MASTER_DATA_CATEGORIES.find((entry) => entry.id === "other")!).map((master) => master.key))
      .not.toContain("process-master");
  });

  it("groups size, size group, and measurement chart together", () => {
    const category = getMasterDataCategory("SIZE%20AND%20SIZE%20GROUP");

    expect(category?.id).toBe("sizes");
    expect(getMastersForCategory(visibleMasters, category!).map((master) => master.key)).toEqual([
      "size",
      "size-group",
      "measurement-chart",
    ]);
  });

  it("groups vendors, contacts, and tax masters separately", () => {
    const vendorGroup = MASTER_DATA_CATEGORIES.find((entry) => entry.id === "vendors-and-contacts");
    const taxGroup = MASTER_DATA_CATEGORIES.find((entry) => entry.id === "tax-and-gst");
    const vendors = getMastersForCategory(visibleMasters, vendorGroup!);
    const taxMasters = getMastersForCategory(visibleMasters, taxGroup!);

    expect(vendors.map((master) => master.key).sort()).toEqual(["buyer", "merchandiser", "vendor"]);
    const vendor = vendors.find((master) => master.key === "vendor");
    expect(vendor?.fields.map((field) => field.key)).toContain("Contact_Person");
    expect(vendor?.fields.map((field) => field.key)).toContain("Contact_Phone");
    expect(vendor?.fields.map((field) => field.key)).toContain("Contact_Email");
    expect(taxMasters.map((master) => master.key).sort()).toEqual(["gst", "gst-type", "hsn", "state"]);
  });

  it("groups warehouses and warehouse types together", () => {
    const category = getMasterDataCategory("WAREHOUSE");

    expect(category?.id).toBe("warehouses");
    expect(getMastersForCategory(visibleMasters, category!).map((master) => master.key)).toEqual([
      "warehouse",
      "warehouse-type",
    ]);
  });

  it("labels the product master and its entry field as Finished Goods Type", () => {
    const productType = MASTER_DEFINITIONS.find((master) => master.key === "product-master");

    expect(productType?.label).toBe("Finished Goods Type");
    expect(productType?.fields[0]?.label).toBe("Finished Goods Type");
  });

  it("defines Article as a parent style with shared sizes and color variants", () => {
    const article = MASTER_DEFINITIONS.find((master) => master.key === "article");
    const variantField = article?.fields.find((field) => field.key === "variants");

    expect(article?.fields.map((field) => field.key)).toEqual(expect.arrayContaining([
      "Product_Master",
      "Category",
      "Subcategory",
      "default_price",
      "Size_Group",
      "Sizes",
      "variants",
    ]));
    expect(article?.fields.find((field) => field.key === "Sizes")).toMatchObject({
      type: "lookup",
      lookupModuleKey: "article-size",
      multiple: true,
      dependsOn: "Size_Group",
    });
    expect(variantField).toMatchObject({
      type: "child-list",
      childModuleKey: "article-variant",
      childFields: expect.arrayContaining([
        expect.objectContaining({ key: "color" }),
        expect.objectContaining({ key: "sku" }),
        expect.objectContaining({ key: "price_override" }),
      ]),
    });
  });
});
