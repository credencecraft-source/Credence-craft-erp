import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  couponFindMany: vi.fn(),
  couponIssueFindMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    posCoupon: { findMany: mocks.couponFindMany },
    posCouponIssue: { findMany: mocks.couponIssueFindMany },
  },
}));

import {
  PosCouponDiscountType,
  PosCouponStatus,
  PosCouponType,
} from "@prisma/client";
import { createPosCoupon, listPosCouponIssues, listPosCoupons } from "./pos-coupon-service";

describe("POS coupon service", () => {
  const transaction = {
    posCoupon: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    transaction.posCoupon.findFirst.mockResolvedValue(null);
    transaction.posCoupon.create.mockResolvedValue({
      id: "coupon-1",
      name: "SAVE TEN",
      coupon_code: "SAVE10",
      coupon_type: PosCouponType.GENERAL,
    });
    transaction.auditEvent.create.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation(async (callback) => callback(transaction));
  });

  it("normalizes and audits a tenant-scoped general coupon", async () => {
    const result = await createPosCoupon("organization-1", "actor-1", {
      couponCode: "save10",
      name: "Save ten",
      couponType: PosCouponType.GENERAL,
      status: PosCouponStatus.ACTIVE,
      discountType: PosCouponDiscountType.FLAT_AMOUNT,
      discountValue: "10.00",
      minimumPurchase: "50",
      startsAt: "2026-11-07",
    });

    expect(result.id).toBe("coupon-1");
    expect(transaction.posCoupon.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "organization-1",
        coupon_code: "SAVE10",
        name: "SAVE TEN",
        discount_value: expect.objectContaining({ s: 1 }),
      }),
    }));
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "organization-1",
        user_id: "actor-1",
        entity_id: "coupon-1",
      }),
    }));
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: "Serializable" }),
    );
  });

  it("requires a single active purchase-reward campaign per organization", async () => {
    transaction.posCoupon.findFirst.mockResolvedValueOnce({ id: "existing-campaign" });

    await expect(createPosCoupon("organization-1", "actor-1", {
      name: "Repeat purchase reward",
      couponType: PosCouponType.PURCHASE_REWARD,
      status: PosCouponStatus.ACTIVE,
      discountType: PosCouponDiscountType.PERCENTAGE,
      discountValue: "10",
      minimumPurchase: "100",
      startsAt: "2026-11-07",
      validityDays: 30,
    })).rejects.toThrow("Deactivate the current purchase-reward campaign");
    expect(transaction.posCoupon.create).not.toHaveBeenCalled();
  });

  it("rejects malformed, over-limit, or reserved code values", async () => {
    await expect(createPosCoupon("organization-1", "actor-1", {
      couponCode: "CC-RESERVED",
      name: "Coupon",
      couponType: PosCouponType.GENERAL,
      status: PosCouponStatus.ACTIVE,
      discountType: PosCouponDiscountType.PERCENTAGE,
      discountValue: "100.01",
      minimumPurchase: "0",
      startsAt: "2026-11-07",
    })).rejects.toThrow("reserved for automatically issued rewards");
    expect(transaction.posCoupon.create).not.toHaveBeenCalled();
  });

  it("lists coupon records only within the organization and returns bounded cursors", async () => {
    const createdAt = new Date("2026-11-07T10:00:00.000Z");
    mocks.couponFindMany.mockResolvedValue([
      {
        id: "coupon-1",
        coupon_code: "SAVE10",
        name: "SAVE TEN",
        description: null,
        coupon_type: PosCouponType.GENERAL,
        status: PosCouponStatus.ACTIVE,
        discount_type: PosCouponDiscountType.FLAT_AMOUNT,
        discount_value: { toFixed: () => "10.00" },
        minimum_purchase: { toFixed: () => "50.00" },
        starts_at: createdAt,
        ends_at: null,
        max_redemptions: null,
        validity_days: null,
        created_at: createdAt,
        _count: { issuedCodes: 0, redemptions: 1 },
      },
    ]);

    const result = await listPosCoupons("organization-1", {
      take: 1,
      search: "save",
      couponType: PosCouponType.GENERAL,
      status: PosCouponStatus.ACTIVE,
    });

    expect(mocks.couponFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "organization-1",
        coupon_type: PosCouponType.GENERAL,
        status: PosCouponStatus.ACTIVE,
        OR: expect.arrayContaining([
          { name: { contains: "save", mode: "insensitive" } },
          { coupon_code: { contains: "save", mode: "insensitive" } },
        ]),
      }),
      take: 2,
    }));
    expect(result.coupons[0]).toMatchObject({
      id: "coupon-1",
      couponCode: "SAVE10",
      redemptionCount: 1,
    });
    expect(result.hasMore).toBe(false);
  });

  it("lists active issued reward coupons by tenant, active plan, and current expiry", async () => {
    const createdAt = new Date("2026-11-07T10:00:00.000Z");
    const asOfDate = new Date("2026-11-08T00:00:00.000Z");
    mocks.couponIssueFindMany.mockResolvedValue([{
      id: "issue-1",
      coupon_code: "CC-ACTIVE",
      expires_at: null,
      created_at: createdAt,
      coupon: {
        name: "Repeat Reward",
        discount_type: PosCouponDiscountType.PERCENTAGE,
        discount_value: { toFixed: () => "10.00" },
      },
      customerContact: { legal_name: "Customer One", display_name: "Customer", phone: "12345" },
      issuedInvoice: { invoice_no: "POS-1", invoice_date: createdAt },
    }]);

    const result = await listPosCouponIssues("organization-1", {
      take: 1,
      search: "customer",
      status: "ACTIVE",
      asOfDate,
    });

    expect(mocks.couponIssueFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "organization-1",
        status: "AVAILABLE",
        coupon: { status: "ACTIVE" },
        OR: [{ expires_at: null }, { expires_at: { gte: asOfDate } }],
        AND: [expect.objectContaining({
          OR: expect.arrayContaining([
            { coupon_code: { contains: "customer", mode: "insensitive" } },
          ]),
        })],
      }),
      take: 2,
    }));
    expect(result.issues[0]).toMatchObject({
      couponCode: "CC-ACTIVE",
      name: "Repeat Reward",
      customerName: "Customer",
      invoiceNumber: "POS-1",
      status: "ACTIVE",
    });
  });

  it("lists only unredeemed issued coupons whose expiry date has passed", async () => {
    const asOfDate = new Date("2026-11-08T00:00:00.000Z");
    mocks.couponIssueFindMany.mockResolvedValue([]);

    await listPosCouponIssues("organization-1", {
      take: 50,
      status: "EXPIRED",
      asOfDate,
    });

    expect(mocks.couponIssueFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "organization-1",
        status: "AVAILABLE",
        expires_at: { lt: asOfDate },
      },
    }));
  });

  it("lists redeemed coupon issues with the invoice that claimed each code", async () => {
    const createdAt = new Date("2026-11-07T10:00:00.000Z");
    const redeemedAt = new Date("2026-11-08T10:00:00.000Z");
    mocks.couponIssueFindMany.mockResolvedValue([{
      id: "issue-claimed",
      coupon_code: "CC-CLAIMED",
      expires_at: new Date("2026-12-07T00:00:00.000Z"),
      created_at: createdAt,
      redeemed_at: redeemedAt,
      coupon: {
        name: "Repeat Reward",
        discount_type: PosCouponDiscountType.FLAT_AMOUNT,
        discount_value: { toFixed: () => "100.00" },
      },
      customerContact: { legal_name: "Customer One", display_name: null, phone: null },
      issuedInvoice: { invoice_no: "POS-1", invoice_date: createdAt },
      redeemedInvoice: { invoice_no: "POS-2" },
    }]);

    const result = await listPosCouponIssues("organization-1", {
      take: 50,
      status: "CLAIMED",
      asOfDate: new Date("2026-11-08T00:00:00.000Z"),
    });

    expect(mocks.couponIssueFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "organization-1", status: "REDEEMED" },
    }));
    expect(result.issues[0]).toMatchObject({
      couponCode: "CC-CLAIMED",
      customerName: "Customer One",
      invoiceNumber: "POS-1",
      claimedInvoiceNumber: "POS-2",
      claimedAt: redeemedAt.toISOString(),
      status: "CLAIMED",
    });
  });

});
