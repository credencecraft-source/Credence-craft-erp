import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, models } = vi.hoisted(() => {
  const delegate = () => ({
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: "created-id" }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    createManyAndReturn: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({ id: "deleted-id" }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: "updated-id" }),
    upsert: vi.fn().mockResolvedValue({ id: "upserted-id" }),
  });
  const modelNames = [
    "masterArticle", "masterBrand", "masterBuyer", "masterCategory", "masterCategoryType", "masterColor",
    "masterCurrencyType", "masterEntity", "masterGoldSeal", "masterGoldSealVariant", "masterGst", "masterGstType",
    "masterHsn", "masterLocation", "masterMeasurementChart", "masterMerchandiser", "masterOperation",
    "masterOperationTemplate", "masterOperationTemplateStep", "masterOrderVolume", "masterPreOrderChecklist",
    "masterProcess", "masterProcessTemplate", "masterProcessTemplateStep", "masterProduct", "masterRawMaterial",
    "masterRawMaterialCategory", "masterRawMaterialSubCategory", "masterRawMaterialType", "masterSeason",
    "masterSize", "masterSizeGroup", "masterSizeGroupSize", "masterState", "masterStatus", "masterStockUomConvert",
    "masterSubCategory", "masterUom", "masterVendor", "masterSizeWiseConsumption",
    "merchandisingOrder",
  ];
  const models = Object.fromEntries(modelNames.map((name) => [name, delegate()])) as Record<string, ReturnType<typeof delegate>>;
  const organizationDummyDataBatch = delegate();
  const prismaMock = new Proxy({
    organizationDummyDataBatch,
    $transaction: vi.fn(),
  } as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      return models[key] ?? (models[key] = delegate());
    },
  });
  return { prismaMock, models };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));

import {
  assertNoDummyMasterReferences,
  createMasterValueForOrganization,
  deleteMasterValue,
  getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization,
  updateMasterValue,
} from "./master-data-constants";

beforeEach(() => {
  vi.clearAllMocks();
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    (callback: (transaction: Record<string, unknown>) => Promise<unknown>) => callback(prismaMock as Record<string, unknown>),
  );
});

describe("create-only master insertion", () => {
  it("does not overwrite an organization master value that appeared after upload validation", async () => {
    models.masterColor.findFirst.mockResolvedValueOnce({ id: "existing-color", colors: "Navy" } as never);

    await expect(createMasterValueForOrganization("org-id", "color", {
      label: "Navy",
      fields: { Colors: "Navy" },
      createOnly: true,
    })).rejects.toThrow('Color "Navy" already exists.');

    expect(models.masterColor.update).not.toHaveBeenCalled();
    expect(models.masterColor.create).not.toHaveBeenCalled();
  });
});

describe("raw material creation", () => {
  it("maps lookup IDs to Prisma relation columns", async () => {
    const lookups = [
      [models.masterRawMaterialCategory, "raw-category-id"],
      [models.masterRawMaterialSubCategory, "raw-subcategory-id"],
      [models.masterUom, "uom-id"],
      [models.masterRawMaterialType, "raw-type-id"],
      [models.masterSizeWiseConsumption, "consumption-id"],
      [models.masterBrand, "brand-id"],
      [models.masterColor, "colour-id"],
    ] as const;

    for (const [lookup, id] of lookups) {
      lookup.findFirst.mockResolvedValue({ id, legacy_metadata: null });
    }

    await createMasterValueForOrganization("org-id", "raw-material", {
      label: "JASSIMTKTEST",
      fields: {
        Raw_Material_Name: "JASSIMTKTEST",
        Category: "raw-category-id",
        Subcategory: "raw-subcategory-id",
        Stock_Uom1: "uom-id",
        Category_Type: "raw-type-id",
        Size_Wise_Concemption: true,
        Size_Wise_Consemption_Master: "consumption-id",
        Brand1: "brand-id",
        Colour: "colour-id",
      },
    });

    describe("article creation", () => {
      it("assigns the next organization article code in the requested format", async () => {
        models.masterArticle.findMany.mockResolvedValue([
          { article_code: "AR-1" },
          { article_code: "AR-6" },
          { article_code: "AR-DEMO-17" },
        ] as never);

        await createMasterValueForOrganization("org-id", "article", {
          label: "Winter Jacket",
        });

        expect(models.masterArticle.findMany).toHaveBeenCalledWith(expect.objectContaining({
          where: { organization_id: "org-id" },
          select: { article_code: true },
        }));
        expect(models.masterArticle.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            organization_id: "org-id",
            article: "Winter Jacket",
            article_code: "Ar-7",
          }),
        });
      });
    });

    expect(models.masterRawMaterial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-id",
        raw_material_name: "JASSIMTKTEST",
        raw_material_category_id: "raw-category-id",
        raw_material_sub_category_id: "raw-subcategory-id",
        stock_uom_id: "uom-id",
        raw_material_type_id: "raw-type-id",
        size_wise_consumption: true,
        size_wise_consumption_id: "consumption-id",
        brand_id: "brand-id",
        colour_id: "colour-id",
      }),
    });
    const createData = models.masterRawMaterial.create.mock.calls[0][0].data;
    expect(createData).not.toHaveProperty("brand");
    expect(createData).not.toHaveProperty("colour");
  });
});

