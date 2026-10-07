import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { ensureDefaultProcessTemplate } from "@/lib/services/organizations/organization-process-template-service";
import { reserveNextOrderNumbers } from "@/lib/services/orders/order-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";
import { createGroupedPurchaseOrder } from "@/lib/services/orders/grouped-purchase-order-service";
import { createMasterPurchaseOrder } from "@/lib/services/orders/master-purchase-order-service";
import { generatePurchaseOrders, submitPurchaseOrderForApproval } from "@/lib/services/orders/purchase-order-service";
import { createDummySampleGateEntries } from "@/lib/services/inventory/dummy-sample-gate-entry-service";
import { createDummySampleGrns } from "@/lib/services/inventory/dummy-sample-grn-service";
import { verifyDummySampleGrns } from "@/lib/services/inventory/dummy-sample-verification-service";
import { allocateDummySampleGrnsTopDown } from "@/lib/services/inventory/dummy-sample-allocation-service";
import { createWorkOrdersForSampleOrders } from "@/lib/services/factory/work-order-service";
import { createRawMaterialStockBookings } from "@/lib/services/inventory/rm-stock-booking-service";
import { lockOrganizationOrderQuantityLimit } from "@/lib/services/platform/order-quantity-limit-service";
import {
  getEffectiveSegmentFormRestriction,
  validateMonthlyFormLimits,
  validateRestrictedFormFields,
} from "@/lib/services/platform/segment-form-restriction-service";

type DemoMasterRecord = { moduleKey: string; id: string; sourceType?: "STOCK" | "VENDOR" };
const SAMPLE_DATASET_VERSION = "apparel-10-orders-2026-10";
const MAX_DUMMY_ORDER_QTY = 4000;

function normalizeDummyOrderQty(orderQty: number) {
  return Math.min(Math.max(orderQty, 0), MAX_DUMMY_ORDER_QTY);
}

function shuffleSampleVendorIds(vendorIds: string[], batchId: string) {
  const shuffled = [...vendorIds];
  let seed = createHash("sha256").update(batchId).digest().readUInt32BE(0);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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
    "DEMO VENDOR NORTH",
    "DEMO VENDOR SOUTH",
    "DEMO VENDOR EAST",
    "DEMO VENDOR WEST",
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
    const { moduleKey, id, sourceType } = record;
    return typeof moduleKey === "string" && typeof id === "string"
      ? [{
          moduleKey,
          id,
          ...(sourceType === "STOCK" || sourceType === "VENDOR" ? { sourceType } : {}),
        }]
      : [];
  });
}

