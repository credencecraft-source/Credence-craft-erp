import {
  Prisma,
  PosOfferScope,
  PosOfferStatus,
  PosOfferType,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { GENERAL_FINISHED_GOODS_SKU_SOURCES } from "@/lib/services/inventory/finished-goods-stock-overview";
import { normalizeUppercase } from "@/lib/utilities/text-case";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

const MAX_TARGETS = 100;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 100;
const MAX_ELIGIBLE_OFFERS = 100;
const OFFER_INCLUDE = {
  targets: {
    select: {
      id: true,
      category: { select: { category_name: true } },
      color: { select: { colors: true } },
      size: { select: { size: true } },
    },
  },
} satisfies Prisma.PosOfferInclude;

export class PosOfferValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosOfferValidationError";
  }
}

export class PosOfferConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosOfferConflictError";
  }
}

export class PosOfferNotFoundError extends Error {
  constructor() {
    super("The POS offer was not found in this organization.");
    this.name = "PosOfferNotFoundError";
  }
}

export type PosOfferInput = {
  organizationId: string;
  actorId: string;
  requestKey: string;
  offerCode: string;
  name: string;
  description?: string | null;
  offerType: PosOfferType;
  scope: PosOfferScope;
  status: PosOfferStatus;
  discountAmount?: string | null;
  discountPercentage?: string | null;
  buyQuantity?: string | null;
  getQuantity?: string | null;
  getDiscountPercentage?: string | null;
  comboPrice?: string | null;
  startsAt: string;
  endsAt?: string | null;
  targetIds?: string[];
};

export type PosOfferCursor = {
  id: string;
  createdAt: Date;
};

function parseMoney(value: string | null | undefined, field: string, allowZero = false) {
  const normalized = value?.trim() ?? "";
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new PosOfferValidationError(`${field} must be a valid amount with up to two decimal places.`);
  }
  const amount = new Prisma.Decimal(normalized);
  if (!amount.isFinite() || amount.gt("999999999999.99") || (allowZero ? amount.lt(0) : amount.lte(0))) {
    throw new PosOfferValidationError(`${field} is outside the allowed range.`);
  }
  return amount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function parsePercentage(value: string | null | undefined, field: string, allowZero = false) {
  const amount = parseMoney(value, field, allowZero);
  if (amount.gt(100)) {
    throw new PosOfferValidationError(`${field} cannot exceed 100%.`);
  }
  return amount;
}

function parseQuantity(value: string | null | undefined, field: string) {
  const normalized = value?.trim() ?? "";
  if (!/^[1-9]\d{0,8}$/.test(normalized)) {
    throw new PosOfferValidationError(`${field} must be a whole number greater than zero.`);
  }
  const quantity = Number(normalized);
  if (!Number.isSafeInteger(quantity) || quantity > 2_147_483_647) {
    throw new PosOfferValidationError(`${field} is outside the allowed range.`);
  }
  return quantity;
}

function parseDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PosOfferValidationError(`${field} must be a valid date.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new PosOfferValidationError(`${field} must be a valid date.`);
  }
  return parsed;
}

function normalizeText(value: string | null | undefined, field: string, maxLength: number, required = false) {
  const normalized = normalizeUppercase(value?.trim() ?? "");
  if (required && !normalized) {
    throw new PosOfferValidationError(`${field} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new PosOfferValidationError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized || null;
}

function normalizeTargets(scope: PosOfferScope, targetIds: string[] | undefined) {
  const ids = targetIds ?? [];
  if (!Array.isArray(ids) || ids.length > MAX_TARGETS) {
    throw new PosOfferValidationError(`Select no more than ${MAX_TARGETS} offer targets.`);
  }
  const normalizedIds = ids.map((id) => id.trim());
  if (normalizedIds.some((id) => !id || id.length > 100)) {
    throw new PosOfferValidationError("Every selected offer target must be valid.");
  }
  if (new Set(normalizedIds).size !== normalizedIds.length) {
    throw new PosOfferValidationError("An offer target cannot be selected more than once.");
  }
  if (scope === PosOfferScope.ALL && normalizedIds.length) {
    throw new PosOfferValidationError("Offers for all items cannot include individual targets.");
  }
  if (scope !== PosOfferScope.ALL && !normalizedIds.length) {
    throw new PosOfferValidationError("Select at least one target for this offer scope.");
  }
  return normalizedIds;
}