describe("process template legacy metadata compatibility", () => {
  it("saves first and last process selections in existing JSON metadata, not new Prisma columns", async () => {
    models.masterProcess.findFirst
      .mockResolvedValueOnce({ id: "cutting-process-id" } as never)
      .mockResolvedValueOnce({ id: "iron-process-id" } as never);

    await createMasterValueForOrganization("org-id", "process-template", {
      label: "No Embroidery Only Wash",
      fields: {
        First_Process: "cutting-process-id",
        Last_Process: "iron-process-id",
      },
    });

    expect(models.masterProcessTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-id",
        process_name: "No Embroidery Only Wash",
        legacy_metadata: {
          first_process_id: "cutting-process-id",
          last_process_id: "iron-process-id",
        },
      }),
    });
    const createData = models.masterProcessTemplate.create.mock.calls[0][0].data;
    expect(createData).not.toHaveProperty("first_process_id");
    expect(createData).not.toHaveProperty("last_process_id");
  });

  it("hydrates first and last process selections from legacy metadata", async () => {
    models.masterProcessTemplate.findMany.mockResolvedValue([{
      id: "template-id",
      value_id: "template-value-id",
      organization_id: "org-id",
      process_name: "No Embroidery Only Wash",
      is_active: true,
      sort_order: 0,
      legacy_metadata: {
        first_process_id: "cutting-process-id",
        last_process_id: "iron-process-id",
      },
    }] as never);
    models.masterProcess.findMany.mockResolvedValue([
      { id: "cutting-process-id", process_name: "Cutting" },
      { id: "iron-process-id", process_name: "Iron" },
    ] as never);

    const values = await getMasterValuesForOrganization("org-id", "process-template");

    expect(values[0].fields).toMatchObject({
      First_Process: "Cutting",
      Last_Process: "Iron",
    });
  });

});

describe("dummy master isolation", () => {
  it("hides batch-tagged values while keeping baseline values selectable", async () => {
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ id: "demo-batch-id" });
    models.masterCategory.findMany.mockResolvedValue([
      {
        id: "baseline-category-id",
        value_id: "baseline-category-value-id",
        organization_id: "org-id",
        category_name: "Real Category",
        product_master_id: null,
        is_active: true,
        sort_order: 0,
        legacy_metadata: null,
      },
      {
        id: "demo-category-id",
        value_id: "demo-category-value-id",
        organization_id: "org-id",
        category_name: "Demo - Apparel",
        product_master_id: null,
        is_active: true,
        sort_order: 1,
        legacy_metadata: { dummyDataBatchId: "demo-batch-id" },
      },
    ]);

    const result = await getMasterValuesForOrganization("org-id", "category");

    expect(result.map((item) => item.label)).toEqual(["Real Category"]);
  });

  it("shows batch-tagged values in the master management list when requested", async () => {
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ id: "demo-batch-id" });
    models.masterCategory.findMany.mockResolvedValue([
      {
        id: "baseline-category-id",
        value_id: "baseline-category-value-id",
        organization_id: "org-id",
        category_name: "Real Category",
        product_master_id: null,
        is_active: true,
        sort_order: 0,
        legacy_metadata: null,
      },
      {
        id: "demo-category-id",
        value_id: "demo-category-value-id",
        organization_id: "org-id",
        category_name: "Demo - Apparel",
        product_master_id: null,
        is_active: true,
        sort_order: 1,
        legacy_metadata: { dummyDataBatchId: "demo-batch-id" },
      },
    ]);

    const result = await getMasterValuesForOrganization("org-id", "category", true, { includeDummyData: true });

    expect(result.map((item) => item.label)).toEqual(["Real Category", "Demo - Apparel"]);
    expect(result.find((item) => item.label === "Demo - Apparel")?.is_dummy).toBe(true);
    expect(result.find((item) => item.label === "Real Category")?.is_dummy).toBe(false);
  });

  it("keeps dummy sizes hidden from transaction lookups but shows them in size-group management", async () => {
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ id: "demo-batch-id" });
    models.masterSizeGroup.findMany.mockResolvedValue([
      { id: "demo-group-id", legacy_metadata: { dummyDataBatchId: "demo-batch-id" } },
    ]);
    models.masterSizeGroupSize.findMany.mockResolvedValue([{
      organization_id: "org-id",
      size_group_id: "demo-group-id",
      size_id: "demo-size-id",
      size: {
        id: "demo-size-id",
        value_id: "demo-size-value-id",
        organization_id: "org-id",
        size: "S",
        is_active: true,
        status: null,
        legacy_metadata: { dummyDataBatchId: "demo-batch-id" },
      },
    }]);

    await expect(getSizeGroupSizesForOrganization("org-id"))
      .resolves.toEqual([]);
    await expect(getSizeGroupSizesForOrganization("org-id", undefined, true))
      .resolves.toEqual([{
        groupId: "demo-group-id",
        size: {
          id: "demo-size-id",
          value_id: "demo-size-value-id",
          label: "S",
          is_active: true,
          parent_id: "demo-group-id",
          fields: { Size: "S", status: null },
        },
      }]);
  });

  it("rejects a forged reference to a demo master during normal master creation", async () => {
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ id: "demo-batch-id" });
    models.masterProduct.findFirst.mockResolvedValue({
      id: "demo-product-id",
      legacy_metadata: { dummyDataBatchId: "demo-batch-id" },
    });

    await expect(createMasterValueForOrganization("org-id", "category", {
      label: "Real Category",
      fields: { Product_Master: "demo-product-id" },
    })).rejects.toThrow("Dummy master values cannot be used by regular organization records.");

    expect(models.masterCategory.create).not.toHaveBeenCalled();
  });

  it("rejects demo masters from regular orders by their tracked IDs", async () => {
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
      master_record_ids: [{ moduleKey: "category", id: "demo-category-id" }],
    });
    models.masterCategory.findMany.mockResolvedValue([{
      id: "demo-category-id",
      category_name: "Demo - Apparel",
    }]);

    await expect(assertNoDummyMasterReferences("org-id", { category: "Demo - Apparel" }))
      .rejects.toThrow("Dummy master values cannot be used by regular organization orders.");
  });

  it("allows organization-owned master values in regular orders", async () => {
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
      master_record_ids: [{ moduleKey: "category", id: "demo-category-id" }],
    });
    models.masterCategory.findMany.mockResolvedValue([{
      id: "demo-category-id",
      category_name: "Demo - Apparel",
    }]);

    await expect(assertNoDummyMasterReferences("org-id", { category: "Real Apparel" }))
      .resolves.toBeUndefined();
  });

  it("prevents individually editing or deleting tracked demo masters", async () => {
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ id: "demo-batch-id" });
    models.masterCategory.findFirst.mockResolvedValue({
      id: "demo-category-id",
      value_id: "demo-category-value-id",
      organization_id: "org-id",
      category_name: "Demo - Apparel",
      legacy_metadata: { dummyDataBatchId: "demo-batch-id" },
    });

    await expect(updateMasterValue("org-id", "demo-category-id", { label: "Changed" }))
      .rejects.toThrow("Demo master values are managed by the Dummy Data batch");
    await expect(deleteMasterValue("org-id", "demo-category-id"))
      .resolves.toMatchObject({ record: null, error: "Demo master values can only be removed by deleting the complete Dummy Data batch." });

    expect(models.masterCategory.update).not.toHaveBeenCalled();
    expect(models.masterCategory.delete).not.toHaveBeenCalled();
  });
});

