import type { Prisma } from "@prisma/client";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import {
  ContactValidationError,
  normalizeAndValidateGstin,
} from "@/lib/services/master-data/contact-master-validation";
import { normalizeUppercase } from "@/lib/utilities/text-case";
import {
  LEGACY_MANAGEMENT_TASKS,
  type LegacyManagementDryRunResult,
  type LegacyManagementExecutionResult,
  type LegacyManagementOrganization,
  type LegacyManagementSampleChange,
  type LegacyManagementSampleSkip,
  type LegacyManagementStatus,
  type LegacyManagementTaskId,
  type LegacyManagementTaskRefreshResult,
} from "./legacy-management-contract";
import { resolveActivePosStockLocationByLeaf, PosStockLocationError } from "@/lib/services/pos/pos-stock-location-service";
import { buildFinishedGoodsSkuCode } from "@/lib/utilities/finished-goods-sku";
import {
  buildStyleColorVariantCode,
  MAX_VARIANT_CODE_LENGTH,
} from "@/lib/utilities/finished-goods-variant-code";

const BATCH_SIZE = 250;
const SAMPLE_CHANGE_LIMIT = 5;

const CONTACT_ADDRESS_SELECT = {
  id: true,
  country_code: true,
  state_code: true,
  state_name: true,
  is_active: true,
  tax_registration_id: true,
  tax_registration: {
    select: {
      gstin: true,
      state_code: true,
      status: true,
    },
  },
  contact: {
    select: {
      is_active: true,
      _count: {
        select: {
          purchase_orders: true,
          sales_orders: true,
          pos_sales_invoices: true,
          pos_coupon_issues: true,
          distributionQuotations: true,
        },
      },
    },
  },
} satisfies Prisma.ContactAddressSelect;

type ContactAddressCandidate = Prisma.ContactAddressGetPayload<{
  select: typeof CONTACT_ADDRESS_SELECT;
}>;

type LegacyManagementDatabase = Pick<
  Prisma.TransactionClient,
  | "contactAddress"
  | "merchandisingOrder"
  | "organization"
  | "organizationOrderCounter"
  | "platformMigrationAuditLog"
  | "masterArticleVariant"
  | "finishedGoodsSizeWise"
  | "finishedGoodsSkuStock"
  | "finishedGoodsGeneralStockReceipt"
  | "storageNode"
  | "masterLocation"
>;

type ContactAddressStateResult = {
  totalEligible: number;
  processedCount: number;
  skippedCount: number;
  sampleChanges: LegacyManagementSampleChange[];
};

type OrderSequenceResult = {
  totalEligible: number;
  previouslyProcessed: number;
  processedCount: number;
  skippedCount: number;
  sampleChanges: LegacyManagementSampleChange[];
};

type OrderVariantCodeCandidate = {
  id: string;
  orderNo: string;
  styleName: string | null;
  colors: string | null;
};

type LegacyTaskInspectionResult = {
  totalEligible: number;
  previouslyProcessed: number;
  processedCount: number;
  skippedCount: number;
  sampleChanges: LegacyManagementSampleChange[];
  sampleSkips: LegacyManagementSampleSkip[];
};

const ARTICLE_VARIANT_SELECT = {
  id: true,
  article_id: true,
  color_id: true,
  variant_code: true,
  article: { select: { article: true } },
  color: { select: { colors: true } },
} satisfies Prisma.MasterArticleVariantSelect;

type ArticleVariantCandidate = Prisma.MasterArticleVariantGetPayload<{
  select: typeof ARTICLE_VARIANT_SELECT;
}>;

const FINISHED_GOODS_IDENTIFIER_SELECT = {
  id: true,
  order_id: true,
  size: true,
  sku_code: true,
  barcode: true,
  order: {
    select: {
      organization_id: true,
      styleName: true,
      colors: true,
      finalStatus: true,
      workOrders: { take: 1, select: { id: true } },
      finishedGoodsGeneralStockReceipts: { take: 1, select: { id: true } },
      finishedGoodsAllocatedStockReceipts: { take: 1, select: { id: true } },
      qrPrintRequests: { take: 1, select: { id: true } },
    },
  },
  _count: {
    select: {
      workOrderLines: true,
      productionUpdateSizeLines: true,
      bundleTransferSizeLines: true,
    },
  },
} satisfies Prisma.FinishedGoodsSizeWiseSelect;

type FinishedGoodsIdentifierCandidate = Prisma.FinishedGoodsSizeWiseGetPayload<{
  select: typeof FINISHED_GOODS_IDENTIFIER_SELECT;
}>;

type StorageNodeCandidate = {
  id: string;
  node_code: string;
  node_name: string;
};

type StorageRecord = {
  id: string;
  entity_id: string;
  location_id: string;
};

const ADDRESS_STATE_CODES_BY_NAME: Readonly<Record<string, string>> = {
  "JAMMU AND KASHMIR": "01",
  "JAMMU & KASHMIR": "01",
  "HIMACHAL PRADESH": "02",
  PUNJAB: "03",
  CHANDIGARH: "04",
  UTTARAKHAND: "05",
  UTTARANCHAL: "05",
  HARYANA: "06",
  DELHI: "07",
  RAJASTHAN: "08",
  "UTTAR PRADESH": "09",
  BIHAR: "10",
  SIKKIM: "11",
  "ARUNACHAL PRADESH": "12",
  NAGALAND: "13",
  MANIPUR: "14",
  MIZORAM: "15",
  TRIPURA: "16",
  MEGHALAYA: "17",
  ASSAM: "18",
  "WEST BENGAL": "19",
  JHARKHAND: "20",
  ODISHA: "21",
  ORISSA: "21",
  CHHATTISGARH: "22",
  "MADHYA PRADESH": "23",
  GUJARAT: "24",
  "DAMAN AND DIU": "25",
  "DADRA AND NAGAR HAVELI": "26",
  MAHARASHTRA: "27",
  KARNATAKA: "29",
  GOA: "30",
  LAKSHADWEEP: "31",
  KERALA: "32",
  "TAMIL NADU": "33",
  PUDUCHERRY: "34",
  PONDICHERRY: "34",
  "ANDAMAN AND NICOBAR ISLANDS": "35",
  TELANGANA: "36",
  "ANDHRA PRADESH": "37",
  LADAKH: "38",
};