function normalizeInput(input: PosOfferInput) {
  const requestKey = input.requestKey.trim();
  if (!requestKey || requestKey.length > 100) {
    throw new PosOfferValidationError("A valid offer request key is required.");
  }

  const offerCode = normalizeText(input.offerCode, "Offer code", 60, true)!;
  if (!/^[A-Z0-9][A-Z0-9_-]{1,59}$/.test(offerCode)) {
    throw new PosOfferValidationError("Offer code must use 2-60 letters, numbers, hyphens, or underscores.");
  }
  const name = normalizeText(input.name, "Offer name", 150, true)!;
  const description = normalizeText(input.description, "Description", 500);
  const startsAt = parseDate(input.startsAt, "Start date");
  const endsAt = input.endsAt?.trim() ? parseDate(input.endsAt, "End date") : null;
  if (endsAt && endsAt < startsAt) {
    throw new PosOfferValidationError("End date cannot be earlier than the start date.");
  }
  if (!Object.values(PosOfferType).includes(input.offerType)) {
    throw new PosOfferValidationError("Select a valid offer type.");
  }
  if (!Object.values(PosOfferScope).includes(input.scope)) {
    throw new PosOfferValidationError("Select a valid offer scope.");
  }
  if (!Object.values(PosOfferStatus).includes(input.status)) {
    throw new PosOfferValidationError("Select a valid offer status.");
  }

  const values = {
    discount_amount: null as Prisma.Decimal | null,
    discount_percentage: null as Prisma.Decimal | null,
    buy_quantity: null as number | null,
    get_quantity: null as number | null,
    get_discount_percentage: null as Prisma.Decimal | null,
    combo_price: null as Prisma.Decimal | null,
  };
  switch (input.offerType) {
    case PosOfferType.FLAT_AMOUNT:
      values.discount_amount = parseMoney(input.discountAmount, "Discount amount");
      break;
    case PosOfferType.PERCENTAGE:
      values.discount_percentage = parsePercentage(input.discountPercentage, "Discount percentage");
      break;
    case PosOfferType.BUY_ONE_GET_ONE:
      values.buy_quantity = parseQuantity(input.buyQuantity, "Buy quantity");
      values.get_quantity = parseQuantity(input.getQuantity, "Get quantity");
      values.get_discount_percentage = parsePercentage(
        input.getDiscountPercentage,
        "Free item discount percentage",
        true,
      );
      break;
    case PosOfferType.COMBO:
      values.combo_price = parseMoney(input.comboPrice, "Combo price", true);
      break;
  }

  return {
    requestKey,
    offerCode,
    name,
    description,
    startsAt,
    endsAt,
    values,
    targetIds: normalizeTargets(input.scope, input.targetIds),
  };
}

async function validateTargets(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  scope: PosOfferScope,
  targetIds: string[],
) {
  if (scope === PosOfferScope.ALL) return [];

  let matches: string[];
  if (scope === PosOfferScope.CATEGORY) {
    const records = await transaction.masterCategory.findMany({
      where: { organization_id: organizationId, id: { in: targetIds }, is_active: true },
      select: { id: true },
    });
    matches = records.map(({ id }) => id);
  } else if (scope === PosOfferScope.COLOUR) {
    const records = await transaction.masterColor.findMany({
      where: { organization_id: organizationId, id: { in: targetIds }, is_active: true },
      select: { id: true },
    });
    matches = records.map(({ id }) => id);
  } else {
    const records = await transaction.masterSize.findMany({
      where: { organization_id: organizationId, id: { in: targetIds }, is_active: true },
      select: { id: true },
    });
    matches = records.map(({ id }) => id);
  }

  if (matches.length !== targetIds.length) {
    throw new PosOfferValidationError("One or more selected targets are inactive or do not belong to this organization.");
  }
  return targetIds.map((id) => ({
    organization_id: organizationId,
    category_id: scope === PosOfferScope.CATEGORY ? id : null,
    color_id: scope === PosOfferScope.COLOUR ? id : null,
    size_id: scope === PosOfferScope.SIZE ? id : null,
  }));
}

