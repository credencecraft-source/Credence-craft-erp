import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { reserveNextOrderNumbers } from "@/lib/services/orders/order-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";
import { lockOrganizationOrderQuantityLimit } from "@/lib/services/platform/order-quantity-limit-service";
import {
  getEffectiveSegmentFormRestriction,
  validateMonthlyFormLimits,
  validateRestrictedFormFields,
} from "@/lib/services/platform/segment-form-restriction-service";

type DemoMasterRecord = { moduleKey: string; id: string };
const SAMPLE_DATASET_VERSION = "apparel-10-orders-2026-09";
const MAX_DUMMY_ORDER_QTY = 4000;

function normalizeDummyOrderQty(orderQty: number) {
  return Math.min(Math.max(orderQty, 0), MAX_DUMMY_ORDER_QTY);
}

const SAMPLE_VALUES = {
  categories: ["Shirt", "Pant", "Shorts", "Jacket"],
  subCategories: [
    { category: "Shirt", name: "Full Sleeve Shirt" },
    { category: "Shirt", name: "Half Sleeve Shirt" },
    { category: "Shirt", name: "Short Sleeve Shirt" },
    { category: "Shirt", name: "Polo Shirt" },
    { category: "Pant", name: "Formal Trouser" },
    { category: "Pant", name: "Casual Trouser" },
    { category: "Pant", name: "Jeans" },
    { category: "Shorts", name: "Denim Shorts" },
    { category: "Shorts", name: "Cargo Shorts" },
    { category: "Jacket", name: "Bomber Jacket" },
  ],
  brands: [
    "Blackberrys", "Andamen", "Peter England", "Benetton", "Bombay Shirt Company",
    "Rare Rabbit", "Turtle", "Allen Solly", "Louis Philippe", "Van Heusen",
  ],
  vendors: [
    "ARAVIND FABRICS",
    "VARDHAMAN",
    "RAYMONDS",
    "UNITED PLASTIC",
    "GIRIRAG PACKAGING",
    "CORD THREAD",
  ],
  buyers: [
    { name: "Impulse", currency: "INR" },
    { name: "Royal Enfield", currency: "INR" },
    { name: "Benetton", currency: "Dollar" },
  ],
  currencies: ["INR", "Dollar"],
  season: "Spring Summer 2027",
  articles: [
    "Classic Cotton Full Sleeve Shirt",
    "Relaxed Cotton Half Sleeve Shirt",
    "Oxford Short Sleeve Shirt",
    "Pique Polo Shirt",
    "Slim Fit Formal Trouser",
    "Stretch Casual Trouser",
    "Indigo Denim Jeans",
    "Classic Denim Shorts",
    "Utility Cargo Shorts",
    "Lightweight Bomber Jacket",
  ],
  colors: ["Black", "White", "Navy Blue", "Blue", "Red", "Green", "Yellow", "Grey", "Brown", "Beige", "Pink", "Maroon"],
  sizes: ["S", "M", "L", "XL", "XXL", "XXXL", "32", "34", "36", "38", "40"],
  sizeGroups: [
    { name: "SHIRT", sizes: ["S", "M", "L", "XL", "XXL", "XXXL"] },
    { name: "PANT", sizes: ["32", "34", "36", "38", "40"] },
  ],
  rawMaterialCategories: [
    {
      name: "FABRIC AND INTERLINNG",
      subCategories: ["MAIN FABRIC", "INTERLINING"],
    },
    {
      name: "SEWING TRIMS",
      subCategories: ["MAIN LABEL", "SIZE LABEL", "WASHCARE LABEL", "TAPE", "BUTTON", "SEWINGTHREAD", "EMB THREAD"],
    },
    {
      name: "PACKING TRIMS",
      subCategories: [
        "HANG TAG", "U CLIP", "M CLIP", "COLLAR TRAVELLER", "COLLAR PATTI", "COLLAR BONE", "BACK SUPPORT", "BUTTER FLY",
        "TISSUE PAPER", "POLY BAG", "WRAPPING POLY ROLL", "BARCODE", "CARTON",
      ],
    },
    { name: "SERVICE", subCategories: ["SERVICE"] },
  ],
  stockUoms: ["MTR", "PCS", "KG"],
  rawMaterials: [
    { category: "FABRIC AND INTERLINNG", subCategory: "MAIN FABRIC", name: "MAIN FABRIC -AW24ANDMSYD059 KG 3395", uom: "MTR" },
    { category: "FABRIC AND INTERLINNG", subCategory: "INTERLINING", name: "INTERLINING - 3630 - CHARCOAL", uom: "MTR" },
    { category: "FABRIC AND INTERLINNG", subCategory: "INTERLINING", name: "INTERLINING - 3610 - CHARCOAL", uom: "MTR" },
    { category: "SEWING TRIMS", subCategory: "MAIN LABEL", name: "ANDM - MAIN LABEL - NAVY", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "SIZE LABEL", name: "SIZE CUM FIT LABEL -NAVY (SLIM) - S", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "SIZE LABEL", name: "SIZE CUM FIT LABEL -NAVY (SLIM) - M", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "SIZE LABEL", name: "SIZE CUM FIT LABEL -NAVY (SLIM) - L", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "SIZE LABEL", name: "SIZE CUM FIT LABEL -NAVY (SLIM) - XL", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "SIZE LABEL", name: "SIZE CUM FIT LABEL -NAVY (SLIM) - XXL", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "WASHCARE LABEL", name: "ANDM - WASH CARE -: 100% COTTON", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "TAPE", name: "BLACK SATIN TAPE", uom: "MTR" },
    { category: "SEWING TRIMS", subCategory: "BUTTON", name: "SS23ANDBTN004 BUTTON - 18L", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "BUTTON", name: "SS23ANDBTN004 BUTTON - 14L", uom: "PCS" },
    { category: "SEWING TRIMS", subCategory: "SEWINGTHREAD", name: "LABEL ATTACHING THREAD SH- C7361 120 TKT", uom: "MTR" },
    { category: "SEWING TRIMS", subCategory: "SEWINGTHREAD", name: "SH#HV39X 120 TKT EPIC", uom: "MTR" },
    { category: "SEWING TRIMS", subCategory: "SEWINGTHREAD", name: "BUTTON ATTACHMENT SH#HV39X 120 TKT EPIC", uom: "MTR" },
    { category: "SEWING TRIMS", subCategory: "EMB THREAD", name: "SH#C0898 180TKT EPIC", uom: "MTR" },
    { category: "SEWING TRIMS", subCategory: "EMB THREAD", name: "SH#C8834 180TKT EPIC", uom: "MTR" },
    { category: "SEWING TRIMS", subCategory: "EMB THREAD", name: "SH#C7927 180TKT EPIC", uom: "MTR" },
    { category: "SEWING TRIMS", subCategory: "EMB THREAD", name: "SH#C7988 180TKT EPIC", uom: "MTR" },
    { category: "PACKING TRIMS", subCategory: "HANG TAG", name: "ANDM - HANG TAG", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "U CLIP", name: "METAL CLIP", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "M CLIP", name: "PLASTIC CLIP", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "COLLAR TRAVELLER", name: "COLLAR TRAVELLER", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "COLLAR PATTI", name: "COLLAR PATTI", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "COLLAR BONE", name: "PVC COLLAR BONE - L5CM X W1.2CM (MILKY WHITE)", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "BACK SUPPORT", name: "BACK SUPPORT", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "BUTTER FLY", name: "BUTTER FLY", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "TISSUE PAPER", name: "TISSUE PAPER", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "TISSUE PAPER", name: "1.5\" & 2\"", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "POLY BAG", name: "POLY BAG 10.5\"W X 15\"L + 1\"G + 3\"FLAP", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "WRAPPING POLY ROLL", name: "POLY WRAP FILM", uom: "KG" },
    { category: "PACKING TRIMS", subCategory: "BARCODE", name: "BARCODE PRICE STICKER - S", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "BARCODE", name: "BARCODE PRICE STICKER - M", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "BARCODE", name: "BARCODE PRICE STICKER - L", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "BARCODE", name: "BARCODE PRICE STICKER - XL", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "BARCODE", name: "BARCODE PRICE STICKER - XXL", uom: "PCS" },
    { category: "PACKING TRIMS", subCategory: "CARTON", name: "Outer carton in cms - 5ply w-40 , l-60.5, h-40", uom: "PCS" },
    { category: "SERVICE", subCategory: "SERVICE", name: "Transport charge", uom: "PCS" },
  ],
  sampleOrders: [
    { category: "Shirt", subCategory: "Full Sleeve Shirt", article: "Classic Cotton Full Sleeve Shirt", brand: "Blackberrys", buyer: "Impulse", color: "Black", sizeGroup: "SHIRT", orderQty: 360, bomMaterialIndexes: [0, 3, 9, 37, 1, 14, 11, 4] },
    { category: "Shirt", subCategory: "Half Sleeve Shirt", article: "Relaxed Cotton Half Sleeve Shirt", brand: "Andamen", buyer: "Royal Enfield", color: "White", sizeGroup: "SHIRT", orderQty: 420, bomMaterialIndexes: [0, 3, 9, 37, 1, 14, 11, 5] },
    { category: "Shirt", subCategory: "Short Sleeve Shirt", article: "Oxford Short Sleeve Shirt", brand: "Peter England", buyer: "Benetton", color: "Navy Blue", sizeGroup: "SHIRT", orderQty: 390, bomMaterialIndexes: [0, 3, 9, 37, 1, 14, 16, 6] },
    { category: "Shirt", subCategory: "Polo Shirt", article: "Pique Polo Shirt", brand: "Benetton", buyer: "Impulse", color: "Blue", sizeGroup: "SHIRT", orderQty: 410, bomMaterialIndexes: [0, 3, 9, 37, 1, 14, 11, 7] },
    { category: "Pant", subCategory: "Formal Trouser", article: "Slim Fit Formal Trouser", brand: "Bombay Shirt Company", buyer: "Royal Enfield", color: "Grey", sizeGroup: "PANT", orderQty: 450, bomMaterialIndexes: [0, 3, 9, 37, 1, 14, 11, 8] },
    { category: "Pant", subCategory: "Casual Trouser", article: "Stretch Casual Trouser", brand: "Rare Rabbit", buyer: "Benetton", color: "Beige", sizeGroup: "PANT", orderQty: 480, bomMaterialIndexes: [0, 3, 9, 37, 1, 14, 11, 12] },
    { category: "Pant", subCategory: "Jeans", article: "Indigo Denim Jeans", brand: "Turtle", buyer: "Impulse", color: "Blue", sizeGroup: "PANT", orderQty: 350, bomMaterialIndexes: [0, 3, 9, 37, 10, 11, 13, 15] },
    { category: "Shorts", subCategory: "Denim Shorts", article: "Classic Denim Shorts", brand: "Allen Solly", buyer: "Royal Enfield", color: "Black", sizeGroup: "PANT", orderQty: 400, bomMaterialIndexes: [0, 3, 9, 37, 10, 21, 22, 31] },
    { category: "Shorts", subCategory: "Cargo Shorts", article: "Utility Cargo Shorts", brand: "Louis Philippe", buyer: "Benetton", color: "Green", sizeGroup: "PANT", orderQty: 430, bomMaterialIndexes: [0, 3, 9, 37, 20, 33, 34, 35] },
    { category: "Jacket", subCategory: "Bomber Jacket", article: "Lightweight Bomber Jacket", brand: "Van Heusen", buyer: "Impulse", color: "Maroon", sizeGroup: "SHIRT", orderQty: 330, bomMaterialIndexes: [0, 3, 9, 37, 1, 17, 25, 32] },
  ],
} as const;