export function getDummyDataWorkflowSummary(status?: string | null, stage?: string | null, workOrdersComplete = false) {
  const normalizedStatus = String(status ?? "").toUpperCase();
  const normalizedStage = String(stage ?? "").toUpperCase();

  if (normalizedStatus === "AWAITING_GROUPED_APPROVAL" || normalizedStage === "GROUPED_APPROVAL") {
    return {
      title: "Grouped approval pending",
      detail: "Waiting for every sample grouped purchase order to receive price approval before creating master groups.",
      isPaused: true,
    };
  }

  if (normalizedStatus === "AWAITING_PO_APPROVAL" || normalizedStage === "PO_APPROVAL") {
    return {
      title: "Purchase order approval pending",
      detail: "Waiting for all sample purchase orders to be approved before receipts can be generated.",
      isPaused: true,
    };
  }

  if ((normalizedStatus === "ACTIVE" || normalizedStage === "COMPLETE") && workOrdersComplete) {
    return {
      title: "Setup complete",
      detail: "The sample dataset is active, its staged approvals and receipts are complete, and five sample work orders are ready.",
      isPaused: false,
    };
  }

  if (normalizedStatus === "ACTIVE" || normalizedStage === "COMPLETE" || normalizedStage === "CREATE_WORK_ORDERS") {
    return {
      title: "Create sample work orders",
      detail: "Step 9: the sample order, procurement, receipt, verification, and allocation steps are complete. Create work orders for at least five sample orders to finish setup.",
      isPaused: false,
    };
  }

  if (normalizedStatus === "EMPTY") {
    return {
      title: "Not created",
      detail: "No sample dataset exists for this organization yet.",
      isPaused: false,
    };
  }

  if (normalizedStatus === "SCHEMA_NOT_READY") {
    return {
      title: "Database update required",
      detail: "The dummy-data tracking tables are not available yet. Deploy the schema migration before creating sample records.",
      isPaused: false,
    };
  }

  if (normalizedStatus === "DELETING") {
    return {
      title: "Removing sample data",
      detail: "The sample dataset is being cleaned up and cannot be resumed until deletion completes.",
      isPaused: true,
    };
  }

  return {
    title: normalizedStatus ? normalizedStatus.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Sample data setup",
    detail: "The sample dataset is currently in progress. Refresh the page after the staged approval gate advances.",
    isPaused: normalizedStatus !== "ACTIVE",
  };
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
      select: { id: true, status: true, stage: true, checkpoint: true, last_error: true, sample_order_id: true, master_record_ids: true, created_at: true },
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
  const groupedPurchaseOrderIds = batchRecords
    .filter((record) => record.moduleKey === "grouped-purchase-order")
    .map((record) => record.id);
  const groupedPurchaseOrderRows = groupedPurchaseOrderIds.length === 0 ? [] : await prisma.groupedPurchaseOrder.findMany({
    where: { organization_id: organization.id, id: { in: groupedPurchaseOrderIds } },
    select: {
      id: true,
      grouped_po_no: true,
      status: true,
      vendor_price: true,
      gst: true,
      hsn_code: true,
      buying_uom: true,
    },
    orderBy: { grouped_po_no: "asc" },
  });
  const groupedPurchaseOrders = groupedPurchaseOrderRows.map((order) => ({
    ...order,
    vendor_price: order.vendor_price?.toString() ?? null,
    gst: order.gst?.toString() ?? null,
  }));
  const masterGroupCount = batchRecords.filter((record) => record.moduleKey === "master-purchase-order").length;
  const purchaseOrderIds = batchRecords
    .filter((record) => record.moduleKey === "purchase-order")
    .map((record) => record.id);
  const purchaseOrders = purchaseOrderIds.length === 0 ? [] : await prisma.purchaseOrder.findMany({
    where: { organization_id: organization.id, id: { in: purchaseOrderIds } },
    select: { id: true, status: true },
  });
  const purchaseOrderCount = purchaseOrders.length;
  const purchaseOrdersApproved = purchaseOrderCount === 10
    && purchaseOrders.every((order) => ["APPROVED", "SHARED"].includes(order.status));
  const gateEntryIds = batchRecords
    .filter((record) => record.moduleKey === "gate-entry")
    .map((record) => record.id);
  const gateEntries = gateEntryIds.length === 0 ? [] : await prisma.gateEntry.findMany({
    where: { organization_id: organization.id, id: { in: gateEntryIds } },
    select: { id: true, purchase_order_id: true },
  });
  const requiredGatePurchaseOrderIds = new Set(purchaseOrderIds.slice(0, 5));
  const gateEntriesComplete = gateEntries.length === 5
    && new Set(gateEntries.map((entry) => entry.purchase_order_id)).size === 5
    && gateEntries.every((entry) => requiredGatePurchaseOrderIds.has(entry.purchase_order_id ?? ""));
  const sampleGrnIds = batchRecords
    .filter((record) => record.moduleKey === "inventory-receipt")
    .map((record) => record.id);
  const sampleGrns = sampleGrnIds.length === 0 ? [] : await prisma.inventoryReceipt.findMany({
    where: { organization_id: organization.id, id: { in: sampleGrnIds } },
    select: {
      id: true,
      purchase_order_id: true,
      lines: {
        select: {
          id: true,
          rmGrnVerification: {
            select: {
              id: true,
              allocations: {
                select: {
                  id: true,
                  verification_allocated: true,
                  orderAllocations: { select: { allocated_quantity: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  const sampleGrnsComplete = sampleGrns.length === 5
    && new Set(sampleGrns.map((receipt) => receipt.purchase_order_id)).size === 5
    && sampleGrns.every((receipt) => requiredGatePurchaseOrderIds.has(receipt.purchase_order_id));
  const verificationLineCount = sampleGrns.reduce((total, receipt) => total + receipt.lines.length, 0);
  const verifiedLineCount = sampleGrns.reduce(
    (total, receipt) => total + receipt.lines.filter((line) =>
      line.rmGrnVerification?.allocations.some((allocation) => allocation.verification_allocated.greaterThan(0)),
    ).length,
    0,
  );
  const verificationAllocations = sampleGrns.flatMap((receipt) =>
    receipt.lines.flatMap((line) => line.rmGrnVerification?.allocations ?? []),
  ).filter((allocation) => allocation.verification_allocated.greaterThan(0));
  const completedOrderAllocations = verificationAllocations.filter((allocation) => {
    const totalAllocated = allocation.orderAllocations.reduce(
      (total, orderAllocation) => total.plus(orderAllocation.allocated_quantity),
      new Prisma.Decimal(0),
    );
    return totalAllocated.greaterThanOrEqualTo(allocation.verification_allocated);
  }).length;
  const sampleAllocationsComplete = verificationAllocations.length > 0
    && completedOrderAllocations === verificationAllocations.length;
  const sampleGrnsVerified = sampleGrnsComplete
    && verificationLineCount > 0
    && sampleGrns.every((receipt) => receipt.lines.length > 0)
    && verifiedLineCount === verificationLineCount;
  const sampleWorkOrderIds = batchRecords
    .filter((record) => record.moduleKey === "sample-work-order")
    .map((record) => record.id);
  const sampleOrderIds = batchRecords
    .filter((record) => record.moduleKey === "sample-order")
    .map((record) => record.id);
  const sampleWorkOrders = sampleWorkOrderIds.length === 0 ? [] : await prisma.factoryWorkOrder.findMany({
    where: {
      organization_id: organization.id,
      id: { in: sampleWorkOrderIds },
      order_id: { in: sampleOrderIds },
    },
    select: { id: true, order_id: true },
  });
  const sampleWorkOrderOrderCount = new Set(sampleWorkOrders.map((workOrder) => workOrder.order_id)).size;
  const sampleWorkOrdersComplete = sampleWorkOrderOrderCount >= 5;
  const stepOneComplete = batch?.status !== "EMPTY"
    && Boolean(batch?.sample_order_id)
    && orderCount === 10;
  const completedSteps = [
    ...(stepOneComplete ? [1] : []),
    ...(groupedPurchaseOrders.length >= 10 ? [2] : []),
    ...(groupedPurchaseOrders.length >= 10 && groupedPurchaseOrders.every((order) => ["PRICE_APPROVED", "MASTER_GROUPED"].includes(order.status)) ? [3] : []),
    ...(masterGroupCount === groupedPurchaseOrders.length && masterGroupCount >= 10 ? [4] : []),
    ...(purchaseOrdersApproved ? [5] : []),
    ...(gateEntriesComplete && sampleGrnsComplete ? [6] : []),
    ...(gateEntriesComplete && sampleGrnsComplete && sampleGrnsVerified ? [7] : []),
    ...(gateEntriesComplete && sampleGrnsComplete && sampleGrnsVerified && sampleAllocationsComplete ? [8] : []),
    ...(sampleAllocationsComplete && sampleWorkOrdersComplete ? [9] : []),
  ];
  const currentStep = completedSteps.includes(9) ? 9
    : completedSteps.includes(8) ? 9
    : completedSteps.includes(7) ? 8
      : completedSteps.includes(6) ? 7
        : completedSteps.includes(5) ? 6
          : completedSteps.includes(4) ? 5
            : completedSteps.includes(3) ? 4
              : completedSteps.includes(2) ? 3
                : completedSteps.includes(1) ? 2
                  : 1;

  return {
    status: batch?.status ?? "EMPTY",
    stage: batch?.stage ?? "IDLE",
    checkpoint: batch?.checkpoint ?? {},
    error: batch?.last_error ?? null,
    createdAt: batch?.created_at ?? null,
    orderNo,
    orderCount,
    masterCount: batchRecords.filter((record) => !["sample-order", "raw-material-stock"].includes(record.moduleKey)).length,
    groupedPurchaseOrders,
    completedSteps,
    currentStep,
    sampleWorkOrderCount: sampleWorkOrderOrderCount,
    masterGroupCount,
    purchaseOrderCount,
    purchaseOrdersApproved,
    gateEntryCount: gateEntries.length,
    grnCount: sampleGrns.length,
    verificationLineCount,
    verifiedLineCount,
    verificationAllocationCount: verificationAllocations.length,
    completedOrderAllocationCount: completedOrderAllocations,
    sampleTermsPrepared: isCheckpointFlag(batch?.checkpoint, "sampleTermsPrepared"),
  };
}

function isCheckpointFlag(value: Prisma.JsonValue | undefined, key: string) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && value[key] === true;
}

export async function createOrganizationDummyData(userId: string, routeOrganizationId: string, requestedBy = userId) {
  return createOrganizationDummyDataForUser(userId, routeOrganizationId, false, requestedBy, true);
}

export async function createOrganizationDummyDataForNewOrganization(userId: string, routeOrganizationId: string, requestedBy = userId) {
  return createOrganizationDummyDataForUser(userId, routeOrganizationId, true, requestedBy, true);
}

export async function startOrganizationDummyDataAfterApproval(organizationId: string) {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, is_active: true, approval_status: "APPROVED" },
    select: {
      organization_id: true,
      memberships: {
        where: { role: "OWNER", is_active: true },
        select: { workspace_user_id: true },
        take: 1,
      },
    },
  });
  if (!organization?.memberships[0]) {
    throw new Error("An approved organization owner is required to start sample-data setup.");
  }

  const existingBatch = await prisma.organizationDummyDataBatch.findUnique({
    where: { organization_id: organizationId },
    select: { id: true },
  });
  if (existingBatch) return { created: false, reason: "Sample-data setup was already started for this organization." };

  return startDummyDataWizardStep(
    organization.memberships[0].workspace_user_id,
    organization.organization_id,
    1,
  );
}

async function createOrganizationDummyDataForUser(
  userId: string,
  routeOrganizationId: string,
  allowPendingOwner: boolean,
  requestedBy: string,
  startStagedWorkflow = false,
) {
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
    select: { status: true, stage: true, master_record_ids: true },
  });
  if (existingBatch?.status === "ACTIVE" && !hasCurrentSampleDatasetVersion(existingBatch.master_record_ids)) {
    await deleteOrganizationDummyData(userId, routeOrganizationId);
  }
  if (existingBatch && existingBatch.status !== "EMPTY" && existingBatch.status !== "ACTIVE") {
    return getOrganizationDummyDataStatus(userId, routeOrganizationId).then((status) => ({
      created: false,
      orderNo: status.orderNo,
      orderCount: status.orderCount ?? 0,
      status: status.status,
      stage: status.stage,
    }));
  }

  const result = await prisma.$transaction(async (transaction) => {
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

    const existingCurrentStoreVendor = await transaction.masterVendor.findFirst({
      where: { organization_id: organization.id, is_current_store: true },
      select: { id: true, is_active: true },
    });
    if (existingCurrentStoreVendor && !existingCurrentStoreVendor.is_active) {
      throw new Error("An inactive vendor is marked as the current store. Activate it before creating sample data.");
    }
    const sampleCurrentStoreVendor = existingCurrentStoreVendor
      ? null
      : `${organization.organization_name} - Current Store`;
    const metadata = { dummyDataBatchId: batch.id } satisfies Prisma.InputJsonObject;
    const [categoryConflicts, subCategoryConflicts, brandConflicts, buyerConflicts, currencyConflicts, vendorConflicts, seasonConflict, articleConflicts, colorConflicts, sizeConflicts, sizeGroupConflicts, rawCategoryConflicts, rawSubCategoryConflicts, stockUomConflicts, rawMaterialConflicts] = await Promise.all([
      transaction.masterCategory.findMany({ where: { organization_id: organization.id, category_name: { in: [...SAMPLE_VALUES.categories] } }, select: { id: true } }),
      transaction.masterSubCategory.findMany({ where: { organization_id: organization.id, sub_category: { in: SAMPLE_VALUES.subCategories.map((item) => item.name) } }, select: { id: true } }),
      transaction.masterBrand.findMany({ where: { organization_id: organization.id, brand: { in: [...SAMPLE_VALUES.brands] } }, select: { id: true } }),
      transaction.masterBuyer.findMany({ where: { organization_id: organization.id, buyer_name: { in: SAMPLE_VALUES.buyers.map((item) => item.name) } }, select: { id: true } }),
      transaction.masterCurrencyType.findMany({ where: { organization_id: organization.id, currency_type: { in: [...SAMPLE_VALUES.currencies] } }, select: { id: true } }),
      transaction.masterVendor.findMany({
        where: {
          organization_id: organization.id,
          vendor: { in: [...SAMPLE_VALUES.vendors, ...(sampleCurrentStoreVendor ? [sampleCurrentStoreVendor] : [])] },
        },
        select: { id: true },
      }),
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
    const activeStockLocation = await transaction.masterLocation.findFirst({
      where: {
        organization_id: organization.id,
        entity_id: entity.id,
        is_active: true,
        entity: { is_active: true },
      },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const stockLocation = activeStockLocation ?? await transaction.masterLocation.create({
      data: {
        organization_id: organization.id,
        entity_id: entity.id,
        location_name: `Sample Data Store - ${batch.id.slice(-6)}`,
        is_active: true,
        sort_order: 0,
        legacy_metadata: metadata,
      },
      select: { id: true },
    });
    if (!activeStockLocation) record("location", stockLocation.id);
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
      data: [
        ...SAMPLE_VALUES.vendors.map((vendor) => ({ vendor, is_current_store: false })),
        ...(sampleCurrentStoreVendor ? [{ vendor: sampleCurrentStoreVendor, is_current_store: true }] : []),
      ].map((item, index) => ({
        organization_id: organization.id,
        vendor: item.vendor,
        is_current_store: item.is_current_store,
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
    const sampleStock = await transaction.rawMaterialStock.createManyAndReturn({
      data: rawMaterials.flatMap((rawMaterial, index) => {
        const sampleMaterial = SAMPLE_VALUES.rawMaterials[index];
        if (sampleMaterial.category === "SERVICE") return [];
        const quantity = sampleMaterial.uom === "MTR"
          ? 250 + (index % 5) * 25
          : sampleMaterial.uom === "KG"
            ? 50 + (index % 4) * 10
            : 500 + (index % 6) * 100;
        return [{
          organization_id: organization.id,
          entity_id: entity.id,
          location_id: stockLocation.id,
          raw_material: sampleMaterial.name,
          quantity_on_hand: new Prisma.Decimal(quantity),
          source_type: "MANUAL",
        }];
      }),
      select: { id: true },
    });
    sampleStock.forEach((item) => record("raw-material-stock", item.id));

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
    const processTemplateId = await ensureDefaultProcessTemplate(transaction, organization.id);
    const orderRows = SAMPLE_VALUES.sampleOrders.map((sampleOrder, orderIndex) => ({
      organization_id: organization.id,
      process_template_id: processTemplateId,
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

    if (startStagedWorkflow) {
      const sampleOrder = ordersByNumber.get(orderNumbers[0]);
      if (!sampleOrder) throw new Error("The first sample order was not created.");
      const trackedRecords = [
        ...createdRecords.map((item) => ({ ...item })),
        { datasetVersion: SAMPLE_DATASET_VERSION },
      ] as Prisma.InputJsonArray;
      await transaction.organizationDummyDataBatch.update({
        where: { id: batch.id, organization_id: organization.id },
        data: {
          status: "IN_PROGRESS",
          stage: "CREATE_GROUPS",
          last_error: null,
          sample_order_id: sampleOrder.id,
          master_record_ids: trackedRecords,
          checkpoint: {
            orderIds: createdSampleOrders.map((order) => order.id),
            vendorIds: vendors.map((vendor) => vendor.id),
            requestedBy,
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          organization_id: organization.id,
          user_id: userId,
          module: "Organization Settings",
          action: "CREATE_DUMMY_DATA_STAGE",
          entity_type: "OrganizationDummyDataBatch",
          entity_id: batch.id,
          details: {
            stage: "CREATE_GROUPS",
            order_count: createdSampleOrders.length,
            raw_material_stock_count: sampleStock.length,
            raw_material_stock_source: "MANUAL",
            stock_location_id: stockLocation.id,
          },
        },
      });
      return {
        created: true,
        orderNo: sampleOrder.orderNo,
        orderCount: createdSampleOrders.length,
        status: "IN_PROGRESS",
        stage: "CREATE_GROUPS",
        batchId: batch.id,
        createdRecords,
        createdSampleOrders,
        vendors,
        createdBomRows,
      };
    }

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
  }, { maxWait: 20000, timeout: 150000 });

  return result;
}

async function createSampleGroupedPurchaseOrders(
  organizationId: string,
  batchId: string,
  userId: string,
  orderNo?: string,
  orderCount?: number,
  initialRecords?: DemoMasterRecord[],
  sampleOrders?: Array<{ id: string; orderNo: string }>,
  vendors?: Array<{ id: string; vendor: string }>,
  bomRows?: Array<{
    id: string;
    order_id: string;
    category: string | null;
    categoryType: string | null;
    subCategory: string | null;
    rawMaterialName: string | null;
    stockUom: string | null;
    requiredQty: Prisma.Decimal | string | null;
    totalRequiredQty: Prisma.Decimal | string | null;
  }>,
) {
  const needsReload = !initialRecords || !sampleOrders || !vendors || !bomRows;
  const batch = needsReload ? await prisma.organizationDummyDataBatch.findUnique({
    where: { id: batchId, organization_id: organizationId },
    select: { sample_order_id: true, master_record_ids: true },
  }) : null;
  if (needsReload && !batch) throw new Error("Sample-data checkpoint was not found.");
  const records = initialRecords ?? readMasterRecordIds(batch!.master_record_ids);
  const sampleOrderRecords = sampleOrders ?? await prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId, id: { in: records.filter((record) => record.moduleKey === "sample-order").map((record) => record.id) } },
    select: { id: true, orderNo: true },
  });
  if (sampleOrderRecords.length !== 10) throw new Error("Ten sample orders are required to resume grouped-PO creation.");
  const vendorRecords = vendors ?? await prisma.masterVendor.findMany({
    where: { organization_id: organizationId, id: { in: records.filter((record) => record.moduleKey === "vendor").map((record) => record.id) } },
    select: { id: true, vendor: true },
  });
  const bomRecords = bomRows ?? await prisma.billOfMaterialItem.findMany({
    where: { order_id: { in: sampleOrderRecords.map((order) => order.id) }, order: { organization_id: organizationId } },
    select: {
      id: true,
      order_id: true,
      category: true,
      categoryType: true,
      subCategory: true,
      rawMaterialName: true,
      stockUom: true,
      requiredQty: true,
      totalRequiredQty: true,
    },
  });
  const firstOrderNo = orderNo ?? sampleOrderRecords[0]?.orderNo;
  if (!firstOrderNo) throw new Error("The first sample order number could not be loaded.");
  const rowsByMaterial = new Map<string, typeof bomRecords>();
  for (const row of bomRecords) {
    const key = [row.rawMaterialName, row.category, row.subCategory, row.stockUom]
      .map((value) => String(value ?? "").trim().toLowerCase())
      .join("|");
    const rows = rowsByMaterial.get(key) ?? [];
    rows.push(row);
    rowsByMaterial.set(key, rows);
  }

  const eligibleGroups = [...rowsByMaterial.entries()]
    .filter(([, rows]) => new Set(rows.map((row) => row.order_id)).size > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 10);
  if (eligibleGroups.length !== 10) {
    throw new Error("The sample BOM does not contain ten multi-order procurement groups.");
  }

  const vendorByName = new Map(vendorRecords.map((vendor) => [vendor.vendor, vendor.id]));
  const sampleVendorIds = SAMPLE_VALUES.vendors.map((vendorName) => vendorByName.get(vendorName));
  const orderedVendorIds = sampleVendorIds.every((vendorId): vendorId is string => Boolean(vendorId))
    ? shuffleSampleVendorIds(sampleVendorIds, batchId)
    : sampleVendorIds;
  if (orderedVendorIds.some((vendorId) => !vendorId) || new Set(orderedVendorIds).size !== 10) {
    throw new Error("Ten distinct sample vendors are required before procurement can be created.");
  }

  const trackedRecords = [...records];
  const groupedPurchaseOrderIds = trackedRecords
    .filter((record) => record.moduleKey === "grouped-purchase-order")
    .map((record) => record.id);
  const bookedQuantityByBomId = new Map<string, Prisma.Decimal>();
  const sampleStockIds = records
    .filter((record) => record.moduleKey === "raw-material-stock")
    .map((record) => record.id);
  const sampleStocks = sampleStockIds.length === 0 ? [] : await prisma.rawMaterialStock.findMany({
    where: { organization_id: organizationId, id: { in: sampleStockIds } },
    select: { id: true, raw_material: true, quantity_on_hand: true, quantity_reserved: true },
  });
  const currentStoreVendor = await prisma.masterVendor.findFirst({
    where: { organization_id: organizationId, is_current_store: true, is_active: true },
    select: { id: true },
  });
  const remainingStockByMaterial = new Map(
    sampleStocks.map((stock) => [
      stock.raw_material.trim().toLowerCase(),
      {
        id: stock.id,
        available: new Prisma.Decimal(stock.quantity_on_hand).minus(stock.quantity_reserved),
        onHand: new Prisma.Decimal(stock.quantity_on_hand),
      },
    ]),
  );
  const stockCandidates = eligibleGroups.flatMap(([groupKey, rows], groupIndex) => {
    const stock = remainingStockByMaterial.get(String(rows[0]?.rawMaterialName ?? "").trim().toLowerCase());
    return stock && stock.onHand.gt(0)
      ? [{ groupKey, rows, stock, groupOrdinal: groupIndex + 1 }]
      : [];
  }).slice(0, 2);
  if (stockCandidates.length > 0 && !currentStoreVendor) {
    throw new Error("Activate a vendor marked as the current store before grouping sample stock.");
  }
  let completedStockGroups = trackedRecords.filter(
    (record) => record.moduleKey === "grouped-purchase-order" && record.sourceType === "STOCK",
  ).length;
  if (currentStoreVendor) {
    for (const candidate of stockCandidates) {
      const bomRow = candidate.rows.find((row) =>
        new Prisma.Decimal(row.totalRequiredQty ?? row.requiredQty ?? 0).gt(0),
      );
      if (!bomRow) continue;
      const required = new Prisma.Decimal(bomRow.totalRequiredQty ?? bomRow.requiredQty ?? 0);
      const stockGroupNo = `GPO-${batchId}-S${String(candidate.groupOrdinal).padStart(2, "0")}`;
      const existingStockGroup = await prisma.groupedPurchaseOrder.findFirst({
        where: { organization_id: organizationId, grouped_po_no: stockGroupNo },
        select: {
          id: true,
          vendor_id: true,
          source_type: true,
          lines: { select: { source_bom_item_id: true, grouped_qty: true } },
        },
      });
      const existingStockLine = existingStockGroup?.lines.find((line) => line.source_bom_item_id === bomRow.id);
      if (
        existingStockGroup
        && (
          existingStockGroup.source_type !== "STOCK"
          || existingStockGroup.vendor_id !== currentStoreVendor.id
          || existingStockGroup.lines.length !== 1
          || !existingStockLine
        )
      ) {
        throw new Error("A sample stock-group checkpoint conflicts with an existing grouped purchase order.");
      }
      const quantity = existingStockLine
        ? new Prisma.Decimal(existingStockLine.grouped_qty)
        : candidate.stock.available.lt(required.div(2))
          ? candidate.stock.available
          : required.div(2);
      if (!quantity.gt(0)) continue;

      const booking = await createRawMaterialStockBookings({
        organizationId,
        bookedBy: userId,
        currentStoreVendorId: currentStoreVendor.id,
        sampleBatchId: batchId,
        sampleGroupOrdinal: candidate.groupOrdinal,
        lines: [{
          bomItemId: bomRow.id,
          takeFromStockId: candidate.stock.id,
          bookedQuantity: quantity.toString(),
        }],
      });
      bookedQuantityByBomId.set(bomRow.id, quantity);
      if (!groupedPurchaseOrderIds.includes(booking.groupedPurchaseOrderId)) {
        groupedPurchaseOrderIds.push(booking.groupedPurchaseOrderId);
        completedStockGroups += 1;
      }
      if (!existingStockGroup) candidate.stock.available = candidate.stock.available.minus(quantity);
      if (!trackedRecords.some((record) =>
        record.moduleKey === "grouped-purchase-order" && record.id === booking.groupedPurchaseOrderId,
      )) {
        trackedRecords.push({
          moduleKey: "grouped-purchase-order",
          id: booking.groupedPurchaseOrderId,
          sourceType: "STOCK",
        });
      } else {
        const trackedStockGroup = trackedRecords.find((record) =>
          record.moduleKey === "grouped-purchase-order" && record.id === booking.groupedPurchaseOrderId,
        );
        if (trackedStockGroup) trackedStockGroup.sourceType = "STOCK";
      }
      const checkpointRecords = [
        ...trackedRecords.map((record) => ({ ...record })),
        { datasetVersion: SAMPLE_DATASET_VERSION },
      ] as Prisma.InputJsonArray;
      await prisma.organizationDummyDataBatch.update({
        where: { id: batchId, organization_id: organizationId },
        data: {
          status: "IN_PROGRESS",
          stage: "CREATE_GROUPS",
          last_error: null,
          master_record_ids: checkpointRecords,
          checkpoint: {
            orderIds: sampleOrderRecords.map((order) => order.id),
            groupedPurchaseOrderIds,
            completedGroupedPurchaseOrders: groupedPurchaseOrderIds.length,
            totalGroupedPurchaseOrders: 10 + stockCandidates.length,
            nextGroupKey: candidate.groupKey,
          },
        },
      });
    }
  }

  for (const [groupIndex, [groupKey, rows]] of eligibleGroups.entries()) {
    const groupedPoNo = `GPO-${batchId}-${String(groupIndex + 1).padStart(2, "0")}`;
    const vendorId = orderedVendorIds[groupIndex]!;
    const existing = await prisma.groupedPurchaseOrder.findFirst({
      where: { organization_id: organizationId, grouped_po_no: groupedPoNo },
      select: { id: true, vendor_id: true, lines: { select: { source_bom_item_id: true, grouped_qty: true } } },
    });
    const expectedQuantities = rows.map((row) => ({
      bomItemId: row.id,
      groupedQuantity: new Prisma.Decimal(row.totalRequiredQty ?? row.requiredQty ?? 0)
        .minus(bookedQuantityByBomId.get(row.id) ?? 0),
    }));
    if (expectedQuantities.some((line) => !line.groupedQuantity.gt(0))) {
      throw new Error("Sample stock allocations must leave a positive quantity for each vendor group.");
    }

    let groupedPurchaseOrderId: string;
    if (existing) {
      if (
        existing.vendor_id !== vendorId
        || existing.lines.length !== expectedQuantities.length
        || expectedQuantities.some((expected) => !existing.lines.some(
          (line) => line.source_bom_item_id === expected.bomItemId
            && new Prisma.Decimal(line.grouped_qty).eq(expected.groupedQuantity),
        ))
      ) {
        throw new Error("A sample procurement checkpoint conflicts with an existing grouped purchase order.");
      }
      groupedPurchaseOrderId = existing.id;
    } else {
      const groupedPurchaseOrder = await createGroupedPurchaseOrder({
        organizationId,
        vendorId,
        submittedBy: userId,
        submittedByUserId: userId,
        sampleBatchId: batchId,
        sampleGroupOrdinal: groupIndex + 1,
        lines: expectedQuantities.map((line) => ({
          bomItemId: line.bomItemId,
          groupedQty: line.groupedQuantity.toString(),
        })),
      });
      groupedPurchaseOrderId = groupedPurchaseOrder.id;
    }

    if (!groupedPurchaseOrderIds.includes(groupedPurchaseOrderId)) groupedPurchaseOrderIds.push(groupedPurchaseOrderId);
    if (!trackedRecords.some((record) => record.moduleKey === "grouped-purchase-order" && record.id === groupedPurchaseOrderId)) {
      trackedRecords.push({ moduleKey: "grouped-purchase-order", id: groupedPurchaseOrderId });
    }
    const checkpointRecords = [
      ...trackedRecords.map((record) => ({ ...record })),
      { datasetVersion: SAMPLE_DATASET_VERSION },
    ] as Prisma.InputJsonArray;
    await prisma.organizationDummyDataBatch.update({
      where: { id: batchId, organization_id: organizationId },
      data: {
        status: "IN_PROGRESS",
        stage: "CREATE_GROUPS",
        last_error: null,
        master_record_ids: checkpointRecords,
        checkpoint: {
          orderIds: sampleOrderRecords.map((order) => order.id),
          groupedPurchaseOrderIds,
          completedGroupedPurchaseOrders: groupedPurchaseOrderIds.length,
          totalGroupedPurchaseOrders: 10 + completedStockGroups,
          nextGroupKey: groupKey,
        },
      },
    });
  }

  await prisma.organizationDummyDataBatch.update({
    where: { id: batchId, organization_id: organizationId },
    data: {
      status: "AWAITING_GROUPED_APPROVAL",
      stage: "GROUPED_APPROVAL",
      checkpoint: {
        orderIds: sampleOrderRecords.map((order) => order.id),
        groupedPurchaseOrderIds,
        completedGroupedPurchaseOrders: groupedPurchaseOrderIds.length,
        totalGroupedPurchaseOrders: groupedPurchaseOrderIds.length,
      },
      last_error: null,
    },
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.auditEvent.create({
      data: {
        organization_id: organizationId,
        user_id: userId,
        module: "Organization Settings",
        action: "CREATE_DUMMY_DATA_STAGE",
        entity_type: "OrganizationDummyDataBatch",
        entity_id: batchId,
        details: { stage: "GROUPED_APPROVAL", grouped_purchase_order_count: groupedPurchaseOrderIds.length },
      },
    });
  });

  return {
    created: true,
    orderNo: firstOrderNo,
    orderCount: orderCount ?? sampleOrderRecords.length,
    status: "AWAITING_GROUPED_APPROVAL",
    stage: "GROUPED_APPROVAL",
    groupedPurchaseOrderCount: groupedPurchaseOrderIds.length,
  };
}

async function autoApproveSamplePurchaseOrders(
  organizationId: string,
  batchId: string,
  userId: string,
  purchaseOrderIds: string[],
) {
  if (purchaseOrderIds.length !== 10) return;
  const groupedNoPrefix = `GPO-${batchId}-`;
  const orders = await prisma.purchaseOrder.findMany({
    where: { organization_id: organizationId, id: { in: purchaseOrderIds } },
    select: {
      id: true,
      status: true,
      sources: {
        select: {
          masterPurchaseOrder: {
            select: {
              sourceRecords: {
                select: { groupedPurchaseOrder: { select: { grouped_po_no: true } } },
              },
            },
          },
        },
      },
    },
  });

  for (const order of orders) {
    if (!Array.isArray(order.sources)) continue;
    const sourceNumbers = order.sources.flatMap((source) =>
      source.masterPurchaseOrder.sourceRecords.map((record) => record.groupedPurchaseOrder.grouped_po_no),
    );
    if (sourceNumbers.length === 0 || sourceNumbers.some((number) => !number.startsWith(groupedNoPrefix))) continue;
    if (order.status !== "PENDING_APPROVAL") continue;
    await prisma.$transaction(async (transaction) => {
      const request = await transaction.approvalRequest.findFirst({
        where: {
          organization_id: organizationId,
          entity_type: "purchase-order",
          entity_ref_id: order.id,
          status: "pending",
        },
        select: { id: true },
      });
      if (!request) throw new Error("A pending approval request is missing for a sample Purchase Order.");
      const requestUpdate = await transaction.approvalRequest.updateMany({
        where: { id: request.id, organization_id: organizationId, status: "pending" },
        data: {
          status: "approved",
          reviewed_by: "Sample Data Automation",
          reviewed_by_user_id: null,
          reviewed_at: new Date(),
        },
      });
      if (requestUpdate.count !== 1) throw new Error("A sample Purchase Order approval request was already reviewed.");
      const orderUpdate = await transaction.purchaseOrder.updateMany({
        where: { id: order.id, organization_id: organizationId, status: "PENDING_APPROVAL" },
        data: {
          status: "APPROVED",
          approved_by: "Sample Data Automation",
          approved_at: new Date(),
          rejection_reason: null,
        },
      });
      if (orderUpdate.count !== 1) throw new Error("A sample Purchase Order changed before automatic approval.");
      await transaction.auditEvent.create({
        data: {
          organization_id: organizationId,
          user_id: userId,
          module: "Procurement",
          action: "AUTO_APPROVE_DUMMY_PURCHASE_ORDER",
          entity_type: "PurchaseOrder",
          entity_id: order.id,
          details: { batch_id: batchId, approval_request_id: request.id, reviewer: "Sample Data Automation" },
        },
      });
    });
  }
}

export type DummyDataWizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export async function startDummyDataWizardStep(
  userId: string,
  routeOrganizationId: string,
  step: DummyDataWizardStep,
  requestedBy = userId,
) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(step)) throw new Error("Select a valid sample-data step.");
  if (step === 1) {
    return createOrganizationDummyData(userId, routeOrganizationId, requestedBy);
  }

  const organization = await authorizeOrganization(userId, routeOrganizationId);
  const batch = await prisma.organizationDummyDataBatch.findUnique({
    where: { organization_id: organization.id },
    select: { id: true, status: true, stage: true, master_record_ids: true, checkpoint: true },
  });
  if (!batch) throw new Error("Sample data has not been started for this organization.");
  const records = readMasterRecordIds(batch.master_record_ids);

  if (step === 9) {
    const canCreateWorkOrders = (batch.status === "IN_PROGRESS" && batch.stage === "CREATE_WORK_ORDERS")
      || (batch.status === "ACTIVE" && batch.stage === "COMPLETE");
    if (!canCreateWorkOrders) {
      throw new Error("Complete Step 8 allocation before creating the sample work orders.");
    }
    const sampleOrderIds = records
      .filter((record) => record.moduleKey === "sample-order")
      .map((record) => record.id);
    if (sampleOrderIds.length < 5) throw new Error("At least five batch-owned sample orders are required for Step 9.");
    const workOrders = await createWorkOrdersForSampleOrders(organization.id, userId, sampleOrderIds);
    if (workOrders.length < 5) throw new Error("Five sample work orders could not be confirmed.");
    const workOrderRecords = workOrders.map((workOrder) => ({
      moduleKey: "sample-work-order",
      id: workOrder.id,
    }));
    const checkpoint = batch.checkpoint && typeof batch.checkpoint === "object" && !Array.isArray(batch.checkpoint)
      ? batch.checkpoint as Prisma.InputJsonObject
      : {};
    await checkpointDummyDataRecords(
      organization.id,
      batch.id,
      [...records, ...workOrderRecords],
      "COMPLETE",
      { ...checkpoint, workOrderIds: workOrders.map((workOrder) => workOrder.id) },
      "ACTIVE",
    );
    await prisma.$transaction((transaction) => transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: userId,
        module: "Organization Settings",
        action: "CREATE_DUMMY_DATA_STAGE",
        entity_type: "OrganizationDummyDataBatch",
        entity_id: batch.id,
        details: {
          stage: "COMPLETE",
          work_order_count: workOrders.length,
          created_work_order_count: workOrders.filter((workOrder) => workOrder.created).length,
        },
      },
    }).then(() => undefined));
    return {
      advanced: true,
      status: "ACTIVE",
      stage: "COMPLETE",
      completedCount: workOrders.length,
      totalCount: 5,
    };
  }

  if (step === 8 && (batch.status !== "IN_PROGRESS" || batch.stage !== "CREATE_ALLOCATION")) {
    throw new Error("Complete Step 7 verification before allocating the verified sample GRNs.");
  }

  if (step === 2) {
    if (batch.stage !== "CREATE_GROUPS" || batch.status !== "IN_PROGRESS") {
      throw new Error("Create master data, orders, and BOM before creating grouped purchase orders.");
    }
    return createSampleGroupedPurchaseOrders(organization.id, batch.id, userId);
  }

  const groupedPurchaseOrderIds = records
    .filter((record) => record.moduleKey === "grouped-purchase-order")
    .map((record) => record.id);
  if (groupedPurchaseOrderIds.length < 10) throw new Error("Ten batch-owned grouped purchase orders are required.");

  if (step === 3) {
    if (batch.stage !== "GROUPED_APPROVAL" || batch.status !== "AWAITING_GROUPED_APPROVAL") {
      throw new Error("Create the grouped purchase orders before preparing their sample prices.");
    }
    return prepareSampleGroupedPurchaseOrderPrices(organization.id, batch.id, userId, groupedPurchaseOrderIds);
  }

  const groups = await prisma.groupedPurchaseOrder.findMany({
    where: { id: { in: groupedPurchaseOrderIds }, organization_id: organization.id },
    select: { id: true, status: true },
  });
  if (groups.length !== groupedPurchaseOrderIds.length || groups.some((group) => !["PRICE_APPROVED", "MASTER_GROUPED"].includes(group.status))) {
    throw new Error("Approve the sample grouped purchase orders before continuing.");
  }

  if (step === 4) {
    return createSampleMasterGroups(organization.id, batch.id, userId, requestedBy, records, groupedPurchaseOrderIds);
  }

  const masterPurchaseOrderIds = records
    .filter((record) => record.moduleKey === "master-purchase-order" && record.sourceType !== "STOCK")
    .map((record) => record.id);
  if (masterPurchaseOrderIds.length !== 10) throw new Error("Create all ten sample master groups before generating purchase orders.");
  if (step === 5) {
    return createSamplePurchaseOrders(
      organization.id,
      batch.id,
      userId,
      requestedBy,
      records,
      groupedPurchaseOrderIds,
      masterPurchaseOrderIds,
    );
  }
  if (
    batch.status !== "IN_PROGRESS"
    || !["CREATE_GATE_ENTRIES", "CREATE_GRNS", "CREATE_VERIFICATION", "CREATE_ALLOCATION"].includes(batch.stage)
  ) {
    throw new Error("Complete Step 5 and approve all sample Purchase Orders before creating RM Gate Entries and GRNs.");
  }
  const purchaseOrderIds = records
    .filter((record) => record.moduleKey === "purchase-order")
    .map((record) => record.id);
  const purchaseOrders = purchaseOrderIds.length === 0 ? [] : await prisma.purchaseOrder.findMany({
    where: {
      organization_id: organization.id,
      id: { in: purchaseOrderIds },
    },
    select: { id: true, status: true },
  });
  if (
    purchaseOrders.length < 10
    || purchaseOrders.some((order) => !["APPROVED", "SHARED"].includes(order.status))
  ) {
    throw new Error("Approve at least ten sample Purchase Orders before creating RM Gate Entries and GRNs.");
  }
  if (step === 8) {
    const receiptIds = records
      .filter((record) => record.moduleKey === "inventory-receipt")
      .map((record) => record.id);
    const progress = await allocateDummySampleGrnsTopDown(
      organization.id,
      batch.id,
      receiptIds,
      userId,
    );
    await checkpointDummyDataRecords(organization.id, batch.id, records, "CREATE_WORK_ORDERS", {
      purchaseOrderIds,
      grnIds: receiptIds,
      completedOrderAllocations: progress.completedCount,
      totalOrderAllocations: progress.totalCount,
    });
    await prisma.$transaction((transaction) => transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: userId,
        module: "Organization Settings",
        action: "CREATE_DUMMY_DATA_STAGE",
        entity_type: "OrganizationDummyDataBatch",
        entity_id: batch.id,
        details: {
          stage: "CREATE_WORK_ORDERS",
          grn_count: receiptIds.length,
          completed_order_allocations: progress.completedCount,
          total_order_allocations: progress.totalCount,
        },
      },
    }).then(() => undefined));
    return {
      advanced: true,
      status: "IN_PROGRESS",
      stage: "CREATE_WORK_ORDERS",
      completedCount: progress.completedCount,
      totalCount: progress.totalCount,
    };
  }
  if (step === 7) {
    if (
      batch.status !== "IN_PROGRESS"
      || !["CREATE_VERIFICATION", "CREATE_ALLOCATION"].includes(batch.stage)
    ) {
      throw new Error("Complete Step 6 and create all five sample GRNs before starting verification.");
    }
    const receiptIds = records
      .filter((record) => record.moduleKey === "inventory-receipt")
      .map((record) => record.id);
    const progress = await verifyDummySampleGrns(
      organization.id,
      batch.id,
      purchaseOrderIds,
      receiptIds,
      userId,
    );
    await checkpointDummyDataRecords(organization.id, batch.id, records, "CREATE_ALLOCATION", {
      purchaseOrderIds,
      gateEntryIds: records.filter((record) => record.moduleKey === "gate-entry").map((record) => record.id),
      grnIds: receiptIds,
      completedVerificationLines: progress.completedLineCount,
      totalVerificationLines: progress.totalLineCount,
    });
    await prisma.$transaction((transaction) => transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: userId,
        module: "Organization Settings",
        action: "CREATE_DUMMY_DATA_STAGE",
        entity_type: "OrganizationDummyDataBatch",
        entity_id: batch.id,
        details: {
          stage: "CREATE_ALLOCATION",
          grn_count: receiptIds.length,
          verified_line_count: progress.completedLineCount,
          total_line_count: progress.totalLineCount,
        },
      },
    }).then(() => undefined));
    return {
      advanced: true,
      status: "IN_PROGRESS",
      stage: "CREATE_ALLOCATION",
      completedCount: progress.completedLineCount,
      totalCount: progress.totalLineCount,
    };
  }
  const entries = await createDummySampleGateEntries(
    organization.id,
    batch.id,
    purchaseOrderIds,
    userId,
  );
  const grns = await createDummySampleGrns(
    organization.id,
    purchaseOrderIds,
    batch.id,
    userId,
  );
  for (const entry of entries) {
    if (!records.some((record) => record.moduleKey === "gate-entry" && record.id === entry.id)) {
      records.push({ moduleKey: "gate-entry", id: entry.id });
    }
  }
  for (const receipt of grns) {
    if (!records.some((record) => record.moduleKey === "inventory-receipt" && record.id === receipt.id)) {
      records.push({ moduleKey: "inventory-receipt", id: receipt.id });
    }
  }
  await checkpointDummyDataRecords(organization.id, batch.id, records, "CREATE_VERIFICATION", {
    purchaseOrderIds,
    gateEntryIds: entries.map((entry) => entry.id),
    completedGateEntries: entries.length,
    totalGateEntries: 5,
    grnIds: grns.map((receipt) => receipt.id),
    completedGrns: grns.length,
    totalGrns: 5,
  });
  await prisma.$transaction((transaction) => transaction.auditEvent.create({
    data: {
      organization_id: organization.id,
      user_id: userId,
      module: "Organization Settings",
      action: "CREATE_DUMMY_DATA_STAGE",
      entity_type: "OrganizationDummyDataBatch",
      entity_id: batch.id,
      details: { stage: "CREATE_VERIFICATION", gate_entry_count: entries.length, grn_count: grns.length },
    },
  }).then(() => undefined));
  return {
    advanced: true,
    status: "IN_PROGRESS",
    stage: "CREATE_VERIFICATION",
    completedCount: grns.length,
    totalCount: 5,
  };
}

async function prepareSampleGroupedPurchaseOrderPrices(
  organizationId: string,
  batchId: string,
  userId: string,
  groupedPurchaseOrderIds: string[],
) {
  const groupedNoPrefix = `GPO-${batchId}-`;
  const orders = await prisma.groupedPurchaseOrder.findMany({
    where: { organization_id: organizationId, id: { in: groupedPurchaseOrderIds } },
    select: {
      id: true,
      grouped_po_no: true,
      source_type: true,
      status: true,
      stock_uom: true,
      total_grouped_qty: true,
      lines: { select: { id: true, grouped_qty: true } },
    },
  });
  if (orders.length !== groupedPurchaseOrderIds.length || orders.length < 10) {
    throw new Error("The sample grouped purchase order records could not be loaded.");
  }
  if (orders.filter((order) => order.source_type === "VENDOR").length !== 10) {
    throw new Error("Ten vendor-source sample grouped purchase orders are required.");
  }
  const stockUomConversions = await prisma.masterStockUomConvert.findMany({
    where: {
      organization_id: organizationId,
      is_active: true,
      stock_uom: { organization_id: organizationId, is_active: true },
    },
    orderBy: [{ stock_uom_id: "asc" }, { sort_order: "asc" }, { id: "asc" }],
    select: {
      id: true,
      stock_uom_id: true,
      sort_order: true,
      name: true,
      how_many: true,
      stock_uom: { select: { uom: true } },
    },
  });

  for (const order of orders) {
    if (!order.grouped_po_no.startsWith(groupedNoPrefix)) throw new Error("A grouped purchase order is not owned by this sample batch.");
    if (!["PENDING_PRICE_APPROVAL", "PRICE_APPROVED"].includes(order.status)) {
      throw new Error("A sample grouped purchase order is no longer available for pricing.");
    }
    const suffix = order.grouped_po_no.slice(groupedNoPrefix.length);
    if (
      (order.source_type === "STOCK" && !/^S\d{2}$/.test(suffix))
      || (order.source_type === "VENDOR" && (!/^\d{2}$/.test(suffix) || Number(suffix) < 1 || Number(suffix) > 10))
      || !["STOCK", "VENDOR"].includes(order.source_type)
    ) {
      throw new Error("A sample grouped purchase order has an invalid batch number or source.");
    }
    if (order.status === "PRICE_APPROVED") continue;
    if (order.lines.length === 0) throw new Error("A sample grouped purchase order has no lines to price.");
    const sampleSeed = createHash("sha256").update(`${batchId}:${order.id}`).digest();
    const vendorPrice = 60 + (sampleSeed.readUInt16BE(0) % 141);
    const gst = [5, 12, 18][sampleSeed.readUInt16BE(2) % 3];
    const hsnCode = ["5208", "5515", "6006", "9606"][sampleSeed.readUInt16BE(4) % 4];
    const availableConversions = stockUomConversions.filter(
      (conversion) =>
        conversion.stock_uom.uom.trim().toLowerCase() ===
        String(order.stock_uom ?? "").trim().toLowerCase(),
    );
    if (availableConversions.length === 0) {
      throw new Error(`An active buying-UOM conversion is required for sample stock UOM ${order.stock_uom ?? "unknown"}.`);
    }
    const conversion = availableConversions[
      sampleSeed.readUInt16BE(6) % availableConversions.length
    ];
    const convertValue = new Prisma.Decimal(conversion.how_many);
    if (!convertValue.isFinite() || !convertValue.greaterThan(0)) {
      throw new Error(`Sample buying-UOM conversion ${conversion.name} must be greater than zero.`);
    }
    const groupedQty = order.total_grouped_qty ?? order.lines.reduce(
      (total, line) => total.plus(line.grouped_qty),
      new Prisma.Decimal(0),
    );
    const buyingQty = groupedQty.div(convertValue);

    await prisma.$transaction(async (transaction) => {
      for (const line of order.lines) {
        await transaction.groupedPurchaseOrderLine.updateMany({
          where: { id: line.id, grouped_purchase_order_id: order.id },
          data: { vendor_price: vendorPrice, total_spend: line.grouped_qty.mul(vendorPrice) },
        });
      }
      const updated = await transaction.groupedPurchaseOrder.updateMany({
        where: { id: order.id, organization_id: organizationId, status: "PENDING_PRICE_APPROVAL" },
        data: {
          vendor_price: vendorPrice,
          vendor_price_inr: vendorPrice,
          gst,
          hsn_code: hsnCode,
          buying_uom: conversion.name,
          convert_value: convertValue,
          buying_qty: buyingQty,
          buying_qty_round: buyingQty,
          difference_round: new Prisma.Decimal(0),
          moq_buying: new Prisma.Decimal(0),
          extra_buying_uom: new Prisma.Decimal(0),
          buying_qty_total: buyingQty,
          status: "PRICE_APPROVED",
          approved_by: "Sample Data Automation",
          approved_by_user_id: null,
          approved_at: new Date(),
          rejection_reason: null,
        },
      });
      if (updated.count !== 1) throw new Error("A sample grouped purchase order changed while its price was being prepared.");
      await transaction.auditEvent.create({
        data: {
          organization_id: organizationId,
          user_id: userId,
          module: "Procurement",
          action: "SET_DUMMY_GROUPED_PURCHASE_ORDER_SAMPLE_TERMS",
          entity_type: "GroupedPurchaseOrder",
          entity_id: order.id,
          details: {
            batch_id: batchId,
            vendor_price: vendorPrice,
            gst,
            hsn_code: hsnCode,
            buying_uom: conversion.name,
            convert_value: convertValue.toString(),
          },
        },
      });
      await transaction.auditEvent.create({
        data: {
          organization_id: organizationId,
          user_id: userId,
          module: "Procurement",
          action: "APPROVE_DUMMY_GROUPED_PURCHASE_ORDER",
          entity_type: "GroupedPurchaseOrder",
          entity_id: order.id,
          details: { batch_id: batchId, reviewer: "Sample Data Automation" },
        },
      });
    });
  }

  await prisma.organizationDummyDataBatch.update({
    where: { id: batchId, organization_id: organizationId },
    data: {
      status: "IN_PROGRESS",
      stage: "CREATE_MASTER_GROUPS",
      checkpoint: {
        groupedPurchaseOrderIds,
        sampleTermsPrepared: true,
        sampleTermsPreparedAt: new Date().toISOString(),
      },
    },
  });

  return {
    prepared: true,
    approved: true,
    status: "IN_PROGRESS",
    stage: "CREATE_MASTER_GROUPS",
    approvedCount: orders.length,
    totalCount: orders.length,
  };
}

export async function approveSampleGroupedPurchaseOrder(
  userId: string,
  routeOrganizationId: string,
  groupedPurchaseOrderId: string,
) {
  const organization = await authorizeOrganization(userId, routeOrganizationId);
  const batch = await prisma.organizationDummyDataBatch.findUnique({
    where: { organization_id: organization.id },
    select: { id: true, status: true, stage: true, master_record_ids: true },
  });
  if (!batch || batch.stage !== "GROUPED_APPROVAL" || batch.status !== "AWAITING_GROUPED_APPROVAL") {
    throw new Error("Sample grouped-PO price approval is not currently available.");
  }
  const trackedIds = readMasterRecordIds(batch.master_record_ids)
    .filter((record) => record.moduleKey === "grouped-purchase-order")
    .map((record) => record.id);
  if (!trackedIds.includes(groupedPurchaseOrderId)) throw new Error("This grouped purchase order is not part of the active sample batch.");

  return prisma.$transaction(async (transaction) => {
    const order = await transaction.groupedPurchaseOrder.findFirst({
      where: { id: groupedPurchaseOrderId, organization_id: organization.id },
      select: { id: true, grouped_po_no: true, status: true, lines: { select: { vendor_price: true } } },
    });
    if (!order || !order.grouped_po_no.startsWith(`GPO-${batch.id}-`)) {
      throw new Error("The grouped purchase order is not owned by this sample batch.");
    }
    if (order.status === "PRICE_APPROVED") return { approved: true, id: order.id };
    if (order.status !== "PENDING_PRICE_APPROVAL" || order.lines.length === 0 || order.lines.some((line) => line.vendor_price === null)) {
      throw new Error("Prepare sample price, GST, and HSN before approving this grouped purchase order.");
    }
    const updated = await transaction.groupedPurchaseOrder.updateMany({
      where: { id: order.id, organization_id: organization.id, status: "PENDING_PRICE_APPROVAL" },
      data: {
        status: "PRICE_APPROVED",
        approved_by: "Sample Data Automation",
        approved_by_user_id: null,
        approved_at: new Date(),
        rejection_reason: null,
      },
    });
    if (updated.count !== 1) throw new Error("The grouped purchase order changed before sample price approval.");
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: userId,
        module: "Procurement",
        action: "APPROVE_DUMMY_GROUPED_PURCHASE_ORDER",
        entity_type: "GroupedPurchaseOrder",
        entity_id: order.id,
        details: { batch_id: batch.id, reviewer: "Sample Data Automation" },
      },
    });
    return { approved: true, id: order.id };
  });
}