function serializeOffer(
  offer: Prisma.PosOfferGetPayload<{ include: typeof OFFER_INCLUDE }>,
  includeTargetIds = false,
) {
  const targetLabels = offer.targets.flatMap((target) => [
    target.category?.category_name,
    target.color?.colors,
    target.size?.size,
  ].filter((label): label is string => Boolean(label)));

  return {
    id: offer.id,
    offerCode: offer.offer_code,
    name: offer.name,
    description: offer.description,
    offerType: offer.offer_type,
    scope: offer.scope,
    status: offer.status,
    discountAmount: offer.discount_amount?.toFixed(2) ?? null,
    discountPercentage: offer.discount_percentage?.toFixed(2) ?? null,
    buyQuantity: offer.buy_quantity,
    getQuantity: offer.get_quantity,
    getDiscountPercentage: offer.get_discount_percentage?.toFixed(2) ?? null,
    comboPrice: offer.combo_price?.toFixed(2) ?? null,
    startsAt: offer.starts_at.toISOString().slice(0, 10),
    endsAt: offer.ends_at?.toISOString().slice(0, 10) ?? null,
    targetLabels,
    ...(includeTargetIds ? { targetIds: offer.targets.map(({ id }) => id) } : {}),
    createdAt: offer.created_at.toISOString(),
  };
}

export async function createPosOffer(input: PosOfferInput) {
  const normalized = normalizeInput(input);

  try {
    const offer = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.posOffer.findFirst({
        where: {
          organization_id: input.organizationId,
          request_key: normalized.requestKey,
        },
        include: OFFER_INCLUDE,
      });
      if (existing) return existing;

      const targets = await validateTargets(
        transaction,
        input.organizationId,
        input.scope,
        normalized.targetIds,
      );
      const created = await transaction.posOffer.create({
        data: {
          organization_id: input.organizationId,
          request_key: normalized.requestKey,
          offer_code: normalized.offerCode,
          name: normalized.name,
          description: normalized.description,
          offer_type: input.offerType,
          scope: input.scope,
          status: input.status,
          ...normalized.values,
          starts_at: normalized.startsAt,
          ends_at: normalized.endsAt,
          created_by: input.actorId,
        },
      });
      if (targets.length) {
        await transaction.posOfferTarget.createMany({
          data: targets.map((target) => ({
            ...target,
            offer_id: created.id,
          })),
        });
      }
      const savedOffer = await transaction.posOffer.findFirst({
        where: { organization_id: input.organizationId, id: created.id },
        include: OFFER_INCLUDE,
      });
      if (!savedOffer) {
        throw new Error("Created offer could not be reloaded.");
      }
      await createAuditEvent({
        organizationId: input.organizationId,
        userId: input.actorId,
        module: "POS",
        action: "CREATE_POS_OFFER",
        entityType: "pos_offer",
        entityId: savedOffer.id,
        details: {
          offerCode: savedOffer.offer_code,
          offerType: savedOffer.offer_type,
          scope: savedOffer.scope,
          status: savedOffer.status,
        },
      }, transaction);
      return savedOffer;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
    return serializeOffer(offer);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === "P2002" || error.code === "P2034")
    ) {
      const existing = await prisma.posOffer.findFirst({
        where: {
          organization_id: input.organizationId,
          request_key: normalized.requestKey,
        },
        include: OFFER_INCLUDE,
      });
      if (existing) return serializeOffer(existing);
      if (error.code === "P2002") {
        throw new PosOfferConflictError("An offer already uses this code in the organization.");
      }
    }
    throw error;
  }
}

export async function getPosOffer(organizationId: string, offerId: string) {
  const offer = await prisma.posOffer.findFirst({
    where: { organization_id: organizationId, id: offerId },
    include: OFFER_INCLUDE,
  });
  if (!offer) throw new PosOfferNotFoundError();
  return serializeOffer(offer, true);
}