const TASK_IDS = new Set<string>(LEGACY_MANAGEMENT_TASKS.map(({ id }) => id));

function isLegacyManagementTaskId(value: string): value is LegacyManagementTaskId {
  return TASK_IDS.has(value);
}

async function requireLegacyManagementAdmin() {
  const admin = await requirePlatformSessionAdmin();
  if (admin.team_role !== "CTO") {
    throw new Error("CTO platform access is required for legacy management.");
  }
  return admin;
}

function validateOrganizationId(organizationId: string) {
  const normalizedId = organizationId.trim();
  if (!normalizedId || normalizedId.length > 128) {
    throw new Error("Select a valid target organization.");
  }
  return normalizedId;
}

function validateTaskId(taskId: string): LegacyManagementTaskId {
  if (!isLegacyManagementTaskId(taskId)) {
    throw new Error("Select a valid legacy management task.");
  }
  return taskId;
}

function getPrismaErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" && /^P\d{4}$/.test(error.code)
    ? error.code
    : undefined;
}

function getSafeTypeErrorDetail(error: unknown) {
  if (!(error instanceof TypeError)) return null;
  const message = error.message.trim();
  if (/^Cannot read properties of (?:undefined|null) \(reading '[A-Za-z0-9_]+'\)$/.test(message)) {
    return message;
  }
  if (/^[A-Za-z_$][A-Za-z0-9_$.]* is not a function$/.test(message)) {
    return message;
  }
  return null;
}

function getSafeExecutionFailureReason(error: unknown) {
  if (error instanceof ContactValidationError || error instanceof PosStockLocationError) {
    return error.message;
  }

  switch (getPrismaErrorCode(error)) {
    case "P2002":
      return "A unique-value conflict blocked the update. Review the target values and retry.";
    case "P2003":
      return "A related record is invalid or unavailable. Review the selected organization data.";
    case "P2021":
    case "P2022":
      return "A required database table or column is missing. Check pending migrations before retrying.";
    case "P2034":
      return "A concurrent update prevented the task from completing. Refresh the dry run and retry.";
    default:
      if (error instanceof Error && error.name === "PrismaClientValidationError") {
        return "Prisma rejected the update input. Verify the generated client and task query match the deployed schema.";
      }
      if (error instanceof Error && error.name === "PrismaClientUnknownRequestError") {
        return "The database rejected the task operation without a known error code. Check server logs and database readiness.";
      }
      if (error instanceof Error && error.name === "TypeError") {
        const detail = getSafeTypeErrorDetail(error);
        return detail
          ? `The task hit a runtime TypeError: ${detail}.`
          : "The task hit a runtime TypeError before completion. Check server logs for the failing operation.";
      }
      return `Unexpected task error (${error instanceof Error ? error.name : "UnknownError"}). Check server logs for the task failure details.`;
  }
}

function getSafeAuditFailureReason(error: unknown) {
  const errorCode = getPrismaErrorCode(error);
  if (errorCode === "P2021" || errorCode === "P2022") {
    return "The platform audit-log database schema is unavailable. Apply the pending audit-log migration in an approved environment before retrying.";
  }
  const typeErrorDetail = getSafeTypeErrorDetail(error);
  if (typeErrorDetail) {
    return `The failure audit raised a runtime TypeError: ${typeErrorDetail}.`;
  }
  const errorType = error instanceof Error ? error.name : "UnknownError";
  return `The failure audit could not be saved (${errorType}${errorCode ? `, ${errorCode}` : ""}). Check database readiness before retrying.`;
}

async function requireOrganization(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  if (!organization) throw new Error("The selected organization was not found.");
  return organization;
}

function getAddressStateCode(
  taskId: LegacyManagementTaskId,
  address: ContactAddressCandidate,
) {
  if (
    !address.is_active ||
    !address.contact.is_active ||
    address.contact._count.purchase_orders > 0 ||
    address.contact._count.sales_orders > 0 ||
    address.contact._count.pos_sales_invoices > 0 ||
    address.contact._count.pos_coupon_issues > 0 ||
    address.contact._count.distributionQuotations > 0
  ) {
    return null;
  }

  if (taskId === "contact-address-state-from-tax-registration") {
    const registration = address.tax_registration;
    if (!registration || registration.status !== "ACTIVE") return null;

    try {
      const gstinStateCode = normalizeAndValidateGstin(registration.gstin).stateCode;
      return registration.state_code === gstinStateCode ? gstinStateCode : null;
    } catch (error) {
      if (error instanceof ContactValidationError) return null;
      throw error;
    }
  }

  if (taskId === "contact-address-state-from-state-name") {
    const stateName = normalizeUppercase(address.state_name.trim());
    return ADDRESS_STATE_CODES_BY_NAME[stateName] ?? null;
  }

  return null;
}

function contactAddressWhere(
  organizationId: string,
  taskId: LegacyManagementTaskId,
): Prisma.ContactAddressWhereInput {
  return {
    organization_id: organizationId,
    country_code: "IN",
    state_code: null,
    tax_registration_id: taskId === "contact-address-state-from-tax-registration"
      ? { not: null }
      : null,
  };
}

