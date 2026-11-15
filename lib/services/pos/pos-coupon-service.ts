import {
  PosCouponDiscountType,
  PosCouponIssueStatus,
  PosCouponStatus,
  PosCouponType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export type CreatePosCouponInput = {
  couponCode?: string | null;
  name: string;
  description?: string | null;
  couponType: PosCouponType;
  status: PosCouponStatus;
  discountType: PosCouponDiscountType;
  discountValue: string;
  minimumPurchase: string;
  startsAt: string;
  endsAt?: string | null;
  maxRedemptions?: number | null;
  validityDays?: number | null;
};

function parseDate(value: string, field: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} must be a valid date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} must be a valid date.`);
  }
  return parsed;
}

function parseMoney(value: string, field: string, allowZero = false) {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new Error(`${field} must be a valid amount with up to two decimal places.`);
  }
  const parsed = new Prisma.Decimal(value.trim());
  if (!parsed.isFinite() || parsed.isNegative() || (!allowZero && parsed.isZero())) {
    throw new Error(`${field} must be ${allowZero ? "zero or greater" : "greater than zero"}.`);
  }
  return parsed;
}

function normalizedCoupon(input: CreatePosCouponInput) {
  if (!Object.values(PosCouponType).includes(input.couponType)) {
    throw new Error("Select a valid coupon type.");
  }
  if (!Object.values(PosCouponStatus).includes(input.status)) {
    throw new Error("Select a valid coupon status.");
  }
  if (!Object.values(PosCouponDiscountType).includes(input.discountType)) {
    throw new Error("Select a valid discount type.");
  }
  const name = normalizeUppercase(input.name.trim());
  if (!name || name.length > 150) throw new Error("Coupon name must contain 1 to 150 characters.");
  const description = input.description ? normalizeUppercase(input.description.trim()) : null;
  if (description && description.length > 500) throw new Error("Description must contain 500 characters or fewer.");
  const couponCode = input.couponCode?.trim()
    ? normalizeUppercase(input.couponCode.trim())
    : null;
  if (input.couponType === PosCouponType.GENERAL) {
    if (!couponCode || !/^[A-Z0-9][A-Z0-9-]{2,59}$/.test(couponCode)) {
      throw new Error("Enter a coupon code using 3 to 60 letters, numbers, or hyphens.");
    }
    if (couponCode.startsWith("CC-")) {
      throw new Error("Coupon codes beginning with CC- are reserved for automatically issued rewards.");
    }
    if (input.validityDays !== null && input.validityDays !== undefined) {
      throw new Error("Validity days are only available for purchase-reward coupons.");
    }
  } else if (couponCode) {
    throw new Error("Purchase-reward coupon codes are generated automatically for customers.");
  }

  const startsAt = parseDate(input.startsAt, "Start date");
  const endsAt = input.endsAt ? parseDate(input.endsAt, "End date") : null;
  if (endsAt && endsAt < startsAt) throw new Error("End date cannot be before the start date.");
  const discountValue = parseMoney(input.discountValue, "Discount");
  if (input.discountType === PosCouponDiscountType.PERCENTAGE && discountValue.gt(100)) {
    throw new Error("Percentage discount cannot exceed 100%.");
  }
  const minimumPurchase = parseMoney(input.minimumPurchase, "Minimum purchase", true);
  const maxRedemptions = input.maxRedemptions ?? null;
  if (maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > 2_147_483_647)) {
    throw new Error("Maximum redemptions must be a positive whole number.");
  }
  const validityDays = input.validityDays ?? null;
  if (input.couponType === PosCouponType.PURCHASE_REWARD
    && (!Number.isInteger(validityDays) || (validityDays ?? 0) < 1 || (validityDays ?? 0) > 3650)) {
    throw new Error("Reward validity must be between 1 and 3650 days.");
  }
  if (input.couponType === PosCouponType.GENERAL && validityDays !== null) {
    throw new Error("Validity days are only available for purchase-reward coupons.");
  }

  return {
    couponCode,
    name,
    description,
    couponType: input.couponType,
    status: input.status,
    discountType: input.discountType,
    discountValue,
    minimumPurchase,
    startsAt,
    endsAt,
    maxRedemptions,
    validityDays,
  };
}

export async function createPosCoupon(
  organizationId: string,
  actorId: string,
  input: CreatePosCouponInput,
) {
  const coupon = normalizedCoupon(input);
  return prisma.$transaction(async (transaction) => {
    if (
      coupon.couponType === PosCouponType.PURCHASE_REWARD
      && coupon.status === PosCouponStatus.ACTIVE
    ) {
      const activeReward = await transaction.posCoupon.findFirst({
        where: {
          organization_id: organizationId,
          coupon_type: PosCouponType.PURCHASE_REWARD,
          status: PosCouponStatus.ACTIVE,
        },
        select: { id: true },
      });
      if (activeReward) {
        throw new Error("Deactivate the current purchase-reward campaign before creating another active one.");
      }
    }
    if (coupon.couponCode) {
      const duplicate = await transaction.posCoupon.findFirst({
        where: { organization_id: organizationId, coupon_code: coupon.couponCode },
        select: { id: true },
      });
      if (duplicate) throw new Error("That coupon code is already in use.");
    }

    const created = await transaction.posCoupon.create({
      data: {
        organization_id: organizationId,
        coupon_code: coupon.couponCode,
        name: coupon.name,
        description: coupon.description,
        coupon_type: coupon.couponType,
        status: coupon.status,
        discount_type: coupon.discountType,
        discount_value: coupon.discountValue,
        minimum_purchase: coupon.minimumPurchase,
        starts_at: coupon.startsAt,
        ends_at: coupon.endsAt,
        max_redemptions: coupon.maxRedemptions,
        validity_days: coupon.validityDays,
        created_by: actorId,
      },
      select: { id: true, name: true, coupon_code: true, coupon_type: true },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organizationId,
        user_id: actorId,
        module: "POS_COUPON",
        action: "CREATE_COUPON",
        entity_type: "pos_coupon",
        entity_id: created.id,
        details: {
          couponType: created.coupon_type,
          couponCode: created.coupon_code,
          name: created.name,
        },
      },
    });
    return created;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 15_000,
  }).catch((error: unknown) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && error.code === "P2002"
    ) {
      throw new Error("That coupon code is already in use.");
    }
    throw error;
  });
}

export async function listPosCoupons(
  organizationId: string,
  options: {
    take: number;
    cursor?: { id: string; createdAt: Date };
    search?: string;
    couponType?: PosCouponType;
    status?: PosCouponStatus;
  },
) {
  const search = options.search?.trim() ?? "";
  const coupons = await prisma.posCoupon.findMany({
    where: {
      organization_id: organizationId,
      ...(options.couponType ? { coupon_type: options.couponType } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { coupon_code: { contains: search, mode: "insensitive" } },
        ],
      } : {}),
      ...(options.cursor ? {
        AND: [{
          OR: [
            { created_at: { lt: options.cursor.createdAt } },
            { created_at: options.cursor.createdAt, id: { lt: options.cursor.id } },
          ],
        }],
      } : {}),
    },
    select: {
      id: true,
      coupon_code: true,
      name: true,
      description: true,
      coupon_type: true,
      status: true,
      discount_type: true,
      discount_value: true,
      minimum_purchase: true,
      starts_at: true,
      ends_at: true,
      max_redemptions: true,
      validity_days: true,
      created_at: true,
      _count: {
        select: {
          issuedCodes: true,
          redemptions: true,
        },
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: options.take + 1,
  });
  const hasMore = coupons.length > options.take;
  const pageCoupons = coupons.slice(0, options.take);
  return {
    coupons: pageCoupons.map((coupon) => ({
      id: coupon.id,
      couponCode: coupon.coupon_code ?? "AUTO-GENERATED",
      name: coupon.name,
      description: coupon.description,
      couponType: coupon.coupon_type,
      status: coupon.status,
      discountType: coupon.discount_type,
      discountValue: coupon.discount_value.toFixed(2),
      minimumPurchase: coupon.minimum_purchase.toFixed(2),
      startsAt: coupon.starts_at.toISOString().slice(0, 10),
      endsAt: coupon.ends_at?.toISOString().slice(0, 10) ?? null,
      maxRedemptions: coupon.max_redemptions,
      validityDays: coupon.validity_days,
      issuedCount: coupon._count.issuedCodes,
      redemptionCount: coupon._count.redemptions,
      createdAt: coupon.created_at,
    })),
    hasMore,
    nextCursor: hasMore
      ? {
          id: pageCoupons[pageCoupons.length - 1].id,
          createdAt: pageCoupons[pageCoupons.length - 1].created_at,
        }
      : null,
  };
}

export async function listPosCouponIssues(
  organizationId: string,
  options: {
    take: number;
    cursor?: { id: string; createdAt: Date };
    search?: string;
    status: "ACTIVE" | "EXPIRED" | "CLAIMED";
    asOfDate: Date;
  },
) {
  const search = options.search?.trim() ?? "";
  const searchFilters: Prisma.PosCouponIssueWhereInput[] = [];
  if (search) {
    searchFilters.push({
      OR: [
        { coupon_code: { contains: search, mode: "insensitive" } },
        { coupon: { name: { contains: search, mode: "insensitive" } } },
        {
          customerContact: {
            OR: [
              { legal_name: { contains: search, mode: "insensitive" } },
              { display_name: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          },
        },
        { issuedInvoice: { invoice_no: { contains: search, mode: "insensitive" } } },
        { redeemedInvoice: { invoice_no: { contains: search, mode: "insensitive" } } },
      ],
    });
  }
  if (options.cursor) {
    searchFilters.push({
      OR: [
        { created_at: { lt: options.cursor.createdAt } },
        { created_at: options.cursor.createdAt, id: { lt: options.cursor.id } },
      ],
    });
  }

  const issues = await prisma.posCouponIssue.findMany({
    where: {
      organization_id: organizationId,
      ...(options.status === "CLAIMED"
        ? { status: PosCouponIssueStatus.REDEEMED }
        : {
            status: PosCouponIssueStatus.AVAILABLE,
            ...(options.status === "ACTIVE"
              ? {
                  coupon: { status: PosCouponStatus.ACTIVE },
                  OR: [{ expires_at: null }, { expires_at: { gte: options.asOfDate } }],
                }
              : { expires_at: { lt: options.asOfDate } }),
          }),
      ...(searchFilters.length ? { AND: searchFilters } : {}),
    },
    select: {
      id: true,
      coupon_code: true,
      expires_at: true,
      created_at: true,
      redeemed_at: true,
      coupon: {
        select: {
          name: true,
          discount_type: true,
          discount_value: true,
        },
      },
      customerContact: {
        select: { legal_name: true, display_name: true, phone: true },
      },
      issuedInvoice: {
        select: { invoice_no: true, invoice_date: true },
      },
      redeemedInvoice: {
        select: { invoice_no: true },
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: options.take + 1,
  });
  const hasMore = issues.length > options.take;
  const pageIssues = issues.slice(0, options.take);
  return {
    issues: pageIssues.map((issue) => ({
      id: issue.id,
      couponCode: issue.coupon_code,
      name: issue.coupon.name,
      discountType: issue.coupon.discount_type,
      discountValue: issue.coupon.discount_value.toFixed(2),
      customerName: issue.customerContact.display_name ?? issue.customerContact.legal_name,
      customerPhone: issue.customerContact.phone,
      invoiceNumber: issue.issuedInvoice.invoice_no,
      invoiceDate: issue.issuedInvoice.invoice_date.toISOString().slice(0, 10),
      expiresAt: issue.expires_at?.toISOString().slice(0, 10) ?? null,
      claimedInvoiceNumber: issue.redeemedInvoice?.invoice_no ?? null,
      claimedAt: issue.redeemed_at?.toISOString() ?? null,
      status: options.status,
      createdAt: issue.created_at,
    })),
    hasMore,
    nextCursor: hasMore
      ? {
          id: pageIssues[pageIssues.length - 1].id,
          createdAt: pageIssues[pageIssues.length - 1].created_at,
        }
      : null,
  };
}