export async function updatePosOffer(input: Omit<PosOfferInput, "requestKey"> & { offerId: string }) {
  const normalized = normalizeInput({ ...input, requestKey: `edit-${input.offerId}` });
  try {
    const updatedOffer = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.posOffer.findFirst({
        where: { organization_id: input.organizationId, id: input.offerId },
        include: OFFER_INCLUDE,
      });
      if (!existing) throw new PosOfferNotFoundError();

      const targets = await validateTargets(
        transaction,
        input.organizationId,
        input.scope,
        normalized.targetIds,
      );
      await transaction.posOffer.update({
        where: {
          organization_id_id: {
            organization_id: input.organizationId,
            id: input.offerId,
          },
        },
        data: {
          offer_code: normalized.offerCode,
          name: normalized.name,
          description: normalized.description,
          offer_type: input.offerType,
          scope: input.scope,
          status: input.status,
          ...normalized.values,
          starts_at: normalized.startsAt,
          ends_at: normalized.endsAt,
        },
        include: OFFER_INCLUDE,
      });
      await transaction.posOfferTarget.deleteMany({
        where: { organization_id: input.organizationId, offer_id: input.offerId },
      });
      if (targets.length) {
        await transaction.posOfferTarget.createMany({
          data: targets.map((target) => ({ ...target, offer_id: input.offerId })),
        });
      }
      const savedOffer = await transaction.posOffer.findFirst({
        where: { organization_id: input.organizationId, id: input.offerId },
        include: OFFER_INCLUDE,
      });
      if (!savedOffer) throw new Error("Updated offer could not be reloaded.");

      await createAuditEvent({
        organizationId: input.organizationId,
        userId: input.actorId,
        module: "POS",
        action: "UPDATE_POS_OFFER",
        entityType: "pos_offer",
        entityId: savedOffer.id,
        details: {
          before: {
            offerCode: existing.offer_code,
            name: existing.name,
            offerType: existing.offer_type,
            scope: existing.scope,
            status: existing.status,
            discountAmount: existing.discount_amount?.toFixed(2) ?? null,
            discountPercentage: existing.discount_percentage?.toFixed(2) ?? null,
            buyQuantity: existing.buy_quantity,
            getQuantity: existing.get_quantity,
            getDiscountPercentage: existing.get_discount_percentage?.toFixed(2) ?? null,
            comboPrice: existing.combo_price?.toFixed(2) ?? null,
            startsAt: existing.starts_at.toISOString().slice(0, 10),
            endsAt: existing.ends_at?.toISOString().slice(0, 10) ?? null,
          },
          after: {
            offerCode: savedOffer.offer_code,
            name: savedOffer.name,
            offerType: savedOffer.offer_type,
            scope: savedOffer.scope,
            status: savedOffer.status,
            discountAmount: savedOffer.discount_amount?.toFixed(2) ?? null,
            discountPercentage: savedOffer.discount_percentage?.toFixed(2) ?? null,
            buyQuantity: savedOffer.buy_quantity,
            getQuantity: savedOffer.get_quantity,
            getDiscountPercentage: savedOffer.get_discount_percentage?.toFixed(2) ?? null,
            comboPrice: savedOffer.combo_price?.toFixed(2) ?? null,
            startsAt: savedOffer.starts_at.toISOString().slice(0, 10),
            endsAt: savedOffer.ends_at?.toISOString().slice(0, 10) ?? null,
          },
        },
      }, transaction);
      return savedOffer;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
    return serializeOffer(updatedOffer, true);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PosOfferConflictError("An offer already uses this code in the organization.");
    }
    throw error;
  }
}