function eligibleContactAddressWhere(
  organizationId: string,
  taskId: LegacyManagementTaskId,
  stateCode: string,
): Prisma.ContactAddressWhereInput {
  const noTransactionalHistory: Prisma.ContactWhereInput = {
    is_active: true,
    purchase_orders: { none: {} },
    sales_orders: { none: {} },
    pos_sales_invoices: { none: {} },
    pos_coupon_issues: { none: {} },
    distributionQuotations: { none: {} },
  };

  return {
    organization_id: organizationId,
    country_code: "IN",
    is_active: true,
    state_code: null,
    tax_registration_id: taskId === "contact-address-state-from-tax-registration"
      ? { not: null }
      : null,
    contact: { is: noTransactionalHistory },
    ...(taskId === "contact-address-state-from-tax-registration"
      ? {
          tax_registration: {
            is: {
              status: "ACTIVE",
              state_code: stateCode,
              gstin: { startsWith: stateCode },
            },
          },
        }
      : {}),
  };
}

async function processContactAddressStateCodes(
  database: LegacyManagementDatabase,
  organizationId: string,
  taskId: LegacyManagementTaskId,
  execute: boolean,
): Promise<ContactAddressStateResult> {
  let cursor: string | undefined;
  let totalEligible = 0;
  let processedCount = 0;
  let skippedCount = 0;
  const sampleChanges: LegacyManagementSampleChange[] = [];

  while (true) {
    const addresses = await database.contactAddress.findMany({
      where: contactAddressWhere(organizationId, taskId),
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: CONTACT_ADDRESS_SELECT,
    });
    if (addresses.length === 0) break;
    cursor = addresses[addresses.length - 1].id;

    const eligibleByStateCode = new Map<string, string[]>();
    for (const address of addresses) {
      const stateCode = getAddressStateCode(taskId, address);
      if (!stateCode) {
        skippedCount += 1;
        continue;
      }

      totalEligible += 1;
      if (sampleChanges.length < SAMPLE_CHANGE_LIMIT) {
        sampleChanges.push({
          subject: "Contact address GST state code",
          from: "MISSING",
          to: stateCode,
        });
      }

      const addressIds = eligibleByStateCode.get(stateCode) ?? [];
      addressIds.push(address.id);
      eligibleByStateCode.set(stateCode, addressIds);
    }

    if (execute) {
      for (const [stateCode, addressIds] of eligibleByStateCode) {
        const updated = await database.contactAddress.updateMany({
          where: {
            ...eligibleContactAddressWhere(organizationId, taskId, stateCode),
            id: { in: addressIds },
          },
          data: { state_code: stateCode },
        });
        processedCount += updated.count;
        skippedCount += addressIds.length - updated.count;
      }
    }

    if (addresses.length < BATCH_SIZE) break;
  }

  return { totalEligible, processedCount, skippedCount, sampleChanges };
}

async function inspectOrderNumberSequence(
  database: LegacyManagementDatabase,
  organizationId: string,
  execute: boolean,
): Promise<OrderSequenceResult> {
  let cursor: string | undefined;
  let highestSequence = 0;
  let skippedCount = 0;

  while (true) {
    const orders = await database.merchandisingOrder.findMany({
      where: { organization_id: organizationId },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, orderNo: true },
    });
    if (orders.length === 0) break;
    cursor = orders[orders.length - 1].id;

    for (const order of orders) {
      const match = /^OD-(\d+)$/.exec(order.orderNo);
      if (!match) {
        skippedCount += 1;
        continue;
      }

      const sequence = Number(match[1]);
      if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 2_147_483_647) {
        skippedCount += 1;
        continue;
      }
      highestSequence = Math.max(highestSequence, sequence);
    }

    if (orders.length < BATCH_SIZE) break;
  }

  const counter = await database.organizationOrderCounter.findUnique({
    where: { organization_id: organizationId },
    select: { current_value: true },
  });
  const needsUpdate = highestSequence > 0
    && (!counter || counter.current_value < highestSequence);
  const previouslyProcessed = highestSequence > 0
    && counter !== null
    && counter.current_value >= highestSequence
    ? 1
    : 0;
  let processedCount = 0;

  if (execute && needsUpdate) {
    if (!counter) {
      const created = await database.organizationOrderCounter.createMany({
        data: [{ organization_id: organizationId, current_value: highestSequence }],
        skipDuplicates: true,
      });
      processedCount += created.count;
    }

    if (processedCount === 0) {
      const updated = await database.organizationOrderCounter.updateMany({
        where: {
          organization_id: organizationId,
          current_value: { lt: highestSequence },
        },
        data: { current_value: highestSequence },
      });
      processedCount += updated.count;
    }
  }

  const sampleChanges = needsUpdate
    ? [{
        subject: "Organization order counter",
        from: counter ? String(counter.current_value) : "NOT INITIALIZED",
        to: String(highestSequence),
      }]
    : [];

  return {
    totalEligible: needsUpdate ? 1 : 0,
    previouslyProcessed,
    processedCount,
    skippedCount,
    sampleChanges,
  };
}