describe("article order metrics", () => {
  it("loads order quantity and variant count with one organization-scoped aggregate", async () => {
    models.masterArticle.findMany.mockResolvedValue([{
      id: "article-id",
      value_id: "article-value-id",
      organization_id: "org-id",
      article: "Winter Jacket",
      article_code: "AR-1",
      design_by: null,
      designed_date: null,
      is_active: true,
      sort_order: 0,
    }] as never);
    models.merchandisingOrder.groupBy.mockResolvedValue([{
      article: "Winter Jacket",
      _sum: { orderQty: 150 },
      _count: { _all: 2 },
    }] as never);

    const values = await getMasterValuesForOrganization("org-id", "article", true, { includeDummyData: true });

    expect(values[0].fields).toMatchObject({
      running_order_qty: 150,
      running_order_variants: 2,
    });
    expect(models.merchandisingOrder.groupBy).toHaveBeenCalledWith({
      by: ["article"],
      where: { organization_id: "org-id", article: { in: ["Winter Jacket"] } },
      _sum: { orderQty: true },
      _count: { _all: true },
    });
    expect(models.merchandisingOrder.findMany).not.toHaveBeenCalled();
  });

});

describe("master image data projection", () => {
  it("can omit image fields from master editor and lookup payloads", async () => {
    models.masterRawMaterial.findMany.mockResolvedValue([{
      id: "raw-material-id",
      value_id: "raw-material-value-id",
      organization_id: "org-id",
      raw_material_name: "Cotton",
      image_url: "data:image/png;base64,large-image-data",
      is_active: true,
      sort_order: 0,
    }] as never);

    const values = await getMasterValuesForOrganization("org-id", "raw-material", true, {
      includeDummyData: true,
      includeImageData: false,
    });

    expect(values[0].fields).not.toHaveProperty("Image_Url");
    expect(JSON.stringify(values)).not.toContain("large-image-data");
    const query = models.masterRawMaterial.findMany.mock.calls.at(-1)?.[0] as {
      select?: Record<string, boolean>;
    };
    expect(query.select).toBeDefined();
    expect(query.select).not.toHaveProperty("image_url");
    expect(query.select).toMatchObject({
      id: true,
      organization_id: true,
      raw_material_name: true,
      raw_material_category_id: true,
    });
  });
});