async function createSampleMasterGroups(
  organizationId: string,
  batchId: string,
  userId: string,
  requestedBy: string,
  records: DemoMasterRecord[],
  groupedPurchaseOrderIds: string[],
) {
  const masterPurchaseOrderIds: string[] = [];
  const totalMasterGroups = groupedPurchaseOrderIds.length;
  for (const groupedPurchaseOrderId of groupedPurchaseOrderIds) {
    const existingMaster = await prisma.masterPurchaseOrder.findFirst({
      where: {
        organization_id: organizationId,
        sourceRecords: { some: { grouped_purchase_order_id: groupedPurchaseOrderId } },
      },
      select: { id: true },
    });
    const master = existingMaster
      ? existingMaster
      : await createMasterPurchaseOrder(organizationId, [groupedPurchaseOrderId], requestedBy);
    masterPurchaseOrderIds.push(master.id);
    const sourceType = records.find((record) =>
      record.moduleKey === "grouped-purchase-order" && record.id === groupedPurchaseOrderId,
    )?.sourceType ?? "VENDOR";
    if (!records.some((record) => record.moduleKey === "master-purchase-order" && record.id === master.id)) {
      records.push({ moduleKey: "master-purchase-order", id: master.id, sourceType });
    }
    await checkpointDummyDataRecords(organizationId, batchId, records, "CREATE_MASTER_GROUPS", {
      groupedPurchaseOrderIds,
      masterPurchaseOrderIds,
      completedMasterGroups: masterPurchaseOrderIds.length,
      totalMasterGroups,
    });
  }
  await prisma.organizationDummyDataBatch.update({
    where: { id: batchId, organization_id: organizationId },
    data: { status: "IN_PROGRESS", stage: "CREATE_MASTER_GROUPS", checkpoint: { groupedPurchaseOrderIds, masterPurchaseOrderIds } },
  });
  await prisma.$transaction((transaction) => transaction.auditEvent.create({
    data: {
      organization_id: organizationId,
      user_id: userId,
      module: "Organization Settings",
      action: "CREATE_DUMMY_DATA_STAGE",
      entity_type: "OrganizationDummyDataBatch",
      entity_id: batchId,
      details: { stage: "CREATE_MASTER_GROUPS", master_purchase_order_count: masterPurchaseOrderIds.length },
    },
  }).then(() => undefined));
  return {
    advanced: true,
    status: "IN_PROGRESS",
    stage: "CREATE_MASTER_GROUPS",
    completedCount: totalMasterGroups,
    totalCount: totalMasterGroups,
  };
}