function createSampleFinishedGoodsRows(orderQty: number, sizeGroupName: string, orderIndex: number) {
  const sizeGroup = SAMPLE_VALUES.sizeGroups.find((item) => item.name === sizeGroupName);
  if (!sizeGroup) throw new Error(`Sample size group ${sizeGroupName} is not configured.`);

  const boundedQty = normalizeDummyOrderQty(orderQty);
  const minPerSize = 500;
  const maxPerSize = 1000;
  const targetTotal = Math.max(boundedQty, sizeGroup.sizes.length * minPerSize);
  const quantities = sizeGroup.sizes.map(() => minPerSize);
  let remaining = targetTotal - quantities.reduce((total, qty) => total + qty, 0);

  for (let index = 0; index < sizeGroup.sizes.length && remaining > 0; index += 1) {
    const slot = (orderIndex + index) % sizeGroup.sizes.length;
    const available = Math.min(maxPerSize - quantities[slot], remaining);
    if (available <= 0) continue;
    quantities[slot] += available;
    remaining -= available;
  }

  return sizeGroup.sizes.map((size, index) => ({ size, beforeExcessQty: quantities[index] }));
}

function createSampleBomMaterialIndexes(orderIndex: number) {
  const targetCount = 30 + (orderIndex % 6);
  const requiredIndexes: number[] = [...SAMPLE_VALUES.sampleOrders[orderIndex].bomMaterialIndexes];
  const requiredIndexSet = new Set<number>(requiredIndexes);
  const optionalIndexes = Array.from({ length: SAMPLE_VALUES.rawMaterials.length }, (_, index) => index)
    .filter((index) => !requiredIndexSet.has(index));

  for (let cursor = optionalIndexes.length - 1; cursor > 0; cursor -= 1) {
    const swapIndex = (orderIndex + cursor + 7) % (cursor + 1);
    [optionalIndexes[cursor], optionalIndexes[swapIndex]] = [optionalIndexes[swapIndex], optionalIndexes[cursor]];
  }

  return [...requiredIndexes, ...optionalIndexes.slice(0, targetCount - requiredIndexes.length)];
}

function readMasterRecordIds(value: Prisma.JsonValue): DemoMasterRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((record) => {
    if (typeof record !== "object" || record === null || Array.isArray(record)) return [];
    const { moduleKey, id } = record;
    return typeof moduleKey === "string" && typeof id === "string" ? [{ moduleKey, id }] : [];
  });
}

function isDummyBatchTableMissing(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2021") return false;
  const metadata = "meta" in error && typeof error.meta === "object" && error.meta !== null ? error.meta : null;
  const table = String(metadata && "table" in metadata ? metadata.table : "");
  return table.includes("organization_dummy_data_batches")
    || ("message" in error && String(error.message).includes("organization_dummy_data_batches"));
}