async function inspectOrderVariantCodes(
  database: LegacyManagementDatabase,
  organizationId: string,
  execute: boolean,
): Promise<LegacyTaskInspectionResult> {
  const previouslyProcessed = await database.merchandisingOrder.count({
    where: { organization_id: organizationId, variantCode: { not: null } },
  });
  let cursor: string | undefined;
  let totalEligible = 0;
  let processedCount = 0;
  let skippedCount = 0;
  const sampleChanges: LegacyManagementSampleChange[] = [];
  const sampleSkips: LegacyManagementSampleSkip[] = [];

  while (true) {
    const orders: OrderVariantCodeCandidate[] = await database.merchandisingOrder.findMany({
      where: { organization_id: organizationId, variantCode: null },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, orderNo: true, styleName: true, colors: true },
    });
    if (orders.length === 0) break;
    cursor = orders[orders.length - 1].id;

    for (const order of orders) {
      const code = buildStyleColorVariantCode(order.styleName, order.colors);
      if (!code) {
        skippedCount += 1;
        if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
          sampleSkips.push({
            subject: `Order ${order.orderNo}`,
            reason: "Style Name or Colour is missing or cannot produce a Variant Code.",
          });
        }
        continue;
      }
      if (code.length > MAX_VARIANT_CODE_LENGTH) {
        skippedCount += 1;
        if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
          sampleSkips.push({
            subject: `Order ${order.orderNo}`,
            reason: `The normalized Variant Code exceeds ${MAX_VARIANT_CODE_LENGTH} characters.`,
          });
        }
        continue;
      }

      totalEligible += 1;
      if (sampleChanges.length < SAMPLE_CHANGE_LIMIT) {
        sampleChanges.push({
          subject: `Order ${order.orderNo}`,
          from: "MISSING",
          to: code,
        });
      }
      if (!execute) continue;

      const updated = await database.merchandisingOrder.updateMany({
        where: {
          organization_id: organizationId,
          id: order.id,
          variantCode: null,
          styleName: order.styleName,
          colors: order.colors,
        },
        data: { variantCode: code },
      });
      processedCount += updated.count;
      if (updated.count !== 1) {
        skippedCount += 1;
        if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
          sampleSkips.push({
            subject: `Order ${order.orderNo}`,
            reason: "The order changed after inspection; refresh before retrying.",
          });
        }
      }
    }

    if (orders.length < BATCH_SIZE) break;
  }

  return {
    totalEligible,
    previouslyProcessed,
    processedCount,
    skippedCount,
    sampleChanges,
    sampleSkips,
  };
}

function expectedStyleColorVariantCode(variant: ArticleVariantCandidate) {
  const code = buildStyleColorVariantCode(variant.article.article, variant.color.colors);
  return code && code.length <= MAX_VARIANT_CODE_LENGTH ? code : null;
}

function rememberLimitedValue(map: Map<string, Set<string>>, key: string, value: string) {
  const values = map.get(key) ?? new Set<string>();
  if (values.size < 2) values.add(value);
  map.set(key, values);
}