async function createSamplePurchaseOrders(
  organizationId: string,
  batchId: string,
  userId: string,
  requestedBy: string,
  records: DemoMasterRecord[],
  groupedPurchaseOrderIds: string[],
  masterPurchaseOrderIds: string[],
) {
  if (masterPurchaseOrderIds.length !== 10) {
    throw new Error("At least ten sample master groups are required to create Purchase Orders.");
  }
  const purchaseOrderIds: string[] = [];
  for (const masterPurchaseOrderId of masterPurchaseOrderIds) {
    let purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { organization_id: organizationId, sources: { some: { master_purchase_order_id: masterPurchaseOrderId } } },
      select: { id: true, status: true },
    });
    if (!purchaseOrder) purchaseOrder = await generatePurchaseOrders(organizationId, [masterPurchaseOrderId], requestedBy);
    purchaseOrderIds.push(purchaseOrder.id);
    if (!records.some((record) => record.moduleKey === "purchase-order" && record.id === purchaseOrder.id)) {
      records.push({ moduleKey: "purchase-order", id: purchaseOrder.id });
    }
    if (["DRAFT", "OPEN", "REJECTED"].includes(purchaseOrder.status)) {
      await submitPurchaseOrderForApproval(organizationId, purchaseOrder.id, requestedBy, userId);
    }
    await checkpointDummyDataRecords(organizationId, batchId, records, "SUBMIT_PURCHASE_ORDERS", {
      groupedPurchaseOrderIds,
      masterPurchaseOrderIds,
      purchaseOrderIds,
      completedPurchaseOrders: purchaseOrderIds.length,
      totalPurchaseOrders: 10,
    });
  }
  if (purchaseOrderIds.length < 10) {
    throw new Error("At least ten sample Purchase Orders are required before Step 5 can complete.");
  }
  await autoApproveSamplePurchaseOrders(organizationId, batchId, userId, purchaseOrderIds);
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { organization_id: organizationId, id: { in: purchaseOrderIds } },
    select: { id: true, status: true },
  });
  const approvedCount = purchaseOrders.filter((order) =>
    ["APPROVED", "SHARED"].includes(order.status),
  ).length;
  if (purchaseOrders.length < 10 || approvedCount < 10) {
    throw new Error(`Step 5 approved ${approvedCount} of 10 sample Purchase Orders. Resume Step 5 to continue.`);
  }
  await prisma.organizationDummyDataBatch.update({
    where: { id: batchId, organization_id: organizationId },
    data: {
      status: "IN_PROGRESS",
      stage: "CREATE_GATE_ENTRIES",
      checkpoint: { groupedPurchaseOrderIds, masterPurchaseOrderIds, purchaseOrderIds, approvedPurchaseOrderCount: approvedCount },
    },
  });
  await prisma.$transaction((transaction) => transaction.auditEvent.create({
    data: {
      organization_id: organizationId,
      user_id: userId,
      module: "Organization Settings",
      action: "CREATE_DUMMY_DATA_STAGE",
      entity_type: "OrganizationDummyDataBatch",
      entity_id: batchId,
      details: { stage: "CREATE_GATE_ENTRIES", purchase_order_count: purchaseOrders.length, approved_purchase_order_count: approvedCount },
    },
  }).then(() => undefined));
  return {
    advanced: true,
    status: "IN_PROGRESS",
    stage: "CREATE_GATE_ENTRIES",
    completedCount: approvedCount,
    totalCount: 10,
  };
}

