import { NextResponse } from "next/server";

import { PosCouponDiscountType, PosCouponStatus, PosCouponType } from "@prisma/client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { createPosCoupon, listPosCoupons } from "@/lib/services/pos/pos-coupon-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function parseCursor(value: string) {
  if (value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof parsed.id !== "string"
      || parsed.id.length === 0
      || parsed.id.length > 100
      || typeof parsed.createdAt !== "string"
    ) return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) return null;
    return { id: parsed.id, createdAt };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCouponType(value: unknown): value is PosCouponType {
  return typeof value === "string" && Object.values(PosCouponType).some((candidate) => candidate === value);
}

function isCouponStatus(value: unknown): value is PosCouponStatus {
  return typeof value === "string" && Object.values(PosCouponStatus).some((candidate) => candidate === value);
}

function isDiscountType(value: unknown): value is PosCouponDiscountType {
  return typeof value === "string" && Object.values(PosCouponDiscountType).some((candidate) => candidate === value);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const params = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "FINANCE"],
    );
    const search = params.get("search")?.trim() ?? "";
    if (search.length > 100) {
      return NextResponse.json({ error: "Coupon search must contain 100 characters or fewer." }, { status: 400 });
    }
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawCursor = params.get("cursor");
    const cursor = rawCursor ? parseCursor(rawCursor) ?? undefined : undefined;
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: "Invalid coupon pagination cursor." }, { status: 400 });
    }
    const rawCouponType = params.get("couponType");
    const rawStatus = params.get("status");
    const couponType = isCouponType(rawCouponType) ? rawCouponType : undefined;
    const status = isCouponStatus(rawStatus) ? rawStatus : undefined;
    if (rawCouponType && !couponType) {
      return NextResponse.json({ error: "Select a valid coupon type filter." }, { status: 400 });
    }
    if (rawStatus && !status) {
      return NextResponse.json({ error: "Select a valid coupon status filter." }, { status: 400 });
    }
    const result = await listPosCoupons(organization.id, {
      take: limit,
      cursor,
      search,
      couponType,
      status,
    });
    return NextResponse.json({
      coupons: result.coupons,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor
        ? Buffer.from(JSON.stringify({
            id: result.nextCursor.id,
            createdAt: result.nextCursor.createdAt.toISOString(),
          })).toString("base64url")
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load POS coupons." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "FINANCE"],
    );
    const body: unknown = await request.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Coupon details are required." }, { status: 400 });
    }
    const {
      couponCode,
      name,
      description,
      couponType,
      status,
      discountType,
      discountValue,
      minimumPurchase,
      startsAt,
      endsAt,
      maxRedemptions,
      validityDays,
    } = body;
    if (!isCouponType(couponType) || !isCouponStatus(status) || !isDiscountType(discountType)) {
      return NextResponse.json({ error: "Select a valid coupon and discount type." }, { status: 400 });
    }
    if (
      typeof name !== "string"
      || typeof discountValue !== "string"
      || typeof minimumPurchase !== "string"
      || typeof startsAt !== "string"
      || (couponCode !== undefined && couponCode !== null && typeof couponCode !== "string")
      || (description !== undefined && description !== null && typeof description !== "string")
      || (endsAt !== undefined && endsAt !== null && typeof endsAt !== "string")
      || (maxRedemptions !== undefined && maxRedemptions !== null && typeof maxRedemptions !== "number")
      || (validityDays !== undefined && validityDays !== null && typeof validityDays !== "number")
    ) {
      return NextResponse.json({ error: "Coupon fields have an invalid format." }, { status: 400 });
    }
    const coupon = await createPosCoupon(organization.id, user.id, {
      couponCode,
      name,
      description,
      couponType,
      status,
      discountType,
      discountValue,
      minimumPurchase,
      startsAt,
      endsAt,
      maxRedemptions,
      validityDays,
    });
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the POS coupon." },
      { status: 400 },
    );
  }
}