async function authorizeOrganization(userId: string, routeOrganizationId: string, allowPendingOwner = false) {
  const membership = await requireOrganizationPermission(userId, routeOrganizationId, "ORGANIZATION_SETTINGS");
  if (allowPendingOwner && membership.role !== "OWNER") {
    throw new Error("Only the organization owner can prepare sample data before approval.");
  }
  const organization = await prisma.organization.findFirst({
    where: {
      id: membership.organization_id,
      is_active: true,
      approval_status: allowPendingOwner ? "PENDING_APPROVAL" : "APPROVED",
    },
    select: { id: true, organization_name: true, approval_status: true },
  });

  if (!organization) throw new Error("This organization is not available for dummy-data setup.");
  return organization;
}

export async function getOrganizationDummyDataStatus(userId: string, routeOrganizationId: string) {
  const organization = await authorizeOrganization(userId, routeOrganizationId);
  let batch;
  try {
    batch = await prisma.organizationDummyDataBatch.findUnique({
      where: { organization_id: organization.id },
      select: { id: true, status: true, sample_order_id: true, master_record_ids: true, created_at: true },
    });
  } catch (error) {
    if (isDummyBatchTableMissing(error)) {
      return { status: "SCHEMA_NOT_READY", createdAt: null, orderNo: null, masterCount: 0 };
    }
    throw error;
  }

  let orderNo: string | null = null;
  if (batch?.sample_order_id) {
    const order = await prisma.merchandisingOrder.findFirst({
      where: { id: batch.sample_order_id, organization_id: organization.id },
      select: { orderNo: true },
    });
    orderNo = order?.orderNo ?? null;
  }

  const batchRecords = batch ? readMasterRecordIds(batch.master_record_ids) : [];
  const orderCount = batchRecords.filter((record) => record.moduleKey === "sample-order").length
    || (batch?.sample_order_id ? 1 : 0);

  return {
    status: batch?.status ?? "EMPTY",
    createdAt: batch?.created_at ?? null,
    orderNo,
    orderCount,
    masterCount: batchRecords.filter((record) => record.moduleKey !== "sample-order").length,
  };
}

export async function createOrganizationDummyData(userId: string, routeOrganizationId: string, requestedBy = userId) {
  return createOrganizationDummyDataForUser(userId, routeOrganizationId, false, requestedBy);
}

export async function createOrganizationDummyDataForNewOrganization(userId: string, routeOrganizationId: string, requestedBy = userId) {
  return createOrganizationDummyDataForUser(userId, routeOrganizationId, true, requestedBy);
}