export async function advanceOrganizationDummyData(
  userId: string,
  routeOrganizationId: string,
  requestedBy = userId,
  allowPendingOwner = false,
) {
  const organization = await authorizeOrganization(userId, routeOrganizationId, allowPendingOwner);
  const batch = await prisma.organizationDummyDataBatch.findUnique({
    where: { organization_id: organization.id },
    select: { id: true, status: true, stage: true, master_record_ids: true, checkpoint: true },
  });
  if (!batch) throw new Error("Sample data has not been started for this organization.");

  const records = readMasterRecordIds(batch.master_record_ids);
  if (batch.stage === "CREATE_GROUPS" && batch.status === "IN_PROGRESS") {
    return startDummyDataWizardStep(userId, routeOrganizationId, 2, requestedBy);
  }

  if (
    (batch.stage === "CREATE_WORK_ORDERS" && batch.status === "IN_PROGRESS")
    || (batch.stage === "COMPLETE" && batch.status === "ACTIVE")
  ) {
    return startDummyDataWizardStep(userId, routeOrganizationId, 9, requestedBy);
  }

  if (batch.stage === "GROUPED_APPROVAL" && batch.status === "AWAITING_GROUPED_APPROVAL") {
    const groupedPurchaseOrderIds = records
      .filter((record) => record.moduleKey === "grouped-purchase-order")
      .map((record) => record.id);
    const groups = groupedPurchaseOrderIds.length === 0 ? [] : await prisma.groupedPurchaseOrder.findMany({
      where: { id: { in: groupedPurchaseOrderIds }, organization_id: organization.id },
      select: { id: true, status: true },
    });
    const approvedCount = groups.filter((group) => group.status === "PRICE_APPROVED" || group.status === "MASTER_GROUPED").length;
    if (groups.length !== groupedPurchaseOrderIds.length || approvedCount !== groupedPurchaseOrderIds.length) {
      return {
        advanced: false,
        status: batch.status,
        stage: batch.stage,
        completedCount: approvedCount,
        totalCount: groupedPurchaseOrderIds.length,
      };
    }
    return startDummyDataWizardStep(userId, routeOrganizationId, 4, requestedBy);
  }

  if (batch.stage === "CREATE_MASTER_GROUPS" && batch.status === "IN_PROGRESS") {
    const groupedPurchaseOrderCount = records.filter((record) => record.moduleKey === "grouped-purchase-order").length;
    const masterRecords = records.filter((record) => record.moduleKey === "master-purchase-order");
    const vendorMasterGroupCount = masterRecords.filter((record) => record.sourceType !== "STOCK").length;
    return startDummyDataWizardStep(
      userId,
      routeOrganizationId,
      masterRecords.length === groupedPurchaseOrderCount && vendorMasterGroupCount === 10 ? 5 : 4,
      requestedBy,
    );
  }

  if (batch.stage === "SUBMIT_PURCHASE_ORDERS" && batch.status === "IN_PROGRESS") {
    return startDummyDataWizardStep(userId, routeOrganizationId, 5, requestedBy);
  }

  if (batch.stage === "PO_APPROVAL" && batch.status === "AWAITING_PO_APPROVAL") {
    const purchaseOrderIds = records.filter((record) => record.moduleKey === "purchase-order").map((record) => record.id);
    await autoApproveSamplePurchaseOrders(organization.id, batch.id, userId, purchaseOrderIds);
    const purchaseOrders = purchaseOrderIds.length === 0 ? [] : await prisma.purchaseOrder.findMany({
      where: { id: { in: purchaseOrderIds }, organization_id: organization.id },
      select: { id: true, status: true, entity_id: true },
    });
    const approvedCount = purchaseOrders.filter((order) => ["APPROVED", "SHARED"].includes(order.status)).length;
    if (purchaseOrders.length !== 10 || approvedCount !== 10) {
      return {
        advanced: false,
        status: "AWAITING_PO_APPROVAL",
        stage: "PO_APPROVAL",
        completedCount: approvedCount,
        totalCount: 10,
      };
    }
    const firstSampleOrder = records.find((record) => record.moduleKey === "sample-order");
    await prisma.organizationDummyDataBatch.update({
      where: { id: batch.id, organization_id: organization.id },
      data: {
        status: "IN_PROGRESS",
        stage: "CREATE_GATE_ENTRIES",
        sample_order_id: firstSampleOrder?.id,
        last_error: null,
        checkpoint: {
          purchaseOrderIds,
          approvedPurchaseOrderCount: approvedCount,
        },
      },
    });
    await prisma.$transaction((transaction) => transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        user_id: userId,
        module: "Organization Settings",
        action: "CREATE_DUMMY_DATA_STAGE",
        entity_type: "OrganizationDummyDataBatch",
        entity_id: batch.id,
        details: { stage: "CREATE_GATE_ENTRIES", purchase_order_count: purchaseOrders.length, approved_purchase_order_count: approvedCount },
      },
    }).then(() => undefined));
    return {
      advanced: true,
      status: "IN_PROGRESS",
      stage: "CREATE_GATE_ENTRIES",
      completedCount: approvedCount,
      totalCount: 10,
    };
  }

  return { advanced: false, status: batch.status, stage: batch.stage, completedCount: 0, totalCount: 0 };
}

