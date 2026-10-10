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
    update: vi.fn().mockResolvedValue({ id: "updated-id" }),
    upsert: vi.fn().mockResolvedValue({ id: "upserted-id" }),
  });
  const modelNames = [
    "masterArticle", "masterArticleVariant", "masterArticleSize", "masterBrand", "masterBuyer", "masterCategory", "masterCategoryType", "masterColor",
    "masterCurrencyType", "masterEntity", "masterGoldSeal", "masterGoldSealVariant", "masterGst", "masterGstType",
    "masterHsn", "masterLocation", "masterMeasurementChart", "masterMerchandiser", "masterOperation",
    "masterOperationTemplate", "masterOperationTemplateStep", "masterOrderVolume", "masterPreOrderChecklist",
    "masterProcess", "masterProcessTemplate", "masterProcessTemplateStep", "masterProduct", "masterRawMaterial",
    "masterRawMaterialCategory", "masterRawMaterialSubCategory", "masterRawMaterialType", "masterSeason",
    "masterSize", "masterSizeGroup", "masterSizeGroupSize", "masterState", "masterStatus", "masterStockUomConvert",
    "masterSubCategory", "masterUom", "masterVendor", "masterSizeWiseConsumption",
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

describe("article creation", () => {
  it("looks up article codes within the organization", async () => {
    await getMasterValuesForOrganization("org-id", "article", true, { articleCode: "AR-7BA58SCH-01" });

    expect(models.masterArticle.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-id", article_code: "AR-7BA58SCH-01" },
    }));
  });

  it("assigns the next organization article code in the requested format", async () => {
    models.masterArticle.findMany.mockResolvedValue([
      { article_code: "AR-1" },
      { article_code: "AR6" },
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
        article_code: "AR7",
      }),
    });
  });

  it("starts the Article code sequence at AR1", async () => {
    models.masterArticle.findMany.mockResolvedValue([] as never);

    await createMasterValueForOrganization("org-id", "article", {
      label: "Summer Shirt",
    });

    expect(models.masterArticle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-id",
        article: "Summer Shirt",
        article_code: "AR1",
      }),
    });
  });

  it("creates the parent style, color variants, and chosen group sizes in one transaction", async () => {
    let transactionStarted = false;
    models.masterSizeGroup.findFirst.mockImplementation(async () => {
      expect(transactionStarted).toBe(true);
      return { id: "size-group-id", legacy_metadata: null } as never;
    });
    models.masterArticle.findFirst.mockImplementation(async ({ where }) => (
      "id" in where
        ? { id: "style-id", article_code: "AR1", size_group_id: "size-group-id" }
        : null
    ) as never);
    models.masterArticle.create.mockResolvedValue({
      id: "style-id",
      value_id: "style-value-id",
      organization_id: "org-id",
      size_group_id: "size-group-id",
    } as never);
    models.masterColor.findFirst.mockResolvedValue({
      id: "blue-id",
      colors: "Blue",
      legacy_metadata: null,
    } as never);
    models.masterSizeGroupSize.findMany.mockResolvedValue([{
      organization_id: "org-id",
      size_group_id: "size-group-id",
      size_id: "size-id",
      size: {
        id: "size-id",
        value_id: "size-value-id",
        organization_id: "org-id",
        size: "S",
        legacy_metadata: null,
      },
    }] as never);
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (callback: (transaction: Record<string, unknown>) => Promise<unknown>) => {
        transactionStarted = true;
        return callback(prismaMock as Record<string, unknown>);
      },
    );

    await createMasterValueForOrganization("org-id", "article", {
      label: "ApplePrinter",
      fields: {
        article: "ApplePrinter",
        Size_Group: "size-group-id",
        default_price: "10.1234",
      },
      articleVariants: [{
        fields: { color: "blue-id", sku: "APPLE-BLUE", price_override: "11.1234" },
      }],
      articleSizes: ["S"],
    });

    const articleData = models.masterArticle.create.mock.calls[0][0].data;
    const variantData = models.masterArticleVariant.create.mock.calls[0][0].data;
    expect(String(articleData.default_price)).toBe("10.1234");
    expect(variantData).toMatchObject({
      organization_id: "org-id",
      article_id: "style-id",
      color_id: "blue-id",
      sku: "APPLE-BLUE",
    });
    expect(String(variantData.price_override)).toBe("11.1234");
    expect(models.masterArticleSize.createMany).toHaveBeenCalledWith({
      data: [{ organization_id: "org-id", article_id: "style-id", size_id: "size-id" }],
    });
    expect(models.masterSizeGroup.findFirst).toHaveBeenCalledTimes(2);
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
  });

  it("uses the longer transaction timeout when updating Article sizes", async () => {
    (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockReset().mockImplementation(
      (callback: (transaction: Record<string, unknown>) => Promise<unknown>) => callback(prismaMock as Record<string, unknown>),
    );
    for (const model of Object.values(models)) {
      model.findFirst.mockReset().mockResolvedValue(null);
    }
    models.masterArticle.findFirst.mockReset();
    models.masterArticle.findFirst.mockImplementation(async ({ where }) => (
      "id" in where
        ? { id: "style-id", size_group_id: "size-group-id" }
        : {
            id: "style-id",
            value_id: "style-value-id",
            organization_id: "org-id",
            article: "ApplePrinter",
            is_active: true,
            sort_order: 0,
            size_group_id: "size-group-id",
          }
    ) as never);
    models.masterArticle.update.mockReset().mockResolvedValueOnce({ id: "style-id", size_group_id: "size-group-id" } as never);
    models.masterSizeGroup.findFirst.mockReset().mockResolvedValue({ id: "size-group-id", legacy_metadata: null } as never);

    await updateMasterValue("org-id", "style-id", { articleSizes: [] });

    expect(models.masterArticle.findFirst).toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15_000 });
    expect(models.masterSizeGroup.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "org-id", id: "size-group-id" },
      select: { id: true, legacy_metadata: true },
    });
  });
});