async function createOrganizationDummyDataForUser(userId: string, routeOrganizationId: string, allowPendingOwner: boolean, requestedBy: string) {
  const organization = await authorizeOrganization(userId, routeOrganizationId, allowPendingOwner);
  const formRestriction = await getEffectiveSegmentFormRestriction(organization.id, "merchandising_orders");
  await Promise.all(SAMPLE_VALUES.sampleOrders.map((sampleOrder) => validateRestrictedFormFields(
    organization.id,
    "merchandising_orders",
    {
      entityName: organization.organization_name,
      category: sampleOrder.category,
      subCategory: sampleOrder.subCategory,
      season: SAMPLE_VALUES.season,
      article: sampleOrder.article,
      styleName: sampleOrder.article,
      colors: sampleOrder.color,
      buyer: sampleOrder.buyer,
      brand: sampleOrder.brand,
      sizeGroup: sampleOrder.sizeGroup,
      haveSizeRatio: false,
      orderQty: normalizeDummyOrderQty(sampleOrder.orderQty),
    },
    formRestriction,
  )));

  const existingBatch = await prisma.organizationDummyDataBatch.findUnique({
    where: { organization_id: organization.id },
    select: { status: true, master_record_ids: true },
  });
  if (existingBatch?.status === "ACTIVE" && !hasCurrentSampleDatasetVersion(existingBatch.master_record_ids)) {
    await deleteOrganizationDummyData(userId, routeOrganizationId);
  }

  return prisma.$transaction(async (transaction) => {
    const batch = await transaction.organizationDummyDataBatch.upsert({
      where: { organization_id: organization.id },
      create: { organization_id: organization.id },
      update: {},
    });
    if (batch.status === "ACTIVE") {
      if (hasCurrentSampleDatasetVersion(batch.master_record_ids)) {
        const existingOrderCount = readMasterRecordIds(batch.master_record_ids)
          .filter((item) => item.moduleKey === "sample-order").length;
        return { created: false, orderNo: null, orderCount: existingOrderCount || 1 };
      }
      throw new Error("The existing dummy dataset changed during replacement. Refresh and try again.");
    }
    if (batch.status !== "EMPTY") {
      throw new Error("Dummy-data setup is already in progress. Refresh the page and try again.");
    }

    const [entity, finishedGoodsType, rawMaterialType] = await Promise.all([
      transaction.masterEntity.findFirst({
        where: { organization_id: organization.id, entity_name: organization.organization_name, is_active: true },
        select: { id: true },
      }),
      transaction.masterProduct.findFirst({
        where: { organization_id: organization.id, product_master_name: "Finished Goods", is_active: true },
        select: { id: true },
      }),
      transaction.masterRawMaterialType.findFirst({
        where: { organization_id: organization.id, raw_material_type: "Item", is_active: true },
        select: { id: true },
      }),
    ]);
    if (!entity || !finishedGoodsType || !rawMaterialType) {
      throw new Error("Required organization master values are missing. Complete organization master setup first.");
    }

    const metadata = { dummyDataBatchId: batch.id } satisfies Prisma.InputJsonObject;
    const [categoryConflicts, subCategoryConflicts, brandConflicts, buyerConflicts, currencyConflicts, vendorConflicts, seasonConflict, articleConflicts, colorConflicts, sizeConflicts, sizeGroupConflicts, rawCategoryConflicts, rawSubCategoryConflicts, stockUomConflicts, rawMaterialConflicts] = await Promise.all([
      transaction.masterCategory.findMany({ where: { organization_id: organization.id, category_name: { in: [...SAMPLE_VALUES.categories] } }, select: { id: true } }),
      transaction.masterSubCategory.findMany({ where: { organization_id: organization.id, sub_category: { in: SAMPLE_VALUES.subCategories.map((item) => item.name) } }, select: { id: true } }),
      transaction.masterBrand.findMany({ where: { organization_id: organization.id, brand: { in: [...SAMPLE_VALUES.brands] } }, select: { id: true } }),
      transaction.masterBuyer.findMany({ where: { organization_id: organization.id, buyer_name: { in: SAMPLE_VALUES.buyers.map((item) => item.name) } }, select: { id: true } }),
      transaction.masterCurrencyType.findMany({ where: { organization_id: organization.id, currency_type: { in: [...SAMPLE_VALUES.currencies] } }, select: { id: true } }),
      transaction.masterVendor.findMany({ where: { organization_id: organization.id, vendor: { in: [...SAMPLE_VALUES.vendors] } }, select: { id: true } }),
      transaction.masterSeason.findFirst({ where: { organization_id: organization.id, season: SAMPLE_VALUES.season }, select: { id: true } }),
      transaction.masterArticle.findMany({ where: { organization_id: organization.id, article: { in: [...SAMPLE_VALUES.articles] } }, select: { id: true } }),
      transaction.masterColor.findMany({ where: { organization_id: organization.id, colors: { in: [...SAMPLE_VALUES.colors] } }, select: { id: true } }),
      transaction.masterSize.findMany({ where: { organization_id: organization.id, size: { in: [...SAMPLE_VALUES.sizes] } }, select: { id: true } }),
      transaction.masterSizeGroup.findMany({ where: { organization_id: organization.id, size_group: { in: SAMPLE_VALUES.sizeGroups.map((item) => item.name) } }, select: { id: true } }),
      transaction.masterRawMaterialCategory.findMany({ where: { organization_id: organization.id, raw_material_category: { in: SAMPLE_VALUES.rawMaterialCategories.map((item) => item.name) } }, select: { id: true } }),
      transaction.masterRawMaterialSubCategory.findMany({ where: { organization_id: organization.id, raw_material_sub_category: { in: SAMPLE_VALUES.rawMaterialCategories.flatMap((item) => item.subCategories) } }, select: { id: true } }),
      transaction.masterUom.findMany({ where: { organization_id: organization.id, uom: { in: [...SAMPLE_VALUES.stockUoms] } }, select: { id: true } }),
      transaction.masterRawMaterial.findMany({ where: { organization_id: organization.id, raw_material_name: { in: SAMPLE_VALUES.rawMaterials.map((item) => item.name) } }, select: { id: true } }),
    ]);
    if ([
      categoryConflicts, subCategoryConflicts, brandConflicts, buyerConflicts, currencyConflicts, vendorConflicts,
      colorConflicts, sizeConflicts, sizeGroupConflicts, rawCategoryConflicts, rawSubCategoryConflicts,
      stockUomConflicts, rawMaterialConflicts, articleConflicts,
    ].some((conflicts) => conflicts.length > 0) || seasonConflict) {
      throw new Error("A sample master value already exists. No organization records were changed; contact support to resolve the naming conflict.");
    }

    const createdRecords: DemoMasterRecord[] = [];
    const record = (moduleKey: string, id: string) => createdRecords.push({ moduleKey, id });
    const categoryOffset = await transaction.masterCategory.count({ where: { organization_id: organization.id } });
    const categories = await transaction.masterCategory.createManyAndReturn({
      data: SAMPLE_VALUES.categories.map((categoryName, index) => ({
        organization_id: organization.id,
        product_master_id: finishedGoodsType.id,
        category_name: categoryName,
        is_active: true,
        sort_order: categoryOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, category_name: true },
    });
    categories.forEach((item) => record("category", item.id));
    const categoryIds = new Map(categories.map((item) => [item.category_name, item.id]));

    const subCategoryOffset = await transaction.masterSubCategory.count({ where: { organization_id: organization.id } });
    const subCategories = await transaction.masterSubCategory.createManyAndReturn({
      data: SAMPLE_VALUES.subCategories.map((item, index) => ({
        organization_id: organization.id,
        category_id: categoryIds.get(item.category)!,
        sub_category: item.name,
        is_active: true,
        sort_order: subCategoryOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true },
    });
    subCategories.forEach((item) => record("sub-category", item.id));

    const brandOffset = await transaction.masterBrand.count({ where: { organization_id: organization.id } });
    const brands = await transaction.masterBrand.createManyAndReturn({
      data: SAMPLE_VALUES.brands.map((brandName, index) => ({
        organization_id: organization.id,
        brand: brandName,
        is_active: true,
        sort_order: brandOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, brand: true },
    });
    brands.forEach((item) => record("brand", item.id));
    const brandIds = new Map(brands.map((item) => [item.brand, item.id]));

    const currencyOffset = await transaction.masterCurrencyType.count({ where: { organization_id: organization.id } });
    const currencies = await transaction.masterCurrencyType.createManyAndReturn({
      data: SAMPLE_VALUES.currencies.map((currency, index) => ({
        organization_id: organization.id,
        currency_type: currency,
        is_active: true,
        sort_order: currencyOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, currency_type: true },
    });
    currencies.forEach((item) => record("currency-type", item.id));
    const currencyIds = new Map(currencies.map((item) => [item.currency_type, item.id]));

    const buyerOffset = await transaction.masterBuyer.count({ where: { organization_id: organization.id } });
    const buyers = await transaction.masterBuyer.createManyAndReturn({
      data: SAMPLE_VALUES.buyers.map((item, index) => ({
        organization_id: organization.id,
        buyer_name: item.name,
        currency_type_id: currencyIds.get(item.currency)!,
        is_active: true,
        sort_order: buyerOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true },
    });
    buyers.forEach((item) => record("buyer", item.id));

    const vendorOffset = await transaction.masterVendor.count({ where: { organization_id: organization.id } });
    const vendors = await transaction.masterVendor.createManyAndReturn({
      data: SAMPLE_VALUES.vendors.map((vendor, index) => ({
        organization_id: organization.id,
        vendor,
        is_active: true,
        sort_order: vendorOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, vendor: true },
    });
    vendors.forEach((item) => record("vendor", item.id));

    const season = await transaction.masterSeason.create({
      data: {
        organization_id: organization.id,
        season: SAMPLE_VALUES.season,
        is_active: true,
        sort_order: await transaction.masterSeason.count({ where: { organization_id: organization.id } }),
        legacy_metadata: metadata,
      },
      select: { id: true },
    });
    record("season", season.id);

    const articleOffset = await transaction.masterArticle.count({ where: { organization_id: organization.id } });
    const articles = await transaction.masterArticle.createManyAndReturn({
      data: SAMPLE_VALUES.articles.map((article, index) => ({
        organization_id: organization.id,
        article,
        article_code: `AR-${batch.id.slice(-8).toUpperCase()}-${String(index + 1).padStart(2, "0")}`,
        is_active: true,
        sort_order: articleOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, article: true },
    });
    articles.forEach((item) => record("article", item.id));

    const colorSortOrder = await transaction.masterColor.count({ where: { organization_id: organization.id } });
    const colors = await transaction.masterColor.createManyAndReturn({
      data: SAMPLE_VALUES.colors.map((colors, index) => ({
        organization_id: organization.id,
        colors,
        is_active: true,
        sort_order: colorSortOrder + index,
        legacy_metadata: metadata,
      })),
      select: { id: true },
    });
    colors.forEach((color) => record("color", color.id));

    const sizes = await transaction.masterSize.createManyAndReturn({
      data: SAMPLE_VALUES.sizes.map((size, index) => ({
        organization_id: organization.id,
        size,
        is_active: true,
        sort_order: index,
        legacy_metadata: metadata,
      })),
      select: { id: true, size: true },
    });
    sizes.forEach((size) => record("size", size.id));

    const sizeGroupOffset = await transaction.masterSizeGroup.count({ where: { organization_id: organization.id } });
    const sizeGroups = await transaction.masterSizeGroup.createManyAndReturn({
      data: SAMPLE_VALUES.sizeGroups.map((item, index) => ({
        organization_id: organization.id,
        brand_id: brandIds.get("Blackberrys")!,
        size_group: item.name,
        is_active: true,
        sort_order: sizeGroupOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, size_group: true },
    });
    sizeGroups.forEach((item) => record("size-group", item.id));
    const sizeIds = new Map(sizes.map((item) => [item.size, item.id]));
    const sizeGroupIds = new Map(sizeGroups.map((item) => [item.size_group, item.id]));
    await transaction.masterSizeGroupSize.createMany({
      data: SAMPLE_VALUES.sizeGroups.flatMap((group) => group.sizes.map((size) => ({
        organization_id: organization.id,
        size_group_id: sizeGroupIds.get(group.name)!,
        size_id: sizeIds.get(size)!,
      }))),
    });

    const rawCategoryOffset = await transaction.masterRawMaterialCategory.count({ where: { organization_id: organization.id } });
    const rawMaterialCategories = await transaction.masterRawMaterialCategory.createManyAndReturn({
      data: SAMPLE_VALUES.rawMaterialCategories.map((item, index) => ({
        organization_id: organization.id,
        raw_material_type_id: rawMaterialType.id,
        raw_material_category: item.name,
        is_active: true,
        sort_order: rawCategoryOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, raw_material_category: true },
    });
    rawMaterialCategories.forEach((item) => record("raw-material-category", item.id));
    const rawCategoryIds = new Map(rawMaterialCategories.map((item) => [item.raw_material_category, item.id]));
    const rawSubCategoryValues = SAMPLE_VALUES.rawMaterialCategories.flatMap((category) => category.subCategories.map((name) => ({ category: category.name, name })));
    const rawSubCategoryOffset = await transaction.masterRawMaterialSubCategory.count({ where: { organization_id: organization.id } });
    const rawMaterialSubCategories = await transaction.masterRawMaterialSubCategory.createManyAndReturn({
      data: rawSubCategoryValues.map((item, index) => ({
        organization_id: organization.id,
        raw_material_category_id: rawCategoryIds.get(item.category)!,
        raw_material_sub_category: item.name,
        is_active: true,
        sort_order: rawSubCategoryOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, raw_material_sub_category: true },
    });
    rawMaterialSubCategories.forEach((item) => record("raw-material-sub-category", item.id));
    const rawSubCategoryIds = new Map(rawMaterialSubCategories.map((item) => [item.raw_material_sub_category, item.id]));

    const uomOffset = await transaction.masterUom.count({ where: { organization_id: organization.id } });
    const stockUoms = await transaction.masterUom.createManyAndReturn({
      data: SAMPLE_VALUES.stockUoms.map((uom, index) => ({
        organization_id: organization.id,
        uom,
        is_active: true,
        sort_order: uomOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true, uom: true },
    });
    stockUoms.forEach((item) => record("uom", item.id));
    const stockUomIds = new Map(stockUoms.map((item) => [item.uom, item.id]));
    const stockUomConversions = await transaction.masterStockUomConvert.createManyAndReturn({
      data: [
        ...SAMPLE_VALUES.stockUoms.map((uom, index) => ({ organization_id: organization.id, stock_uom_id: stockUomIds.get(uom)!, name: uom, how_many: "1", is_active: true, sort_order: index, legacy_metadata: metadata })),
        { organization_id: organization.id, stock_uom_id: stockUomIds.get("MTR")!, name: "BOX", how_many: "10000", is_active: true, sort_order: 1, legacy_metadata: metadata },
        { organization_id: organization.id, stock_uom_id: stockUomIds.get("MTR")!, name: "CONE", how_many: "1000", is_active: true, sort_order: 2, legacy_metadata: metadata },
      ],
      select: { id: true, name: true, stock_uom_id: true, how_many: true },
    });
    stockUomConversions.forEach((item) => record("stock-uom-convert", item.id));
    const buyingUomByStockUom = new Map(stockUomConversions.map((item) => [item.stock_uom_id, { name: item.name, howMany: Number(item.how_many) }]));

    const rawMaterialOffset = await transaction.masterRawMaterial.count({ where: { organization_id: organization.id } });
    const rawMaterials = await transaction.masterRawMaterial.createManyAndReturn({
      data: SAMPLE_VALUES.rawMaterials.map((item, index) => ({
        organization_id: organization.id,
        raw_material_name: item.name,
        raw_material_category_id: rawCategoryIds.get(item.category)!,
        raw_material_sub_category_id: rawSubCategoryIds.get(item.subCategory)!,
        stock_uom_id: stockUomIds.get(item.uom)!,
        raw_material_type_id: rawMaterialType.id,
        is_active: true,
        sort_order: rawMaterialOffset + index,
        legacy_metadata: metadata,
      })),
      select: { id: true },
    });
    rawMaterials.forEach((item) => record("raw-material", item.id));

    await lockOrganizationOrderQuantityLimit(transaction, organization.id);
    const sampleOrderCount = SAMPLE_VALUES.sampleOrders.length;
    const sampleOrderQuantity = SAMPLE_VALUES.sampleOrders.reduce(
      (total, sampleOrder) => total + normalizeDummyOrderQty(sampleOrder.orderQty),
      0,
    );
    await validateMonthlyFormLimits(
      organization.id,
      "merchandising_orders",
      sampleOrderQuantity,
      undefined,
      transaction,
      formRestriction,
      sampleOrderCount,
    );

    const orderNumbers = await reserveNextOrderNumbers(organization.id, SAMPLE_VALUES.sampleOrders.length, transaction);
    const orderRows = SAMPLE_VALUES.sampleOrders.map((sampleOrder, orderIndex) => ({
      organization_id: organization.id,
      entity_id: entity.id,
      orderNo: orderNumbers[orderIndex],
      entityName: organization.organization_name,
      category: sampleOrder.category,
      subCategory: sampleOrder.subCategory,
      season: SAMPLE_VALUES.season,
      article: sampleOrder.article,
      styleName: sampleOrder.article,
      colors: sampleOrder.color,
      buyer: sampleOrder.buyer,
      brand: sampleOrder.brand,
      sizeGroup: sampleOrder.sizeGroup,
      haveSizeRatio: false,
      orderQty: normalizeDummyOrderQty(sampleOrder.orderQty),
      deliveryDate: new Date(Date.now() + (30 + orderIndex * 3) * 24 * 60 * 60 * 1000),
      finalStatus: "Draft",
      sourceStatus: "DEMO",
    }));
    const createdSampleOrders = await transaction.merchandisingOrder.createManyAndReturn({
      data: orderRows,
      select: { id: true, orderNo: true },
    });
    if (createdSampleOrders.length !== SAMPLE_VALUES.sampleOrders.length) {
      throw new Error("Sample orders could not be created as a complete batch.");
    }
    const ordersByNumber = new Map(createdSampleOrders.map((order) => [order.orderNo, order]));
    const sampleOrdersByNumber = new Map(orderNumbers.map((orderNo, index) => [orderNo, SAMPLE_VALUES.sampleOrders[index]]));
    for (const order of createdSampleOrders) record("sample-order", order.id);

    const finishedGoodsRows: Array<{
      order_id: string;
      buyerSize: string;
      size: string;
      beforeExcessQty: number;
      excess: string;
      excessQty: number;
      totalQty: number;
    }> = [];
    const bomRows: Array<{
      order_id: string;
      categoryType: string;
      category: string;
      subCategory: string;
      rawMaterialName: string;
      stockUom: string;
      size: null;
      orderQty: string;
      buyerConsumption: string;
      buyerPrice: null;
      internalConsumption: string;
      internalPrice: null;
      valuePerGarmentRm: string;
      consumption: string;
      requiredQty: string;
      itemWiseExcessPercentage: string;
      itemWiseExcessQty: string;
      totalRequiredQty: string;
    }> = [];
    for (const [orderIndex, sampleOrder] of SAMPLE_VALUES.sampleOrders.entries()) {
      const orderNo = orderNumbers[orderIndex];
      const order = ordersByNumber.get(orderNo);
      if (!order) throw new Error("A created sample order could not be matched to its reserved order number.");

      const boundedOrderQty = normalizeDummyOrderQty(sampleOrder.orderQty);
      finishedGoodsRows.push(...createSampleFinishedGoodsRows(boundedOrderQty, sampleOrder.sizeGroup, orderIndex).map((item) => ({
        order_id: order.id,
        buyerSize: item.size,
        size: item.size,
        beforeExcessQty: item.beforeExcessQty,
        excess: "0",
        excessQty: 0,
        totalQty: item.beforeExcessQty,
      })));

      bomRows.push(...createSampleBomMaterialIndexes(orderIndex).map((materialIndex) => {
        const item = SAMPLE_VALUES.rawMaterials[materialIndex];
        return {
          order_id: order.id,
          categoryType: "Item",
          category: item.category,
          subCategory: item.subCategory,
          rawMaterialName: item.name,
          stockUom: item.uom,
          size: null,
          orderQty: String(boundedOrderQty),
          buyerConsumption: "1",
          buyerPrice: null,
          internalConsumption: "1",
          internalPrice: null,
          valuePerGarmentRm: "1",
          consumption: "1",
          requiredQty: String(boundedOrderQty),
          itemWiseExcessPercentage: "0",
          itemWiseExcessQty: "0",
          totalRequiredQty: String(boundedOrderQty),
        };
      }));
    }
    await transaction.finishedGoodsSizeWise.createMany({ data: finishedGoodsRows });
    const createdBomRows = await transaction.billOfMaterialItem.createManyAndReturn({
      data: bomRows,
      select: {
        id: true,
        order_id: true,
        category: true,
        categoryType: true,
        subCategory: true,
        rawMaterialName: true,
        stockUom: true,
        internalConsumption: true,
        internalPrice: true,
        requiredQty: true,
        totalRequiredQty: true,
      },
    });
    const procurementGroups = new Map<string, typeof createdBomRows>();
    for (const bomRow of createdBomRows) {
      const key = [bomRow.rawMaterialName, bomRow.category, bomRow.subCategory, bomRow.stockUom]
        .map((value) => String(value ?? "").trim().toLowerCase())
        .join("|");
      const group = procurementGroups.get(key) ?? [];
      group.push(bomRow);
      procurementGroups.set(key, group);
    }
    const dummyVendorIds = vendors.map((vendor) => vendor.id);
    for (const [groupIndex, rows] of [...procurementGroups.values()]
      .filter((group) => new Set(group.map((row) => row.order_id)).size > 1)
      .entries()) {
      const vendorId = dummyVendorIds[groupIndex % dummyVendorIds.length];
      const groupedPoNo = await reserveProcurementDocumentNumber(organization.id, "GROUPED_PO", transaction);
      const stockUomName = String(rows[0].stockUom ?? "");
      const conversion = buyingUomByStockUom.get(stockUomIds.get(stockUomName)!);
      const vendorPrice = 85 + groupIndex * 7;
      const lines = rows.map((row) => {
        const order = createdSampleOrders.find((sampleOrder) => sampleOrder.id === row.order_id);
        if (!order) throw new Error("A sample BOM row could not be matched to its order.");
        const sampleOrder = sampleOrdersByNumber.get(order.orderNo);
        return {
          source_bom_item_id: row.id,
          source_order_id: row.order_id,
          order_no: order.orderNo,
          style_name: sampleOrder?.article ?? null,
          brand: sampleOrder?.brand ?? null,
          category: row.category,
          category_type: row.categoryType,
          sub_category: row.subCategory,
          item_name: row.rawMaterialName,
          stock_uom: row.stockUom,
          internal_consumption: row.internalConsumption,
          internal_price_bom: row.internalPrice,
          required_qty: row.totalRequiredQty ?? row.requiredQty ?? "0",
          grouped_qty: row.totalRequiredQty ?? row.requiredQty ?? "0",
          vendor_price: vendorPrice,
          total_spend: Number(row.totalRequiredQty ?? row.requiredQty) * vendorPrice,
        };
      });
      const groupedPoInternalNo = `GPO-${batch.id}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const groupedPurchaseOrder = await transaction.groupedPurchaseOrder.create({
        data: {
          organization_id: organization.id,
          entity_id: entity.id,
          vendor_id: vendorId,
          grouped_po_no: groupedPoInternalNo,
          display_no: Number(groupedPoNo.replace("GP-", "")),
          status: "PRICE_APPROVED",
          submitted_by: userId,
          approved_by: userId,
          approved_at: new Date(),
          raw_material: rows[0].rawMaterialName,
          category_type: rows[0].categoryType,
          category: rows[0].category,
          sub_category: rows[0].subCategory,
          total_required_qty: lines.reduce((total, line) => total + Number(line.required_qty ?? 0), 0),
          total_grouped_qty: lines.reduce((total, line) => total + Number(line.grouped_qty ?? 0), 0),
          no_of_styles: new Set(lines.map((line) => line.style_name).filter(Boolean)).size,
          stock_uom: stockUomName,
          buying_uom: conversion?.name ?? stockUomName,
          convert_value: conversion?.howMany ?? 1,
          vendor_price: vendorPrice,
          vendor_price_inr: vendorPrice,
          gst: [5, 12, 18][groupIndex % 3],
          hsn_code: ["5208", "5515", "6006", "9606"][groupIndex % 4],
          buying_qty: lines.reduce((total, line) => total + Number(line.grouped_qty ?? 0), 0) / (conversion?.howMany ?? 1),
          lines: { create: lines as Prisma.GroupedPurchaseOrderLineUncheckedCreateWithoutGroupedPurchaseOrderInput[] },
        },
        select: { id: true, lines: { select: { id: true } } },
      }) as unknown as { id: string; lines: Array<{ id: string }> };
      record("grouped-purchase-order", groupedPurchaseOrder.id);
      const masterGroupNumber = await reserveProcurementDocumentNumber(organization.id, "MASTER_GROUP", transaction);
      const masterPurchaseOrder = await transaction.masterPurchaseOrder.create({
        data: {
          organization_id: organization.id,
          entity_id: entity.id,
          vendor_id: vendorId,
          master_po_no: `MPO-${batch.id}-${randomUUID().slice(0, 8).toUpperCase()}`,
          display_no: Number(masterGroupNumber.replace("MGP-", "")),
          status: "MASTER_GROUPED",
          created_by: userId,
          raw_material: rows[0].rawMaterialName,
          category: rows[0].category,
          sub_category: rows[0].subCategory,
          total_required_qty: lines.reduce((total, line) => total + Number(line.required_qty ?? 0), 0),
          total_grouped_qty: lines.reduce((total, line) => total + Number(line.grouped_qty ?? 0), 0),
          no_of_styles: new Set(lines.map((line) => line.style_name).filter(Boolean)).size,
          sourceRecords: { create: { grouped_purchase_order_id: groupedPurchaseOrder.id } },
          lines: {
            create: lines.map((line, lineIndex) => ({
              source_grouped_line_id: groupedPurchaseOrder.lines[lineIndex].id,
              source_grouped_po_no: groupedPoInternalNo,
              source_order_id: line.source_order_id,
              source_order_no: line.order_no,
              style_name: line.style_name,
              brand: line.brand,
              raw_material: line.item_name,
              stock_uom: line.stock_uom,
              category: line.category,
              sub_category: line.sub_category,
              required_qty: line.required_qty ?? "0",
              grouped_qty: line.grouped_qty ?? "0",
              vendor_price: line.vendor_price,
              total_spend: line.total_spend,
            })),
          },
        },
        select: { id: true },
      });
      record("master-purchase-order", masterPurchaseOrder.id);
    }
    const masterPurchaseOrderIds = createdRecords
      .filter((item) => item.moduleKey === "master-purchase-order")
      .map((item) => item.id);
    const seededMasters = await transaction.masterPurchaseOrder.findMany({
      where: { organization_id: organization.id, id: { in: masterPurchaseOrderIds } },
      include: {
        lines: true,
        sourceRecords: { include: { groupedPurchaseOrder: { select: { gst: true, hsn_code: true } } } },
      },
    });
    const mastersByVendor = new Map<string, typeof seededMasters>();
    for (const master of seededMasters) {
      const key = `${master.vendor_id}|${master.entity_id ?? ""}`;
      const group = mastersByVendor.get(key) ?? [];
      group.push(master);
      mastersByVendor.set(key, group);
    }
    for (const masters of mastersByVendor.values()) {
      const purchaseOrderNumber = await reserveProcurementDocumentNumber(organization.id, "PURCHASE_ORDER", transaction);
      const purchaseOrderLines = masters.map((master) => {
        const sourceValues = master.sourceRecords.flatMap((source) => [source.groupedPurchaseOrder.gst, source.groupedPurchaseOrder.hsn_code]);
        const gst = sourceValues.find((value) => value !== null && typeof value !== "string") ?? null;
        const hsnCode = sourceValues.find((value): value is string => typeof value === "string") ?? null;
        const quantity = master.lines.reduce((total, line) => total + Number(line.grouped_qty), 0);
        const price = master.lines.find((line) => line.vendor_price !== null)?.vendor_price ?? null;
        const total = master.lines.reduce((sum, line) => sum + Number(line.total_spend ?? (Number(line.grouped_qty) * Number(line.vendor_price ?? 0))), 0);
        return {
          source_master_line_id: master.lines[0]?.id ?? master.id,
          master_purchase_order_id: master.id,
          raw_material: master.raw_material,
          category: master.category,
          sub_category: master.sub_category,
          source_order_no: null,
          style_name: null,
          quantity,
          price,
          gst,
          hsn_code: hsnCode,
          total,
        };
      });
      const purchaseOrder = await transaction.purchaseOrder.create({
        data: {
          organization_id: organization.id,
          entity_id: masters[0].entity_id,
          vendor_id: masters[0].vendor_id,
          purchase_order_no: `PO-${batch.id}-${randomUUID().slice(0, 8).toUpperCase()}`,
          display_no: Number(purchaseOrderNumber.replace("PO-", "")),
          status: "PENDING_APPROVAL",
          created_by: userId,
          sources: { create: masters.map((master) => ({ master_purchase_order_id: master.id })) },
          lines: { create: purchaseOrderLines },
        },
        select: { id: true, purchase_order_no: true },
      });
      await transaction.approvalRequest.create({
        data: {
          organization_id: organization.id,
          module_key: "purchase-order",
          module_name: "Purchase Order Approval",
          entity_type: "purchase-order",
          entity_key: purchaseOrder.purchase_order_no,
          entity_label: purchaseOrder.purchase_order_no,
          entity_ref_id: purchaseOrder.id,
          requested_by: requestedBy,
          status: "pending",
          notes: `Purchase Order ${purchaseOrder.purchase_order_no} is waiting for approval.`,
        },
      });
      record("purchase-order", purchaseOrder.id);
    }
    const sampleOrder = ordersByNumber.get(orderNumbers[0]);
    if (!sampleOrder) throw new Error("The first sample order was not created.");

    await transaction.organizationDummyDataBatch.update({
      where: { id: batch.id, organization_id: organization.id },
      data: {
        status: "ACTIVE",
        sample_order_id: sampleOrder.id,
        master_record_ids: [
          ...createdRecords.map((record) => ({ ...record })),
          { datasetVersion: SAMPLE_DATASET_VERSION },
        ] as Prisma.InputJsonArray,
      },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: userId,
        module: "Organization Settings",
        action: "CREATE_DUMMY_DATA",
        entity_type: "OrganizationDummyDataBatch",
        entity_id: batch.id,
        details: {
          order_no: sampleOrder.orderNo,
          order_count: createdSampleOrders.length,
          order_nos: createdSampleOrders.map((order) => order.orderNo),
          master_count: createdRecords.filter((item) => item.moduleKey !== "sample-order").length,
        },
      },
    });

    return { created: true, orderNo: sampleOrder.orderNo, orderCount: createdSampleOrders.length };
  }, { maxWait: 20000, timeout: 120000 });
}

export async function deleteOrganizationDummyData(userId: string, routeOrganizationId: string) {
  const organization = await authorizeOrganization(userId, routeOrganizationId);

  try {
    return await prisma.$transaction(async (transaction) => {
    const batch = await transaction.organizationDummyDataBatch.findUnique({
      where: { organization_id: organization.id },
    });
    if (!batch || batch.status === "EMPTY") return { deleted: false };
    if (batch.status !== "ACTIVE") {
      throw new Error("Dummy-data cleanup is already in progress. Refresh the page and try again.");
    }

    const createdRecords = readMasterRecordIds(batch.master_record_ids);
    const ids = (moduleKey: string) => createdRecords.filter((record) => record.moduleKey === moduleKey).map((record) => record.id);
    const categoryIds = ids("category");
    const sizeGroupIds = ids("size-group");

    const claimed = await transaction.organizationDummyDataBatch.updateMany({
      where: { id: batch.id, organization_id: organization.id, status: "ACTIVE" },
      data: { status: "DELETING" },
    });
    if (claimed.count !== 1) {
      throw new Error("Dummy-data cleanup has already started. Refresh the page and try again.");
    }
    const sampleOrderIds = [...new Set([
      ...ids("sample-order"),
      ...(batch.sample_order_id ? [batch.sample_order_id] : []),
    ])];
    const sampleVendorIds = ids("vendor");
    let sampleGroupedPurchaseOrderIds = ids("grouped-purchase-order");
    let sampleMasterPurchaseOrderIds = ids("master-purchase-order");
    if (sampleOrderIds.length > 0) {
      const sampleWorkOrderWhere = {
        workOrder: {
          organization_id: organization.id,
          order_id: { in: sampleOrderIds },
        },
      };
      await transaction.factoryDailyProductionReportLine.deleteMany({ where: sampleWorkOrderWhere });
      await transaction.factoryGrn.deleteMany({
        where: { organization_id: organization.id, ...sampleWorkOrderWhere },
      });
      await transaction.workOrderProcessController.deleteMany({ where: sampleWorkOrderWhere });
      await transaction.factoryWorkOrder.deleteMany({
        where: { organization_id: organization.id, order_id: { in: sampleOrderIds } },
      });
    }
    const linkedGroupedPurchaseOrders = await transaction.groupedPurchaseOrder.findMany({
      where: {
        organization_id: organization.id,
        OR: [
          ...(sampleGroupedPurchaseOrderIds.length > 0 ? [{ id: { in: sampleGroupedPurchaseOrderIds } }] : []),
          ...(sampleOrderIds.length > 0 ? [{ lines: { some: { source_order_id: { in: sampleOrderIds } } } }] : []),
          ...(sampleVendorIds.length > 0 ? [{ vendor_id: { in: sampleVendorIds } }] : []),
        ],
      },
      select: { id: true },
    });
    sampleGroupedPurchaseOrderIds = [...new Set([
      ...sampleGroupedPurchaseOrderIds,
      ...linkedGroupedPurchaseOrders.map((order) => order.id),
    ])];
    const linkedMasterPurchaseOrders = await transaction.masterPurchaseOrder.findMany({
      where: {
        organization_id: organization.id,
        OR: [
          ...(sampleMasterPurchaseOrderIds.length > 0 ? [{ id: { in: sampleMasterPurchaseOrderIds } }] : []),
          ...(sampleOrderIds.length > 0 ? [{ lines: { some: { source_order_id: { in: sampleOrderIds } } } }] : []),
          ...(sampleGroupedPurchaseOrderIds.length > 0 ? [{ sourceRecords: { some: { grouped_purchase_order_id: { in: sampleGroupedPurchaseOrderIds } } } }] : []),
          ...(sampleVendorIds.length > 0 ? [{ vendor_id: { in: sampleVendorIds } }] : []),
        ],
      },
      select: { id: true },
    });
    sampleMasterPurchaseOrderIds = [...new Set([
      ...sampleMasterPurchaseOrderIds,
      ...linkedMasterPurchaseOrders.map((order) => order.id),
    ])];
    await transaction.purchaseOrder.deleteMany({
      where: {
        organization_id: organization.id,
        OR: [
          ...((ids("purchase-order").length > 0) ? [{ id: { in: ids("purchase-order") } }] : []),
          ...(sampleMasterPurchaseOrderIds.length > 0 ? [{ sources: { some: { master_purchase_order_id: { in: sampleMasterPurchaseOrderIds } } } }] : []),
          ...(sampleVendorIds.length > 0 ? [{ vendor_id: { in: sampleVendorIds } }] : []),
        ],
      },
    });
    const samplePurchaseOrderIds = ids("purchase-order");
    if (samplePurchaseOrderIds.length > 0) {
      await transaction.approvalRequest.deleteMany({
        where: {
          organization_id: organization.id,
          entity_type: "purchase-order",
          entity_ref_id: { in: samplePurchaseOrderIds },
        },
      });
    }
    await transaction.masterPurchaseOrder.deleteMany({
      where: {
        organization_id: organization.id,
        OR: [
          ...(sampleMasterPurchaseOrderIds.length > 0 ? [{ id: { in: sampleMasterPurchaseOrderIds } }] : []),
          ...(sampleVendorIds.length > 0 ? [{ vendor_id: { in: sampleVendorIds } }] : []),
        ],
      },
    });
    await transaction.groupedPurchaseOrder.deleteMany({
      where: {
        organization_id: organization.id,
        OR: [
          ...(sampleGroupedPurchaseOrderIds.length > 0 ? [{ id: { in: sampleGroupedPurchaseOrderIds } }] : []),
          ...(sampleVendorIds.length > 0 ? [{ vendor_id: { in: sampleVendorIds } }] : []),
        ],
      },
    });
    if (sampleOrderIds.length > 0) {
      await transaction.merchandisingOrder.deleteMany({
        where: { id: { in: sampleOrderIds }, organization_id: organization.id },
      });
    }
    await transaction.masterRawMaterial.deleteMany({ where: { organization_id: organization.id, id: { in: ids("raw-material") } } });
    await transaction.masterRawMaterialSubCategory.deleteMany({ where: { organization_id: organization.id, id: { in: ids("raw-material-sub-category") } } });
    await transaction.masterRawMaterialCategory.deleteMany({ where: { organization_id: organization.id, id: { in: ids("raw-material-category") } } });
    if (sizeGroupIds.length > 0) {
      await transaction.masterSizeGroupSize.deleteMany({
        where: { organization_id: organization.id, size_group_id: { in: sizeGroupIds } },
      });
      await transaction.masterSizeGroup.deleteMany({ where: { organization_id: organization.id, id: { in: sizeGroupIds } } });
    }
    await transaction.masterSize.deleteMany({ where: { organization_id: organization.id, id: { in: ids("size") } } });
    await transaction.masterSubCategory.deleteMany({ where: { organization_id: organization.id, id: { in: ids("sub-category") }, ...(categoryIds.length > 0 ? { category_id: { in: categoryIds } } : {}) } });
    await transaction.masterCategory.deleteMany({ where: { organization_id: organization.id, id: { in: categoryIds } } });
    await transaction.masterBrand.deleteMany({ where: { organization_id: organization.id, id: { in: ids("brand") } } });
    await transaction.masterBuyer.deleteMany({ where: { organization_id: organization.id, id: { in: ids("buyer") } } });
    await transaction.masterVendor.deleteMany({ where: { organization_id: organization.id, id: { in: ids("vendor") } } });
    await transaction.masterCurrencyType.deleteMany({ where: { organization_id: organization.id, id: { in: ids("currency-type") } } });
    await transaction.masterSeason.deleteMany({ where: { organization_id: organization.id, id: { in: ids("season") } } });
    await transaction.masterArticle.deleteMany({ where: { organization_id: organization.id, id: { in: ids("article") } } });
    await transaction.masterColor.deleteMany({ where: { organization_id: organization.id, id: { in: ids("color") } } });
    await transaction.masterStockUomConvert.deleteMany({ where: { organization_id: organization.id, id: { in: ids("stock-uom-convert") } } });
    await transaction.masterUom.deleteMany({ where: { organization_id: organization.id, id: { in: ids("uom") } } });

    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: userId,
        module: "Organization Settings",
        action: "DELETE_DUMMY_DATA",
        entity_type: "OrganizationDummyDataBatch",
        entity_id: batch.id,
        details: { master_count: createdRecords.length },
      },
    });
    await transaction.organizationDummyDataBatch.update({
      where: { id: batch.id, organization_id: organization.id },
      data: { status: "EMPTY", sample_order_id: null, master_record_ids: Prisma.JsonNull },
    });

    return { deleted: true };
    }, { maxWait: 10000, timeout: 30000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new Error("A real organization record still references a demo master. Update that record before deleting the dummy dataset.");
    }
    throw error;
  }
}

function hasCurrentSampleDatasetVersion(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) && value.some((record) =>
    typeof record === "object"
    && record !== null
    && !Array.isArray(record)
    && "datasetVersion" in record
    && record.datasetVersion === SAMPLE_DATASET_VERSION,
  );
}