async function checkpointDummyDataRecords(
  organizationId: string,
  batchId: string,
  baseRecords: DemoMasterRecord[],
  stage: string,
  checkpoint: Prisma.InputJsonObject,
  status = "IN_PROGRESS",
) {
  const current = await prisma.organizationDummyDataBatch.findUnique({
    where: { id: batchId, organization_id: organizationId },
    select: { master_record_ids: true },
  });
  const currentRecords = readMasterRecordIds(current?.master_record_ids ?? []);
  const records = [...baseRecords];
  for (const record of currentRecords) {
    if (!records.some((existing) => existing.moduleKey === record.moduleKey && existing.id === record.id)) records.push(record);
  }
  await prisma.organizationDummyDataBatch.update({
    where: { id: batchId, organization_id: organizationId },
    data: {
      status,
      stage,
      master_record_ids: [
        ...records.map((record) => ({ ...record })),
        { datasetVersion: SAMPLE_DATASET_VERSION },
      ] as Prisma.InputJsonArray,
      checkpoint,
      last_error: null,
    },
  });
}

export async function deleteOrganizationDummyData(userId: string, routeOrganizationId: string) {
  const organization = await authorizeOrganization(userId, routeOrganizationId);

  try {
    return await prisma.$transaction(async (transaction) => {
    const batch = await transaction.organizationDummyDataBatch.findUnique({
      where: { organization_id: organization.id },
    });
    if (!batch || batch.status === "EMPTY") return { deleted: false };
    const deletableStatuses = ["ACTIVE", "IN_PROGRESS", "AWAITING_GROUPED_APPROVAL", "AWAITING_PO_APPROVAL"];
    if (batch.status === "DELETING") {
      throw new Error("Dummy-data cleanup is already in progress. Refresh the page and try again.");
    }
    if (!deletableStatuses.includes(batch.status)) {
      throw new Error("Dummy data cannot be deleted while the batch is in an unsupported state.");
    }

    const createdRecords = readMasterRecordIds(batch.master_record_ids);
    const ids = (moduleKey: string) => createdRecords.filter((record) => record.moduleKey === moduleKey).map((record) => record.id);
    const categoryIds = ids("category");
    const sizeGroupIds = ids("size-group");

    const sampleOrderIds = [...new Set([
      ...ids("sample-order"),
      ...(batch.sample_order_id ? [batch.sample_order_id] : []),
    ])];
    const sampleReceiptIds = ids("inventory-receipt");
    const trackedSampleStockIds = ids("raw-material-stock");
    const sampleGrnStocks = sampleReceiptIds.length === 0
      ? []
      : await transaction.rawMaterialStock.findMany({
        where: {
          organization_id: organization.id,
          receiptLine: {
            receipt: {
              organization_id: organization.id,
              id: { in: sampleReceiptIds },
            },
          },
        },
        select: { id: true },
      });
    const sampleStockIds = [...new Set([
      ...trackedSampleStockIds,
      ...sampleGrnStocks.map((stock) => stock.id),
    ])];
    const trackedSampleStockGroupIds = createdRecords
      .filter((record) => record.moduleKey === "grouped-purchase-order" && record.sourceType === "STOCK")
      .map((record) => record.id);
    let sampleGroupedPurchaseOrderIds = ids("grouped-purchase-order");
    let sampleMasterPurchaseOrderIds = ids("master-purchase-order");
    const claimed = await transaction.organizationDummyDataBatch.updateMany({
      where: { id: batch.id, organization_id: organization.id, status: batch.status },
      data: { status: "DELETING" },
    });
    if (claimed.count !== 1) {
      throw new Error("Dummy-data cleanup has already started. Refresh the page and try again.");
    }
    const sampleVendorIds = ids("vendor");
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
      select: { id: true, grouped_po_no: true, source_type: true },
    });
    sampleGroupedPurchaseOrderIds = [...new Set([
      ...sampleGroupedPurchaseOrderIds,
      ...linkedGroupedPurchaseOrders.map((order) => order.id),
    ])];
    const sampleStockGroupIdSet = new Set([
      ...trackedSampleStockGroupIds,
      ...linkedGroupedPurchaseOrders
        .filter((order) =>
          order.source_type === "STOCK"
          && order.grouped_po_no?.startsWith(`GPO-${batch.id}-`)
          && /^S\d{2}$/.test(order.grouped_po_no.slice(`GPO-${batch.id}-`.length)),
        )
        .map((order) => order.id),
    ]);
    const bookingScope = [
      ...(sampleStockIds.length > 0 ? [{ take_from_stock_id: { in: sampleStockIds } }] : []),
      ...(sampleGroupedPurchaseOrderIds.length > 0
        ? [{ grouped_purchase_order_id: { in: sampleGroupedPurchaseOrderIds } }]
        : []),
    ];
    const stockBookings = bookingScope.length === 0 ? [] : await transaction.rawMaterialStockBooking.findMany({
      where: { organization_id: organization.id, OR: bookingScope },
      select: {
        id: true,
        grouped_purchase_order_id: true,
        take_from_stock_id: true,
        booked_quantity: true,
        fulfilled_quantity: true,
        status: true,
      },
    });
    const sampleStockIdSet = new Set(sampleStockIds);
    if (stockBookings.some((booking) =>
      !sampleStockIdSet.has(booking.take_from_stock_id)
      || !booking.grouped_purchase_order_id
      || !sampleStockGroupIdSet.has(booking.grouped_purchase_order_id)
      || booking.status !== "BOOKED"
      || !new Prisma.Decimal(booking.fulfilled_quantity).eq(0),
    )) {
      throw new Error("Sample stock has bookings that cannot be safely reversed. Resolve those bookings before removing sample data.");
    }
    if (stockBookings.length > 0) {
      const reservedByStockId = new Map<string, Prisma.Decimal>();
      for (const booking of stockBookings) {
        reservedByStockId.set(
          booking.take_from_stock_id,
          (reservedByStockId.get(booking.take_from_stock_id) ?? new Prisma.Decimal(0))
            .plus(booking.booked_quantity),
        );
      }
      for (const [stockId, quantity] of reservedByStockId) {
        const updated = await transaction.rawMaterialStock.updateMany({
          where: {
            id: stockId,
            organization_id: organization.id,
            quantity_reserved: { gte: quantity },
          },
          data: { quantity_reserved: { decrement: quantity } },
        });
        if (updated.count !== 1) throw new Error("A sample stock reservation changed before cleanup could release it.");
      }
      await transaction.rawMaterialStockBooking.deleteMany({
        where: { organization_id: organization.id, id: { in: stockBookings.map((booking) => booking.id) } },
      });
    }
    await transaction.gateEntry.deleteMany({
      where: {
        organization_id: organization.id,
        id: { in: ids("gate-entry") },
      },
    });
    await transaction.inventoryReceipt.deleteMany({
      where: {
        organization_id: organization.id,
        id: { in: ids("inventory-receipt") },
      },
    });
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
    await transaction.rawMaterialStock.deleteMany({
      where: { organization_id: organization.id, id: { in: sampleStockIds } },
    });
    await transaction.masterLocation.deleteMany({
      where: { organization_id: organization.id, id: { in: ids("location") } },
    });
    await transaction.generalPurchaseOrderRequest.deleteMany({
      where: {
        organization_id: organization.id,
        raw_material_id: { in: ids("raw-material") },
      },
    });
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
      data: {
        status: "EMPTY",
        stage: "IDLE",
        checkpoint: {},
        last_error: null,
        sample_order_id: null,
        master_record_ids: Prisma.JsonNull,
      },
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