describe("quick-created sizes", () => {
  it("links a new size to an active Size Group in the same organization", async () => {
    models.masterSizeGroup.findFirst.mockResolvedValueOnce({ id: "group-id" } as never);

    await createMasterValueForOrganization("org-id", "size", {
      label: "XXL",
      fields: { Size: "XXL" },
      sizeGroupId: "group-value-id",
    });

    expect(models.masterSizeGroup.findFirst).toHaveBeenCalledWith({
      where: {
        organization_id: "org-id",
        OR: [{ id: "group-value-id" }, { value_id: "group-value-id" }],
        is_active: true,
      },
      select: { id: true },
    });
    expect(models.masterSizeGroupSize.create).toHaveBeenCalledWith({
      data: {
        organization_id: "org-id",
        size_group_id: "group-id",
        size_id: "created-id",
      },
    });
  });

  it("rejects linking a size to a Size Group outside the organization", async () => {
    models.masterSizeGroup.findFirst.mockResolvedValue(null);

    await expect(createMasterValueForOrganization("org-id", "size", {
      label: "XXL",
      fields: { Size: "XXL" },
      sizeGroupId: "foreign-group-id",
    })).rejects.toThrow("Select an active Size Group belonging to this organization.");

    expect(models.masterSize.create).not.toHaveBeenCalled();
    expect(models.masterSizeGroupSize.create).not.toHaveBeenCalled();
  });
});

describe("vendor contact details", () => {
  it("stores contact fields in the vendor legacy metadata", async () => {
    models.masterState.findFirst.mockResolvedValueOnce({ id: "state-id" } as never);

    await createMasterValueForOrganization("org-id", "vendor", {
      label: "Example Vendor",
      fields: {
        vendor: "Example Vendor",
        Contact_Person: "Jamie Example",
        Contact_Phone: "9876543210",
        Contact_Email: "jamie@example.test",
        Registered_State: "state-id",
      },
    });

    expect(models.masterVendor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-id",
        vendor: "Example Vendor",
        registered_state_id: "state-id",
        legacy_metadata: {
          contact_person: "Jamie Example",
          contact_phone: "9876543210",
          contact_email: "jamie@example.test",
        },
      }),
    });
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