export async function listPosOffers(input: {
  organizationId: string;
  offerType?: PosOfferType;
  scope?: PosOfferScope;
  status?: PosOfferStatus;
  search?: string;
  cursor?: PosOfferCursor | null;
  limit: number;
}) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_PAGE_SIZE) {
    throw new PosOfferValidationError(`Page size must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  const search = normalizeUppercase(input.search?.trim() ?? "");
  if (search.length > MAX_SEARCH_LENGTH) {
    throw new PosOfferValidationError(`Offer search must contain ${MAX_SEARCH_LENGTH} characters or fewer.`);
  }

  const filters: Prisma.PosOfferWhereInput[] = [];
  if (search) {
    filters.push({
      OR: [
        { offer_code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  if (input.cursor) {
    filters.push({
      OR: [
        { created_at: { lt: input.cursor.createdAt } },
        { created_at: input.cursor.createdAt, id: { lt: input.cursor.id } },
      ],
    });
  }

  const offers = await prisma.posOffer.findMany({
    where: {
      organization_id: input.organizationId,
      ...(input.offerType ? { offer_type: input.offerType } : {}),
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(filters.length ? { AND: filters } : {}),
    },
    include: OFFER_INCLUDE,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: input.limit + 1,
  });
  const hasMore = offers.length > input.limit;
  const pageOffers = offers.slice(0, input.limit);
  return {
    offers: pageOffers.map((offer) => serializeOffer(offer)),
    nextCursor: hasMore
      ? {
          id: pageOffers[pageOffers.length - 1].id,
          createdAt: pageOffers[pageOffers.length - 1].created_at.toISOString(),
        }
      : null,
  };
}

export async function listEligiblePosOffersByStock(input: {
  organizationId: string;
  entityId: string;
  invoiceDate: string;
  stockKeys: string[];
}) {
  const invoiceDate = parseDate(input.invoiceDate, "Invoice date");
  if (!input.entityId.trim() || input.entityId.length > 100) {
    throw new PosOfferValidationError("Select an active Entity before loading eligible offers.");
  }
  if (!Array.isArray(input.stockKeys) || input.stockKeys.length < 1 || input.stockKeys.length > 100) {
    throw new PosOfferValidationError("Offer eligibility lookup must contain 1 to 100 invoice items.");
  }
  const parsedStockKeys = input.stockKeys.map((key) => {
    const [stockType, ...idParts] = key.split(":");
    const stockId = idParts.join(":").trim();
    if ((stockType !== "SKU" && stockType !== "GENERAL_GRN") || !stockId || stockId.length > 100) {
      throw new PosOfferValidationError("Every offer eligibility item must reference valid General stock.");
    }
    return { key, stockType, stockId };
  });
  if (new Set(parsedStockKeys.map(({ key }) => key)).size !== parsedStockKeys.length) {
    throw new PosOfferValidationError("An invoice item cannot appear more than once in an offer lookup.");
  }

  const generalIds = parsedStockKeys.filter(({ stockType }) => stockType === "GENERAL_GRN").map(({ stockId }) => stockId);
  const skuIds = parsedStockKeys.filter(({ stockType }) => stockType === "SKU").map(({ stockId }) => stockId);
  const [entity, generalRecords, skuRecords] = await Promise.all([
    prisma.masterEntity.findFirst({
      where: { id: input.entityId, organization_id: input.organizationId, is_active: true },
      select: { id: true },
    }),
    generalIds.length
      ? prisma.finishedGoodsGeneralStockReceipt.findMany({
          where: { organization_id: input.organizationId, entity_id: input.entityId, id: { in: generalIds } },
          select: { id: true, product_category: true, colour: true, size: true },
        })
      : Promise.resolve([]),
    skuIds.length
      ? prisma.finishedGoodsSkuStock.findMany({
          where: {
            organization_id: input.organizationId,
            entity_id: input.entityId,
            id: { in: skuIds },
            source: { in: [...GENERAL_FINISHED_GOODS_SKU_SOURCES] },
          },
          select: {
            id: true,
            product_category: true,
            sub_product_category: true,
            colour: true,
            size: true,
          },
        })
      : Promise.resolve([]),
  ]);
  if (!entity) throw new PosOfferValidationError("Select an active Entity belonging to this organization.");
  const stockByKey = new Map<string, {
    category: string | null;
    subCategory: string | null;
    colour: string | null;
    size: string | null;
  }>([
    ...generalRecords.map((record) => [`GENERAL_GRN:${record.id}`, {
      category: record.product_category,
      subCategory: null,
      colour: record.colour,
      size: record.size,
    }] as const),
    ...skuRecords.map((record) => [`SKU:${record.id}`, {
      category: record.product_category,
      subCategory: record.sub_product_category,
      colour: record.colour,
      size: record.size,
    }] as const),
  ]);
  if (stockByKey.size !== parsedStockKeys.length) {
    throw new PosOfferValidationError("One or more invoice items are not General stock in this organization and Entity.");
  }

  const matchingOffers = await prisma.posOffer.findMany({
    where: {
      organization_id: input.organizationId,
      status: PosOfferStatus.ACTIVE,
      starts_at: { lte: invoiceDate },
      OR: [{ ends_at: null }, { ends_at: { gte: invoiceDate } }],
    },
    include: OFFER_INCLUDE,
    orderBy: [{ starts_at: "desc" }, { offer_code: "asc" }, { id: "asc" }],
    take: MAX_ELIGIBLE_OFFERS + 1,
  });
  const offerLimitReached = matchingOffers.length > MAX_ELIGIBLE_OFFERS;
  const offers = matchingOffers.slice(0, MAX_ELIGIBLE_OFFERS);
  const normalizeLabel = (label: string | null) => label?.trim().toLocaleUpperCase() ?? "";
  const offersByStock = Object.fromEntries(parsedStockKeys.map(({ key }) => {
    const stock = stockByKey.get(key);
    if (!stock) throw new PosOfferValidationError("An invoice item could not be loaded for offer matching.");
    const categoryLabels = new Set([stock.category, stock.subCategory].map(normalizeLabel).filter(Boolean));
    const eligible = offers.filter((offer) => {
      if (offer.scope === PosOfferScope.ALL) return true;
      if (offer.scope === PosOfferScope.CATEGORY) {
        return offer.targets.some((target) =>
          target.category && categoryLabels.has(normalizeLabel(target.category.category_name)),
        );
      }
      if (offer.scope === PosOfferScope.COLOUR) {
        const colour = normalizeLabel(stock.colour);
        return Boolean(colour) && offer.targets.some((target) =>
          target.color && normalizeLabel(target.color.colors) === colour,
        );
      }
      const size = normalizeLabel(stock.size);
      return Boolean(size) && offer.targets.some((target) =>
        target.size && normalizeLabel(target.size.size) === size,
      );
    });
    return [key, eligible.map((offer) => serializeOffer(offer))];
  }));
  return {
    offersByStock,
    offerLimitReached,
  };
}

export async function listPosOfferTargetOptions(input: {
  organizationId: string;
  scope: PosOfferScope;
  search?: string;
  limit: number;
}) {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > MAX_PAGE_SIZE) {
    throw new PosOfferValidationError(`Lookup limit must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  const search = normalizeUppercase(input.search?.trim() ?? "");
  if (search.length > MAX_SEARCH_LENGTH) {
    throw new PosOfferValidationError(`Target search must contain ${MAX_SEARCH_LENGTH} characters or fewer.`);
  }
  if (input.scope === PosOfferScope.ALL) return [];

  if (input.scope === PosOfferScope.CATEGORY) {
    const records = await prisma.masterCategory.findMany({
      where: {
        organization_id: input.organizationId,
        is_active: true,
        ...(search ? { category_name: { contains: search, mode: "insensitive" } } : {}),
      },
      select: { id: true, category_name: true },
      orderBy: [{ category_name: "asc" }, { id: "asc" }],
      take: input.limit,
    });
    return records.map(({ id, category_name }) => ({ id, label: category_name }));
  }
  if (input.scope === PosOfferScope.COLOUR) {
    const records = await prisma.masterColor.findMany({
      where: {
        organization_id: input.organizationId,
        is_active: true,
        ...(search ? { colors: { contains: search, mode: "insensitive" } } : {}),
      },
      select: { id: true, colors: true },
      orderBy: [{ colors: "asc" }, { id: "asc" }],
      take: input.limit,
    });
    return records.map(({ id, colors }) => ({ id, label: colors }));
  }
  const records = await prisma.masterSize.findMany({
    where: {
      organization_id: input.organizationId,
      is_active: true,
      ...(search ? { size: { contains: search, mode: "insensitive" } } : {}),
    },
    select: { id: true, size: true },
    orderBy: [{ size: "asc" }, { id: "asc" }],
    take: input.limit,
  });
  return records.map(({ id, size }) => ({ id, label: size }));
}
