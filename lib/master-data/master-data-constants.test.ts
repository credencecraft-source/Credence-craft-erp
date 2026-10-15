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
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
  deleteAllMasterValuesForOrganization,
  deleteMasterValue,
  deleteSelectedArticlesForOrganization,
  deleteSelectedMasterValuesForOrganization,
  getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization,
  isMasterSectionBulkDeletable,
  isActiveMasterLookupInIndex,
  loadActiveMasterLookupIndex,
  updateMasterValue,
} from "./master-data-constants";
import { getOrganizationMasterSetupDefinitions } from "./organization-master-setup-stages";

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

  it("creates a Size Group and all selected size links in one transaction", async () => {
    models.masterBrand.findFirst.mockResolvedValue({ id: "brand-id" } as never);
    models.masterSizeGroup.create.mockResolvedValue({
      id: "group-id",
      value_id: "group-value-id",
      organization_id: "org-id",
    } as never);
    models.masterSize.findMany.mockResolvedValue([
      { id: "size-s", value_id: "size-s-value", size: "S", is_active: true, legacy_metadata: null },
      { id: "size-m", value_id: "size-m-value", size: "M", is_active: true, legacy_metadata: null },
    ] as never);

    await createMasterValueForOrganization("org-id", "size-group", {
      label: "CORE S-M",
      fields: { Brand1: "brand-id", Size_Group: "CORE S-M", Size: ["S", "M"] },
      createOnly: true,
    });

    expect(models.masterSizeGroupSize.createMany).toHaveBeenCalledWith({
      data: [
        { organization_id: "org-id", size_group_id: "group-id", size_id: "size-s" },
        { organization_id: "org-id", size_group_id: "group-id", size_id: "size-m" },
      ],
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect((prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toEqual(expect.any(Function));
  });

  it("rejects a duplicate Size Group for the same Brand and exact size set regardless of order", async () => {
    models.masterBrand.findFirst.mockResolvedValue({ id: "brand-id" } as never);
    models.masterSize.findMany.mockResolvedValue([
      { id: "size-s", value_id: "size-s-value", size: "S", is_active: true, legacy_metadata: null },
      { id: "size-m", value_id: "size-m-value", size: "M", is_active: true, legacy_metadata: null },
      { id: "size-l", value_id: "size-l-value", size: "L", is_active: true, legacy_metadata: null },
    ] as never);
    models.masterSizeGroup.findMany.mockResolvedValue([{ id: "existing-group" }] as never);
    models.masterSizeGroupSize.findMany.mockResolvedValue([
      { size_group_id: "existing-group", size_id: "size-l" },
      { size_group_id: "existing-group", size_id: "size-m" },
      { size_group_id: "existing-group", size_id: "size-s" },
    ] as never);

    await expect(createMasterValueForOrganization("org-id", "size-group", {
      label: "SECOND S-M-L",
      fields: { Brand1: "brand-id", Size_Group: "SECOND S-M-L", Size: ["S", "M", "L"] },
      createOnly: true,
    })).rejects.toThrow(
      "This Brand already has a Size Group with exactly these sizes. Reuse that group; only a different size set can be created.",
    );

    expect(models.masterSizeGroup.create).not.toHaveBeenCalled();
  });

  it.each([
    { label: "subset", selectedSizes: ["S", "M"] },
    { label: "superset", selectedSizes: ["S", "M", "L", "XL"] },
  ])("allows a new same-Brand Size Group with a $label size set", async ({ selectedSizes }) => {
    models.masterBrand.findFirst.mockResolvedValue({ id: "brand-id" } as never);
    models.masterSize.findMany.mockResolvedValue(
      ["S", "M", "L", "XL"].map((size) => ({
        id: `size-${size.toLowerCase()}`,
        value_id: `size-${size.toLowerCase()}-value`,
        size,
        is_active: true,
        legacy_metadata: null,
      })) as never,
    );
    models.masterSizeGroup.findMany.mockResolvedValue([{ id: "existing-group" }] as never);
    models.masterSizeGroupSize.findMany.mockResolvedValue(
      ["S", "M", "L"].map((size) => ({
        size_group_id: "existing-group",
        size_id: `size-${size.toLowerCase()}`,
      })) as never,
    );
    models.masterSizeGroup.create.mockResolvedValue({
      id: "new-group",
      value_id: "new-group-value",
      organization_id: "org-id",
    } as never);

    await expect(createMasterValueForOrganization("org-id", "size-group", {
      label: `NEW ${selectedSizes.join("-")}`,
      fields: { Brand1: "brand-id", Size_Group: `NEW ${selectedSizes.join("-")}`, Size: selectedSizes },
      createOnly: true,
    })).resolves.toMatchObject({ id: "new-group" });

    expect(models.masterSizeGroup.create).toHaveBeenCalledOnce();
  });

  describe("selected Article deletion", () => {
    it("deletes selected articles only within the organization and audits the batch", async () => {
      models.masterArticle.findMany.mockResolvedValue([
        { id: "article-1", value_id: "article-value-1", legacy_metadata: null },
        { id: "article-2", value_id: "article-value-2", legacy_metadata: null },
      ] as never);
      models.masterArticle.deleteMany.mockResolvedValue({ count: 2 } as never);

      await expect(deleteSelectedArticlesForOrganization(
        "org-id",
        "user-id",
        ["article-1", "article-2"],
      )).resolves.toEqual({ deletedCount: 2 });

      expect(models.masterArticle.findMany).toHaveBeenCalledWith({
        where: { organization_id: "org-id", id: { in: ["article-1", "article-2"] } },
        select: { id: true, value_id: true, legacy_metadata: true },
      });
      expect(models.masterArticle.deleteMany).toHaveBeenCalledWith({
        where: { organization_id: "org-id", id: { in: ["article-1", "article-2"] } },
      });
      expect(models.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: "org-id",
          user_id: "user-id",
          action: "DELETE_SELECTED",
          entity_type: "article",
          details: { articleIds: ["article-1", "article-2"], deletedCount: 2 },
        }),
      });
    });

    describe("selected master deletion", () => {
      it("deletes selected records only within the organization and audits the selected module", async () => {
        models.masterBrand.findMany.mockResolvedValue([
          { id: "brand-1", value_id: "brand-value-1", legacy_metadata: null },
          { id: "brand-2", value_id: "brand-value-2", legacy_metadata: null },
        ] as never);
        models.masterBrand.deleteMany.mockResolvedValue({ count: 2 } as never);

        await expect(deleteSelectedMasterValuesForOrganization(
          "org-id",
          "user-id",
          "brand",
          ["brand-1", "brand-2"],
        )).resolves.toEqual({ deletedCount: 2 });

        expect(models.masterBrand.findMany).toHaveBeenCalledWith({
          where: { organization_id: "org-id", id: { in: ["brand-1", "brand-2"] } },
          select: { id: true, value_id: true, legacy_metadata: true },
        });
        expect(models.masterBrand.deleteMany).toHaveBeenCalledWith({
          where: { organization_id: "org-id", id: { in: ["brand-1", "brand-2"] } },
        });
        expect(models.auditEvent.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            organization_id: "org-id",
            user_id: "user-id",
            action: "DELETE_SELECTED",
            entity_type: "brand",
            details: {
              recordIds: ["brand-1", "brand-2"],
              moduleKey: "brand",
              deletedCount: 2,
            },
          }),
        });
      });

      it("rejects any selection containing a record outside the organization", async () => {
        models.masterSeason.findMany.mockResolvedValue([
          { id: "season-1", value_id: "season-value-1", legacy_metadata: null },
        ] as never);

        await expect(deleteSelectedMasterValuesForOrganization(
          "org-id",
          "user-id",
          "season",
          ["season-1", "foreign-season"],
        )).resolves.toMatchObject({ deletedCount: 0, error: expect.stringContaining("no longer available") });

        expect(models.masterSeason.deleteMany).not.toHaveBeenCalled();
        expect(models.auditEvent.create).not.toHaveBeenCalled();
      });

      it("keeps linked Size Groups undeleted and returns a clear dependency message", async () => {
        models.masterSizeGroup.findMany.mockResolvedValue([
          { id: "group-1", value_id: "group-value-1", legacy_metadata: null },
        ] as never);
        models.masterArticle.findFirst.mockResolvedValue({ id: "article-1" } as never);

        await expect(deleteSelectedMasterValuesForOrganization(
          "org-id",
          "user-id",
          "size-group",
          ["group-1"],
        )).resolves.toMatchObject({
          deletedCount: 0,
          error: expect.stringContaining("linked to Articles"),
        });

        expect(models.masterArticle.findFirst).toHaveBeenCalledWith({
          where: { organization_id: "org-id", size_group_id: { in: ["group-1"] } },
          select: { id: true },
        });
        expect(models.masterSizeGroup.deleteMany).not.toHaveBeenCalled();
        expect(models.auditEvent.create).not.toHaveBeenCalled();
      });

      it("translates a Size Group foreign-key restriction without bypassing it", async () => {
        models.masterSizeGroup.findMany.mockResolvedValue([
          { id: "group-1", value_id: "group-value-1", legacy_metadata: null },
        ] as never);
        models.masterArticle.findFirst.mockResolvedValue(null);
        models.masterSizeGroup.deleteMany.mockRejectedValue({ code: "P2003" });

        await expect(deleteSelectedMasterValuesForOrganization(
          "org-id",
          "user-id",
          "size-group",
          ["group-1"],
        )).resolves.toMatchObject({
          deletedCount: 0,
          error: expect.stringContaining("linked to Articles or other records"),
        });

        expect(models.auditEvent.create).not.toHaveBeenCalled();
      });
    });

    it("does not delete when any selected article is outside the organization", async () => {
      models.masterArticle.findMany.mockResolvedValue([
        { id: "article-1", value_id: "article-value-1", legacy_metadata: null },
      ] as never);

      await expect(deleteSelectedArticlesForOrganization(
        "org-id",
        "user-id",
        ["article-1", "foreign-article"],
      )).resolves.toMatchObject({ deletedCount: 0, error: expect.any(String) });

      expect(models.masterArticle.deleteMany).not.toHaveBeenCalled();
      expect(models.auditEvent.create).not.toHaveBeenCalled();
    });

    it("does not delete demo Articles outside the complete Dummy Data batch operation", async () => {
      (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst
        .mockResolvedValueOnce({ id: "demo-batch" });
      models.masterArticle.findMany.mockResolvedValue([
        {
          id: "article-demo",
          value_id: "article-demo-value",
          legacy_metadata: { dummyDataBatchId: "demo-batch" },
        },
      ] as never);

      await expect(deleteSelectedArticlesForOrganization("org-id", "user-id", ["article-demo"]))
        .resolves.toMatchObject({ deletedCount: 0, error: expect.stringContaining("Demo Articles") });

      expect(models.masterArticle.deleteMany).not.toHaveBeenCalled();
      expect(models.auditEvent.create).not.toHaveBeenCalled();
    });

    it("reports dependencies and leaves the batch undeleted", async () => {
      models.masterArticle.findMany.mockResolvedValue([
        { id: "article-1", value_id: "article-value-1", legacy_metadata: null },
      ] as never);
      models.masterArticle.deleteMany.mockRejectedValue({ code: "P2003" });

      await expect(deleteSelectedArticlesForOrganization("org-id", "user-id", ["article-1"]))
        .resolves.toMatchObject({ deletedCount: 0, error: expect.stringContaining("used by other records") });

      expect(models.auditEvent.create).not.toHaveBeenCalled();
    });
  });

  it("skips the redundant approval cleanup when importing a new create-only master", async () => {
    models.masterColor.create.mockResolvedValueOnce({
      id: "created-color",
      value_id: "created-color-value",
    } as never);

    await createMasterValueForOrganization("org-id", "color", {
      label: "NAVY",
      fields: { Colors: "NAVY" },
      createOnly: true,
    });

    expect(models.approvalRequest.deleteMany).not.toHaveBeenCalled();
    expect(models.approvalRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "org-id",
        entity_ref_id: "created-color-value",
      }),
    });
  });

  describe("active master lookup cache", () => {
    it("loads organization-scoped active values once and resolves dependent lookups in memory", async () => {
      (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> })
        .findFirst.mockResolvedValue({ id: "dummy-batch" });
      models.masterCategory.findMany.mockResolvedValue([
        { id: "category-1", value_id: "category-value-1", category_name: "APPAREL", legacy_metadata: null },
        {
          id: "category-demo",
          value_id: "category-value-demo",
          category_name: "DEMO",
          legacy_metadata: { dummyDataBatchId: "dummy-batch" },
        },
      ] as never);
      models.masterSubCategory.findMany.mockResolvedValue([
        {
          id: "subcategory-1",
          value_id: "subcategory-value-1",
          sub_category: "TOPS",
          category_id: "category-1",
          legacy_metadata: null,
        },
      ] as never);

      const index = await loadActiveMasterLookupIndex("org-id", ["category", "sub-category"]);

      expect(models.masterCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { organization_id: "org-id", is_active: true },
      }));
      expect(models.masterSubCategory.findMany).toHaveBeenCalledTimes(1);
      expect(isActiveMasterLookupInIndex(index, "category", "category-value-1")).toBe(true);
      expect(isActiveMasterLookupInIndex(index, "category", "demo")).toBe(false);
      expect(isActiveMasterLookupInIndex(index, "sub-category", "TOPS", "category", "APPAREL")).toBe(true);
      expect(isActiveMasterLookupInIndex(index, "sub-category", "TOPS", "category", "missing")).toBe(false);
    });
  });
});