async function inspectArticleVariantCodes(
  database: LegacyManagementDatabase,
  organizationId: string,
  execute: boolean,
): Promise<LegacyTaskInspectionResult> {
  const variants: ArticleVariantCandidate[] = [];
  const currentCodes = new Map<string, Set<string>>();
  let cursor: string | undefined;

  while (true) {
    const batch = await database.masterArticleVariant.findMany({
      where: {
        organization_id: organizationId,
        article: { organization_id: organizationId },
        color: { organization_id: organizationId },
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: ARTICLE_VARIANT_SELECT,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    variants.push(...batch);
    for (const variant of batch) {
      if (variant.variant_code?.trim()) {
        rememberLimitedValue(
          currentCodes,
          variant.variant_code.trim().toLocaleLowerCase(),
          variant.id,
        );
      }
    }
    if (batch.length < BATCH_SIZE) break;
  }

  const expectedCodeCounts = new Map<string, number>();
  for (const variant of variants) {
    const expectedCode = expectedStyleColorVariantCode(variant);
    if (!expectedCode) continue;
    const key = expectedCode.toLocaleLowerCase();
    expectedCodeCounts.set(key, (expectedCodeCounts.get(key) ?? 0) + 1);
  }

  let totalEligible = 0;
  let previouslyProcessed = 0;
  let processedCount = 0;
  let skippedCount = 0;
  const sampleChanges: LegacyManagementSampleChange[] = [];
  const sampleSkips: LegacyManagementSampleSkip[] = [];

  for (const variant of variants) {
    const expectedCode = expectedStyleColorVariantCode(variant);
    const currentCode = variant.variant_code?.trim() ?? "";
    if (expectedCode && currentCode.toLocaleLowerCase() === expectedCode.toLocaleLowerCase()) {
      previouslyProcessed += 1;
      continue;
    }

    let skipReason: string | null = null;
    if (!expectedCode) {
      skipReason = "Style name or color cannot produce a valid variant code within 100 characters.";
    } else if ((expectedCodeCounts.get(expectedCode.toLocaleLowerCase()) ?? 0) > 1) {
      skipReason = "Multiple variants normalize to the same proposed code.";
    } else if ((currentCodes.get(expectedCode.toLocaleLowerCase()) ?? new Set()).size > 0
      && !(currentCode.toLocaleLowerCase() === expectedCode.toLocaleLowerCase())) {
      skipReason = "The proposed code is already assigned to another variant.";
    }

    if (skipReason) {
      skippedCount += 1;
      if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
        sampleSkips.push({ subject: "Article variant code", reason: skipReason });
      }
      continue;
    }
    if (!expectedCode) continue;

    totalEligible += 1;
    if (sampleChanges.length < SAMPLE_CHANGE_LIMIT) {
      sampleChanges.push({
        subject: "Article variant code",
        from: currentCode || "MISSING",
        to: expectedCode,
      });
    }
    if (execute) {
      const updated = await database.masterArticleVariant.updateMany({
        where: {
          organization_id: organizationId,
          id: variant.id,
          article_id: variant.article_id,
          color_id: variant.color_id,
          variant_code: variant.variant_code,
        },
        data: { variant_code: expectedCode },
      });
      processedCount += updated.count;
      if (updated.count !== 1) {
        skippedCount += 1;
        if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
          sampleSkips.push({
            subject: "Article variant code",
            reason: "The record changed after inspection; refresh before retrying.",
          });
        }
      }
    }
  }

  return {
    totalEligible,
    previouslyProcessed,
    processedCount,
    skippedCount,
    sampleChanges,
    sampleSkips,
  };
}

function finishedGoodsSourceKey(
  styleName: string | null,
  color: string | null,
  size: string | null,
) {
  const parts = [styleName, color, size].map((value) =>
    normalizeUppercase(value ?? "").trim(),
  );
  return parts.every(Boolean) ? parts.join("\u0000") : null;
}

async function scanFinishedGoodsIdentifierIndex(
  database: LegacyManagementDatabase,
  organizationId: string,
) {
  const skuCodesBySource = new Map<string, Set<string>>();
  const sourceKeysBySku = new Map<string, Set<string>>();
  const barcodesBySource = new Map<string, Set<string>>();
  let previouslyProcessed = 0;
  let cursor: string | undefined;

  while (true) {
    const rows = await database.finishedGoodsSizeWise.findMany({
      where: { order: { is: { organization_id: organizationId } } },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        sku_code: true,
        barcode: true,
        size: true,
        order: { select: { styleName: true, colors: true } },
      },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      const sourceKey = finishedGoodsSourceKey(row.order.styleName, row.order.colors, row.size);
      const skuCode = row.sku_code?.trim();
      const barcode = row.barcode?.trim();
      if (sourceKey && skuCode) {
        rememberLimitedValue(skuCodesBySource, sourceKey, skuCode);
        rememberLimitedValue(sourceKeysBySku, skuCode.toLocaleLowerCase(), sourceKey);
      }
      if (sourceKey && barcode) rememberLimitedValue(barcodesBySource, sourceKey, barcode);
      if (skuCode && barcode) previouslyProcessed += 1;
    }
    if (rows.length < BATCH_SIZE) break;
  }

  return { skuCodesBySource, sourceKeysBySku, barcodesBySource, previouslyProcessed };
}

function finishedGoodsRowSkipReason(row: FinishedGoodsIdentifierCandidate) {
  if (row.order.finalStatus !== "Draft") {
    return "Only draft orders can be backfilled; preserve submitted or historical records.";
  }
  if (
    row.order.workOrders.length > 0 ||
    row.order.finishedGoodsGeneralStockReceipts.length > 0 ||
    row.order.finishedGoodsAllocatedStockReceipts.length > 0 ||
    row.order.qrPrintRequests.length > 0 ||
    row._count.workOrderLines > 0 ||
    row._count.productionUpdateSizeLines > 0 ||
    row._count.bundleTransferSizeLines > 0
  ) {
    return "The finished-goods row has operational or print history.";
  }
  return null;
}

async function inspectFinishedGoodsIdentifiers(
  database: LegacyManagementDatabase,
  organizationId: string,
  execute: boolean,
): Promise<LegacyTaskInspectionResult> {
  const index = await scanFinishedGoodsIdentifierIndex(database, organizationId);
  let cursor: string | undefined;
  let totalEligible = 0;
  let skippedCount = 0;
  let processedCount = 0;
  const sampleChanges: LegacyManagementSampleChange[] = [];
  const sampleSkips: LegacyManagementSampleSkip[] = [];

  while (true) {
    const rows = await database.finishedGoodsSizeWise.findMany({
      where: {
        order: { is: { organization_id: organizationId } },
        OR: [{ sku_code: null }, { sku_code: "" }, { barcode: null }, { barcode: "" }],
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: FINISHED_GOODS_IDENTIFIER_SELECT,
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    const eligibleBySource = new Map<string, Array<{
      row: FinishedGoodsIdentifierCandidate;
      skuCode: string;
      barcode: string;
      data: { sku_code?: string; barcode?: string };
    }>>();

    for (const row of rows) {
      const missingSku = !row.sku_code?.trim();
      const missingBarcode = !row.barcode?.trim();
      if (!missingSku && !missingBarcode) continue;

      const lifecycleReason = finishedGoodsRowSkipReason(row);
      const sourceKey = finishedGoodsSourceKey(row.order.styleName, row.order.colors, row.size);
      const skuCode = buildFinishedGoodsSkuCode(row.order.styleName, row.order.colors, row.size);
      let reason = lifecycleReason;
      if (!reason && (!sourceKey || !skuCode)) {
        reason = "Style, color, and size are required to derive the canonical SKU.";
      }

      if (!reason && missingSku) {
        const existingCodes = index.skuCodesBySource.get(sourceKey!) ?? new Set<string>();
        if ([...existingCodes].some((existingCode) => existingCode.toLocaleLowerCase() !== skuCode!.toLocaleLowerCase())) {
          reason = "Another row for this variant has a different SKU; preserve existing identifiers.";
        }
        const existingOwners = index.sourceKeysBySku.get(skuCode!.toLocaleLowerCase()) ?? new Set<string>();
        if ([...existingOwners].some((owner) => owner !== sourceKey)) {
          reason = "The derived SKU is already used by another variant.";
        }
      }

      let barcode = row.barcode?.trim() ?? "";
      if (!reason && missingBarcode) {
        const existingBarcodes = index.barcodesBySource.get(sourceKey!) ?? new Set<string>();
        if (existingBarcodes.size !== 1) {
          reason = existingBarcodes.size === 0
            ? "No existing barcode source is available; assign it through the originating order workflow."
            : "Conflicting barcodes exist for this variant; manual review is required.";
        } else {
          barcode = [...existingBarcodes][0];
        }
      }

      if (reason) {
        skippedCount += 1;
        if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
          sampleSkips.push({ subject: "Finished-goods SKU/barcode", reason });
        }
        continue;
      }

      const data: { sku_code?: string; barcode?: string } = {};
      if (missingSku) data.sku_code = skuCode!;
      if (missingBarcode) data.barcode = barcode;
      const group = eligibleBySource.get(sourceKey!) ?? [];
      group.push({ row, skuCode: skuCode!, barcode, data });
      eligibleBySource.set(sourceKey!, group);
    }

    for (const group of eligibleBySource.values()) {
      for (const item of group) {
        totalEligible += 1;
        if (sampleChanges.length < SAMPLE_CHANGE_LIMIT) {
          sampleChanges.push({
            subject: "Finished-goods SKU/barcode",
            from: [item.row.sku_code?.trim() || "SKU MISSING", item.row.barcode?.trim() || "BARCODE MISSING"].join(" / "),
            to: [item.skuCode, item.barcode].join(" / "),
          });
        }

        if (execute) {
          const updated = await database.finishedGoodsSizeWise.updateMany({
            where: {
              id: item.row.id,
              order_id: item.row.order_id,
              sku_code: item.row.sku_code,
              barcode: item.row.barcode,
              order: {
                is: {
                  organization_id: organizationId,
                  finalStatus: "Draft",
                  workOrders: { none: {} },
                  finishedGoodsGeneralStockReceipts: { none: {} },
                  finishedGoodsAllocatedStockReceipts: { none: {} },
                  qrPrintRequests: { none: {} },
                },
              },
              workOrderLines: { none: {} },
              productionUpdateSizeLines: { none: {} },
              bundleTransferSizeLines: { none: {} },
            },
            data: item.data,
          });
          processedCount += updated.count;
          if (updated.count !== 1) {
            skippedCount += 1;
            if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
              sampleSkips.push({
                subject: "Finished-goods SKU/barcode",
                reason: "The row changed after inspection; refresh before retrying.",
              });
            }
          }
        }
      }
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return {
    totalEligible,
    previouslyProcessed: index.previouslyProcessed,
    processedCount,
    skippedCount,
    sampleChanges,
    sampleSkips,
  };
}

async function findUniqueStorageNode(
  database: LegacyManagementDatabase,
  organizationId: string,
  entityId: string,
  locationId: string,
): Promise<StorageNodeCandidate | null> {
  const candidates = await database.storageNode.findMany({
    where: {
      organization_id: organizationId,
      node_type: "SUB_STORE",
      is_active: true,
      parent: {
        is: {
          organization_id: organizationId,
          node_type: "WAREHOUSE",
          is_active: true,
          parent: {
            is: {
              organization_id: organizationId,
              node_type: "LOCATION_SITE",
              entity_id: entityId,
              master_location_id: locationId,
              is_active: true,
              parent_node_id: null,
              parent_node_type: null,
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
    take: 2,
    select: { id: true, node_code: true, node_name: true },
  });
  if (candidates.length !== 1) return null;

  try {
    await resolveActivePosStockLocationByLeaf(
      database,
      organizationId,
      candidates[0].id,
      entityId,
      locationId,
    );
    return candidates[0];
  } catch (error) {
    if (error instanceof PosStockLocationError) return null;
    throw error;
  }
}

async function inspectUnmappedStorageTable(
  database: LegacyManagementDatabase,
  organizationId: string,
  table: "sku" | "general",
  execute: boolean,
  resolveNode: (entityId: string, locationId: string) => Promise<StorageNodeCandidate | null>,
): Promise<Omit<LegacyTaskInspectionResult, "previouslyProcessed">> {
  let cursor: string | undefined;
  let totalEligible = 0;
  let processedCount = 0;
  let skippedCount = 0;
  const sampleChanges: LegacyManagementSampleChange[] = [];
  const sampleSkips: LegacyManagementSampleSkip[] = [];

  while (true) {
    const records: StorageRecord[] = table === "sku"
      ? await database.finishedGoodsSkuStock.findMany({
          where: { organization_id: organizationId, storage_node_id: null },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, entity_id: true, location_id: true },
        })
      : await database.finishedGoodsGeneralStockReceipt.findMany({
          where: { organization_id: organizationId, storage_node_id: null },
          orderBy: { id: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, entity_id: true, location_id: true },
        });
    if (records.length === 0) break;
    cursor = records[records.length - 1].id;

    const updateGroups = new Map<string, { node: StorageNodeCandidate; recordIds: string[] }>();
    for (const record of records) {
      const node = await resolveNode(record.entity_id, record.location_id);
      if (!node) {
        skippedCount += 1;
        if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
          sampleSkips.push({
            subject: "Finished-goods stock location",
            reason: "No single active Sub-sub-location matches this record's entity and location.",
          });
        }
        continue;
      }

      totalEligible += 1;
      if (sampleChanges.length < SAMPLE_CHANGE_LIMIT) {
        sampleChanges.push({
          subject: table === "sku" ? "Finished-goods SKU stock location" : "Finished-goods receipt location",
          from: "UNMAPPED",
          to: node.node_name,
        });
      }
      const group = updateGroups.get(node.id) ?? { node, recordIds: [] };
      group.recordIds.push(record.id);
      updateGroups.set(node.id, group);
    }

    if (execute) {
      for (const [storageNodeId, group] of updateGroups) {
        const updated = table === "sku"
          ? await database.finishedGoodsSkuStock.updateMany({
              where: {
                organization_id: organizationId,
                id: { in: group.recordIds },
                storage_node_id: null,
              },
              data: { storage_node_id: storageNodeId },
            })
          : await database.finishedGoodsGeneralStockReceipt.updateMany({
              where: {
                organization_id: organizationId,
                id: { in: group.recordIds },
                storage_node_id: null,
              },
              data: { storage_node_id: storageNodeId },
            });
        processedCount += updated.count;
        if (updated.count !== group.recordIds.length) {
          const concurrentSkips = group.recordIds.length - updated.count;
          skippedCount += concurrentSkips;
          if (sampleSkips.length < SAMPLE_CHANGE_LIMIT) {
            sampleSkips.push({
              subject: "Finished-goods stock location",
              reason: "Some records changed after inspection; refresh before retrying.",
            });
          }
        }
      }
    }
    if (records.length < BATCH_SIZE) break;
  }

  return { totalEligible, processedCount, skippedCount, sampleChanges, sampleSkips };
}

async function inspectFinishedGoodsStorageNodes(
  database: LegacyManagementDatabase,
  organizationId: string,
  execute: boolean,
): Promise<LegacyTaskInspectionResult> {
  const [mappedSkuStock, mappedGeneralReceipts] = await Promise.all([
    database.finishedGoodsSkuStock.count({
      where: { organization_id: organizationId, storage_node_id: { not: null } },
    }),
    database.finishedGoodsGeneralStockReceipt.count({
      where: { organization_id: organizationId, storage_node_id: { not: null } },
    }),
  ]);
  const nodeCache = new Map<string, Promise<StorageNodeCandidate | null>>();
  const resolveNode = (entityId: string, locationId: string) => {
    const key = `${entityId}\u0000${locationId}`;
    let pending = nodeCache.get(key);
    if (!pending) {
      pending = findUniqueStorageNode(database, organizationId, entityId, locationId);
      nodeCache.set(key, pending);
    }
    return pending;
  };

  const skuStock = await inspectUnmappedStorageTable(
    database,
    organizationId,
    "sku",
    execute,
    resolveNode,
  );
  const generalReceipts = await inspectUnmappedStorageTable(
    database,
    organizationId,
    "general",
    execute,
    resolveNode,
  );
  return {
    totalEligible: skuStock.totalEligible + generalReceipts.totalEligible,
    previouslyProcessed: mappedSkuStock + mappedGeneralReceipts,
    processedCount: skuStock.processedCount + generalReceipts.processedCount,
    skippedCount: skuStock.skippedCount + generalReceipts.skippedCount,
    sampleChanges: [...skuStock.sampleChanges, ...generalReceipts.sampleChanges].slice(0, SAMPLE_CHANGE_LIMIT),
    sampleSkips: [...skuStock.sampleSkips, ...generalReceipts.sampleSkips].slice(0, SAMPLE_CHANGE_LIMIT),
  };
}

async function previouslyProcessedCount(
  organizationId: string,
  taskId: LegacyManagementTaskId,
) {
  const result = await prisma.platformMigrationAuditLog.aggregate({
    where: {
      organization_id: organizationId,
      task_id: taskId,
      status: { in: ["SUCCESS", "PARTIAL"] },
    },
    _sum: { records_processed: true },
  });
  return result._sum.records_processed ?? 0;
}

export async function listLegacyManagementOrganizations(): Promise<LegacyManagementOrganization[]> {
  await requireLegacyManagementAdmin();

  const organizations = await prisma.organization.findMany({
    orderBy: [{ organization_name: "asc" }, { id: "asc" }],
    take: 500,
    select: { id: true, organization_name: true },
  });

  return organizations.map((organization) => ({
    id: organization.id,
    name: organization.organization_name,
  }));
}

export async function dryRunLegacyManagementTask(
  taskIdValue: string,
  organizationIdValue: string,
): Promise<LegacyManagementDryRunResult> {
  await requireLegacyManagementAdmin();
  const taskId = validateTaskId(taskIdValue);
  const organizationId = validateOrganizationId(organizationIdValue);
  await requireOrganization(organizationId);

  return dryRunTaskForOrganization(taskId, organizationId);
}

async function dryRunTaskForOrganization(
  taskId: LegacyManagementTaskId,
  organizationId: string,
): Promise<LegacyManagementDryRunResult> {
  if (taskId === "legacy-order-number-sequences") {
    const result = await inspectOrderNumberSequence(prisma, organizationId, false);
    return {
      totalEligible: result.totalEligible,
      previouslyProcessed: result.previouslyProcessed,
      sampleChanges: result.sampleChanges,
      skippedCount: result.skippedCount,
    };
  }

  if (taskId === "legacy-order-variant-codes") {
    const result = await inspectOrderVariantCodes(prisma, organizationId, false);
    return {
      totalEligible: result.totalEligible,
      previouslyProcessed: result.previouslyProcessed,
      sampleChanges: result.sampleChanges,
      skippedCount: result.skippedCount,
      sampleSkips: result.sampleSkips,
    };
  }

  if (taskId === "legacy-article-variant-code-format") {
    const result = await inspectArticleVariantCodes(prisma, organizationId, false);
    return {
      totalEligible: result.totalEligible,
      previouslyProcessed: result.previouslyProcessed,
      sampleChanges: result.sampleChanges,
      skippedCount: result.skippedCount,
      sampleSkips: result.sampleSkips,
    };
  }

  if (taskId === "legacy-finished-goods-identifiers") {
    const result = await inspectFinishedGoodsIdentifiers(prisma, organizationId, false);
    return {
      totalEligible: result.totalEligible,
      previouslyProcessed: result.previouslyProcessed,
      sampleChanges: result.sampleChanges,
      skippedCount: result.skippedCount,
      sampleSkips: result.sampleSkips,
    };
  }

  if (taskId === "legacy-finished-goods-storage-nodes") {
    const result = await inspectFinishedGoodsStorageNodes(prisma, organizationId, false);
    return {
      totalEligible: result.totalEligible,
      previouslyProcessed: result.previouslyProcessed,
      sampleChanges: result.sampleChanges,
      skippedCount: result.skippedCount,
      sampleSkips: result.sampleSkips,
    };
  }

  const result = await processContactAddressStateCodes(prisma, organizationId, taskId, false);
  return {
    totalEligible: result.totalEligible,
    previouslyProcessed: await previouslyProcessedCount(organizationId, taskId),
    sampleChanges: result.sampleChanges,
    skippedCount: result.skippedCount,
  };
}

function getTaskRefreshStatus(
  result: LegacyManagementDryRunResult,
): LegacyManagementStatus {
  if (result.skippedCount > 0) return "PARTIAL";
  if (result.totalEligible > 0 || result.previouslyProcessed === 0) return "DRY_RUN_PASSED";
  return "COMPLETED";
}

export async function refreshLegacyManagementTasks(
  organizationIdValue: string,
): Promise<LegacyManagementTaskRefreshResult[]> {
  await requireLegacyManagementAdmin();
  const organizationId = validateOrganizationId(organizationIdValue);
  await requireOrganization(organizationId);

  const refreshedTasks: LegacyManagementTaskRefreshResult[] = [];
  for (const task of LEGACY_MANAGEMENT_TASKS) {
    const result = await dryRunTaskForOrganization(task.id, organizationId);
    refreshedTasks.push({
      taskId: task.id,
      ...result,
      status: getTaskRefreshStatus(result),
    });
  }
  return refreshedTasks;
}

export async function executeLegacyManagementTask(
  taskIdValue: string,
  organizationIdValue: string,
): Promise<LegacyManagementExecutionResult> {
  const admin = await requireLegacyManagementAdmin();
  const taskId = validateTaskId(taskIdValue);
  const taskName = LEGACY_MANAGEMENT_TASKS.find((task) => task.id === taskId)?.name;
  if (!taskName) throw new Error("Select a valid legacy management task.");
  const organizationId = validateOrganizationId(organizationIdValue);
  await requireOrganization(organizationId);

  try {
    return await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.findUnique({
        where: { id: organizationId },
        select: { id: true },
      });
      if (!organization) throw new Error("The selected organization was not found.");

      let result: {
        processedCount: number;
        skippedCount: number;
        sampleSkips?: LegacyManagementSampleSkip[];
      };
      if (taskId === "legacy-order-number-sequences") {
        result = await inspectOrderNumberSequence(transaction, organization.id, true);
      } else if (taskId === "legacy-order-variant-codes") {
        result = await inspectOrderVariantCodes(transaction, organization.id, true);
      } else if (taskId === "legacy-article-variant-code-format") {
        result = await inspectArticleVariantCodes(transaction, organization.id, true);
      } else if (taskId === "legacy-finished-goods-identifiers") {
        result = await inspectFinishedGoodsIdentifiers(transaction, organization.id, true);
      } else if (taskId === "legacy-finished-goods-storage-nodes") {
        result = await inspectFinishedGoodsStorageNodes(transaction, organization.id, true);
      } else {
        result = await processContactAddressStateCodes(
          transaction,
          organization.id,
          taskId,
          true,
        );
      }
      const status = result.skippedCount > 0 ? "PARTIAL" : "SUCCESS";

      await transaction.platformMigrationAuditLog.create({
        data: {
          task_id: taskId,
          task_name: taskName,
          organization_id: organization.id,
          executed_by: admin.id,
          status,
          records_processed: result.processedCount,
          records_skipped: result.skippedCount,
          ...(result.sampleSkips?.length
            ? { error_details: { skippedExamples: result.sampleSkips } }
            : {}),
        },
      });

      return {
        processedCount: result.processedCount,
        skippedCount: result.skippedCount,
        status,
        ...(result.sampleSkips ? { sampleSkips: result.sampleSkips } : {}),
      };
    }, {
      isolationLevel: "Serializable",
      maxWait: 5_000,
      timeout: 60_000,
    });
  } catch (error) {
    const failureReason = getSafeExecutionFailureReason(error);
    const errorCode = getPrismaErrorCode(error);
    try {
      await prisma.platformMigrationAuditLog.create({
        data: {
          task_id: taskId,
          task_name: taskName,
          organization_id: organizationId,
          executed_by: admin.id,
          status: "FAILED",
          records_processed: 0,
          records_skipped: 0,
          error_details: {
            message: failureReason,
            errorType: error instanceof Error ? error.name : "UnknownError",
            ...(errorCode ? { errorCode } : {}),
          },
        },
      });
    } catch (auditError) {
      console.error("Legacy management failure audit could not be written.", {
        taskId,
        errorType: auditError instanceof Error ? auditError.name : "UnknownError",
        errorCode: getPrismaErrorCode(auditError),
      });
      throw new Error(
        `Legacy task was rolled back. Task failure: ${failureReason} Failure audit failure: ${getSafeAuditFailureReason(auditError)}`,
      );
    }

    console.error("Legacy management task execution failed.", {
      taskId,
      errorType: error instanceof Error ? error.name : "UnknownError",
      errorCode,
    });
    throw new Error(
      `Legacy task was rolled back. Failure reason: ${failureReason} A failure audit was recorded.`,
    );
  }
}