describe("raw material creation", () => {
  it("resolves validated lookup values from a shared import index", async () => {
    const lookupIndex = new Map<string, Map<string, Array<{
      id: string;
      value_id: string;
      label: string;
      parent_id: string | null;
    }>>>();
    const addLookup = (
      moduleKey: string,
      id: string,
      label: string,
      parentId: string | null = null,
    ) => {
      const entries = lookupIndex.get(moduleKey) ?? new Map();
      const record = { id, value_id: `${id}-value`, label, parent_id: parentId };
      for (const key of [id, record.value_id, label]) {
        entries.set(key.toLocaleLowerCase(), [...(entries.get(key.toLocaleLowerCase()) ?? []), record]);
      }
      lookupIndex.set(moduleKey, entries);
    };
    addLookup("raw-material-category", "raw-category-id", "FABRIC");
    addLookup("raw-material-sub-category", "raw-subcategory-id", "KNIT", "raw-category-id");
    addLookup("uom", "uom-id", "METER");
    addLookup("raw-material-type", "raw-type-id", "RAW");
    addLookup("size-wise-consumption", "consumption-id", "STANDARD");
    addLookup("brand", "brand-id", "BRAND");
    addLookup("color", "colour-id", "BLUE");

    await createMasterValueForOrganization("org-id", "raw-material", {
      label: "CACHED LOOKUP FABRIC",
      fields: {
        Raw_Material_Name: "CACHED LOOKUP FABRIC",
        Category: "raw-category-id",
        Subcategory: "raw-subcategory-id",
        Stock_Uom1: "uom-id",
        Category_Type: "raw-type-id",
        Size_Wise_Concemption: true,
        Size_Wise_Consemption_Master: "consumption-id",
        Brand1: "brand-id",
        Colour: "colour-id",
      },
      lookupIndex,
    });

    expect(models.masterRawMaterial.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        raw_material_category_id: "raw-category-id",
        raw_material_sub_category_id: "raw-subcategory-id",
        stock_uom_id: "uom-id",
        raw_material_type_id: "raw-type-id",
        size_wise_consumption_id: "consumption-id",
        brand_id: "brand-id",
        colour_id: "colour-id",
      }),
    });
    expect(models.masterRawMaterialCategory.findFirst).not.toHaveBeenCalled();
    expect(models.masterRawMaterialSubCategory.findFirst).not.toHaveBeenCalled();
    expect(models.masterUom.findFirst).not.toHaveBeenCalled();
    expect(models.masterRawMaterialType.findFirst).not.toHaveBeenCalled();
    expect(models.masterSizeWiseConsumption.findFirst).not.toHaveBeenCalled();
    expect(models.masterBrand.findFirst).not.toHaveBeenCalled();
    expect(models.masterColor.findFirst).not.toHaveBeenCalled();
  });

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
  it("omits legacy metadata from Article Variant lookup queries", async () => {
    await getMasterValuesForOrganization("org-id", "article-variant");

    expect(models.masterArticleVariant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-id", is_active: true },
      select: expect.not.objectContaining({ legacy_metadata: true }),
    }));
  });

  it("omits legacy metadata from indexed Article Variant lookups", async () => {
    await loadActiveMasterLookupIndex("org-id", ["article-variant"]);

    expect(models.masterArticleVariant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-id", is_active: true },
      select: expect.not.objectContaining({ legacy_metadata: true }),
    }));
  });

  it("looks up article codes within the organization", async () => {
    await getMasterValuesForOrganization("org-id", "article", true, { articleCode: "AR-7BA58SCH-01" });

    expect(models.masterArticle.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-id", article_code: "AR-7BA58SCH-01" },
    }));
  });

  it("skips running-order aggregation for article lookup lists when excluded", async () => {
    const merchandisingOrder = (prismaMock as Record<string, unknown>).merchandisingOrder as {
      findMany: ReturnType<typeof vi.fn>;
    };
    models.masterArticle.findMany.mockResolvedValueOnce([{
      id: "article-id",
      value_id: "article-value-id",
      organization_id: "org-id",
      article: "Shirt",
      article_code: "SH-01",
      is_active: true,
    }] as never);

    const articles = await getMasterValuesForOrganization("org-id", "article", false, {
      includeArticleMetrics: false,
    });

    expect(articles).toHaveLength(1);
    expect(articles[0].fields).not.toHaveProperty("running_order_qty");
    expect(articles[0].fields).not.toHaveProperty("running_order_variants");
    expect(merchandisingOrder.findMany).not.toHaveBeenCalled();
  });

  it("hydrates persisted per-size prices for Article editing", async () => {
    models.masterArticle.findMany.mockResolvedValueOnce([{
      id: "article-id",
      value_id: "article-value-id",
      organization_id: "org-id",
      article: "Shirt",
      article_code: "SH-01",
      is_active: true,
    }] as never);
    models.masterArticleSize.findMany.mockResolvedValueOnce([
      {
        article_id: "article-id",
        price: { toString: () => "12.5" },
        size: { organization_id: "org-id", size: "S", is_active: true },
      },
    ] as never);

    const articles = await getMasterValuesForOrganization("org-id", "article", true, {
      includeArticleMetrics: false,
    });

    expect(articles[0].fields).toMatchObject({
      Sizes: ["S"],
      Size_Prices: [{ size: "S", price: "12.5" }],
    });
  });

  it("loads Article variants and size prices concurrently", async () => {
    const startedReads = new Set<string>();
    let releaseReads!: () => void;
    const bothReadsStarted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    models.masterArticle.findMany.mockResolvedValueOnce([{
      id: "article-id",
      value_id: "article-value-id",
      organization_id: "org-id",
      article: "Shirt",
      article_code: "SH-01",
      is_active: true,
    }] as never);
    models.masterArticleVariant.findMany.mockImplementation(async () => {
      startedReads.add("variants");
      if (startedReads.size === 2) releaseReads();
      await bothReadsStarted;
      return [];
    });
    models.masterArticleSize.findMany.mockImplementation(async () => {
      startedReads.add("sizes");
      if (startedReads.size === 2) releaseReads();
      await bothReadsStarted;
      return [];
    });

    const articles = await getMasterValuesForOrganization("org-id", "article", false, {
      includeArticleMetrics: false,
    });

    expect(articles).toHaveLength(1);
    expect(startedReads).toEqual(new Set(["variants", "sizes"]));
  });

  it("loads Article details while lookup-label hydration is pending", async () => {
    let releaseLookupLabel!: () => void;
    const lookupLabelPending = new Promise<void>((resolve) => {
      releaseLookupLabel = resolve;
    });
    let notifyLabelStarted!: () => void;
    const labelStarted = new Promise<void>((resolve) => {
      notifyLabelStarted = resolve;
    });
    let notifyArticleDetailsStarted!: () => void;
    const articleDetailsStarted = new Promise<void>((resolve) => {
      notifyArticleDetailsStarted = resolve;
    });
    const startedArticleDetails = new Set<string>();
    models.masterArticle.findMany.mockResolvedValueOnce([{
      id: "article-id",
      value_id: "article-value-id",
      organization_id: "org-id",
      article: "Shirt",
      article_code: "SH-01",
      brand_id: "brand-id",
      is_active: true,
    }] as never);
    models.masterBrand.findMany.mockImplementation(async () => {
      notifyLabelStarted();
      await lookupLabelPending;
      return [];
    });
    models.masterArticleVariant.findMany.mockImplementation(async () => {
      startedArticleDetails.add("variants");
      if (startedArticleDetails.size === 2) notifyArticleDetailsStarted();
      return [];
    });
    models.masterArticleSize.findMany.mockImplementation(async () => {
      startedArticleDetails.add("sizes");
      if (startedArticleDetails.size === 2) notifyArticleDetailsStarted();
      return [];
    });

    const articlesPending = getMasterValuesForOrganization("org-id", "article", false, {
      includeArticleMetrics: false,
    });
    await labelStarted;
    const detailsStartedBeforeLabelsResolved = await Promise.race([
      articleDetailsStarted.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    releaseLookupLabel();
    const articles = await articlesPending;

    expect(articles).toHaveLength(1);
    expect(detailsStartedBeforeLabelsResolved).toBe(true);
  });

  it("assigns the next organization article code in the requested format", async () => {
    models.masterBrand.findFirst.mockResolvedValue({ id: "brand-id" } as never);
    models.masterArticle.findMany.mockResolvedValue([
      { article_code: "AR-1" },
      { article_code: "AR6" },
      { article_code: "AR-DEMO-17" },
    ] as never);

    await createMasterValueForOrganization("org-id", "article", {
      label: "Winter Jacket",
      fields: { Brand: "brand-id" },
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
    models.masterBrand.findFirst.mockResolvedValue({ id: "brand-id" } as never);
    models.masterArticle.findMany.mockResolvedValue([] as never);

    await createMasterValueForOrganization("org-id", "article", {
      label: "Summer Shirt",
      fields: { Brand: "brand-id" },
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
    models.masterBrand.findFirst.mockResolvedValue({ id: "brand-id" } as never);
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
        Brand: "brand-id",
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
      data: [{ organization_id: "org-id", article_id: "style-id", size_id: "size-id", price: null }],
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

describe("master lookup query concurrency", () => {
  it("reuses an explicitly resolved dummy-data batch instead of querying it again", async () => {
    const dummyBatchDelegate = prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> };
    dummyBatchDelegate.findFirst.mockClear();

    await getMasterValuesForOrganization("org-id", "category", true, {
      includeDummyData: true,
      activeDummyDataBatch: { id: "resolved-batch-id" },
    });

    expect(dummyBatchDelegate.findFirst).not.toHaveBeenCalled();
  });

  it("selects only lookup identifiers and their display label during hydration", async () => {
    models.masterLocation.findMany.mockResolvedValueOnce([{
      id: "location-id",
      value_id: "location-value-id",
      organization_id: "org-id",
      location_name: "Warehouse",
      entity_id: "entity-id",
      is_active: true,
    }] as never);
    models.masterEntity.findMany.mockResolvedValueOnce([{
      id: "entity-id",
      value_id: "entity-value-id",
      entity_name: "Factory",
    }] as never);

    const values = await getMasterValuesForOrganization("org-id", "location");

    expect(values[0].fields.entity_id).toBe("Factory");
    expect(models.masterLocation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true,
        value_id: true,
        organization_id: true,
        is_active: true,
        sort_order: true,
        legacy_metadata: true,
        location_name: true,
        entity_id: true,
      },
    }));
    expect(models.masterEntity.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "org-id",
        OR: [{ id: { in: ["entity-id"] } }, { value_id: { in: ["entity-id"] } }],
      }),
      select: { id: true, value_id: true, entity_name: true },
      take: 500,
    }));
  });

  it("starts the master list and dummy-batch reads concurrently", async () => {
    const startedReads = new Set<string>();
    let releaseReads!: () => void;
    const bothReadsStarted = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockImplementation(async () => {
      startedReads.add("dummy-batch");
      if (startedReads.size === 2) releaseReads();
      await bothReadsStarted;
      return null;
    });
    models.masterCategory.findMany.mockImplementation(async () => {
      startedReads.add("master-values");
      if (startedReads.size === 2) releaseReads();
      await bothReadsStarted;
      return [];
    });

    const values = await getMasterValuesForOrganization("org-id", "category");

    expect(values).toEqual([]);
    expect(startedReads).toEqual(new Set(["dummy-batch", "master-values"]));
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

  describe("bulk master deletion", () => {
    it("deletes all values for the organization and clears approval requests atomically", async () => {
      models.masterColor.findMany.mockResolvedValue([
        { id: "color-1", value_id: "color-value-1", legacy_metadata: null },
        { id: "color-2", value_id: "color-value-2", legacy_metadata: null },
      ] as never);
      models.masterColor.deleteMany.mockResolvedValue({ count: 2 });

      await expect(deleteAllMasterValuesForOrganization("org-id", "user-id", "color"))
        .resolves.toEqual({ deletedCount: 2 });

      expect(models.masterColor.findMany).toHaveBeenCalledWith({
        where: { organization_id: "org-id" },
        select: { id: true, value_id: true, legacy_metadata: true },
      });
      expect(models.masterColor.deleteMany).toHaveBeenCalledWith({
        where: { organization_id: "org-id", id: { in: ["color-1", "color-2"] } },
      });
      expect(models.approvalRequest.deleteMany).toHaveBeenCalledWith({
        where: { organization_id: "org-id", entity_ref_id: { in: ["color-value-1", "color-value-2"] } },
      });
      expect(models.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organization_id: "org-id",
          user_id: "user-id",
          action: "DELETE_ALL",
          entity_type: "color",
          details: { moduleKey: "color", deletedCount: 2 },
        }),
      });
    });

    it("blocks deleting any values while the section contains active dummy-batch data", async () => {
      (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({ id: "demo-batch-id" });
      models.masterColor.findMany.mockResolvedValue([
        { id: "regular-color", value_id: "regular-value", legacy_metadata: null },
        { id: "demo-color", value_id: "demo-value", legacy_metadata: { dummyDataBatchId: "demo-batch-id" } },
      ] as never);

      await expect(deleteAllMasterValuesForOrganization("org-id", "user-id", "color"))
        .rejects.toThrow("Demo master values can only be removed by deleting the complete Dummy Data batch.");

      expect(models.masterColor.deleteMany).not.toHaveBeenCalled();
      expect(models.approvalRequest.deleteMany).not.toHaveBeenCalled();
      expect(models.auditEvent.create).not.toHaveBeenCalled();
    });

    it("does not audit or retain partial deletion when references block the section", async () => {
      models.masterSize.findMany.mockResolvedValue([
        { id: "size-1", value_id: "size-value-1", legacy_metadata: null },
        { id: "size-2", value_id: "size-value-2", legacy_metadata: null },
      ] as never);
      models.masterSize.deleteMany.mockRejectedValueOnce({ code: "P2003" });

      await expect(deleteAllMasterValuesForOrganization("org-id", "user-id", "size"))
        .rejects.toThrow("The size values are in use by other records.");

      expect(prismaMock.$transaction).toHaveBeenCalledOnce();
      expect(models.auditEvent.create).not.toHaveBeenCalled();
    });

    it("rejects unconfigured master keys without querying organization data", async () => {
      await expect(deleteAllMasterValuesForOrganization("org-id", "user-id", "article"))
        .rejects.toThrow("This master section is not available for bulk deletion.");

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("supports every persisted master exposed in the three setup steps", async () => {
      (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);
      for (const model of Object.values(models)) {
        model.findMany.mockResolvedValue([]);
      }
      const setupKeys = [...new Set((["independent", "related", "third"] as const)
        .flatMap((stage) => getOrganizationMasterSetupDefinitions(stage))
        .map((definition) => definition.key))]
        .filter(isMasterSectionBulkDeletable);

      for (const moduleKey of setupKeys) {
        await expect(deleteAllMasterValuesForOrganization("org-id", "user-id", moduleKey))
          .resolves.toEqual({ deletedCount: 0 });
      }

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(setupKeys.length);
      expect(isMasterSectionBulkDeletable("delivery-partner")).toBe(false);
    });
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
    expect((prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst)
      .toHaveBeenCalledTimes(1);
  });

  it("selects only the size-group link and size fields used by lookup responses", async () => {
    models.masterSizeGroupSize.findMany.mockResolvedValueOnce([{
      size_group_id: "group-id",
      size: {
        id: "size-id",
        value_id: "size-value-id",
        organization_id: "org-id",
        size: "M",
        is_active: true,
        status: "ACTIVE",
        legacy_metadata: null,
      },
    }] as never);

    await expect(getSizeGroupSizesForOrganization("org-id", undefined, true)).resolves.toMatchObject([{
      groupId: "group-id",
      size: { id: "size-id", label: "M", fields: { Size: "M", status: "ACTIVE" } },
    }]);
    expect(models.masterSizeGroupSize.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "org-id" },
      select: {
        size_group_id: true,
        size: {
          select: {
            id: true,
            value_id: true,
            organization_id: true,
            size: true,
            is_active: true,
            status: true,
            legacy_metadata: true,
          },
        },
      },
      orderBy: { created_at: "asc" },
    }));
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

  it("scopes dummy-reference label reads and selects only labels", async () => {
    (prismaMock.organizationDummyDataBatch as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
      master_record_ids: [
        { moduleKey: "category", id: "dummy-category-id" },
        { moduleKey: "brand", id: "dummy-brand-id" },
      ],
    });
    models.masterCategory.findMany.mockResolvedValue([] as never);
    models.masterBrand.findMany.mockResolvedValue([{ brand: "Demo Brand" }] as never);

    await expect(assertNoDummyMasterReferences("org-id", {
      category: "Demo Category",
      brand: "Demo Brand",
    })).rejects.toThrow("Dummy master values cannot be used by regular organization orders.");

    expect(models.masterCategory.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-id", id: { in: ["dummy-category-id"] } },
      select: { category_name: true },
    });
    expect(models.masterBrand.findMany).toHaveBeenCalledWith({
      where: { organization_id: "org-id", id: { in: ["dummy-brand-id"] } },
      select: { brand: true },
    });
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