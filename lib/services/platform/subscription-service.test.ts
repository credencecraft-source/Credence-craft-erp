import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    organization: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  transaction: {
    subscription: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    plan: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    organization: { findFirst: vi.fn(), findUnique: vi.fn() },
    organizationMembership: { count: vi.fn() },
    platformAuditEvent: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
    $executeRaw: vi.fn(),
  },
  requirePlatformSessionAdmin: vi.fn(),
  pricingMode: { getPlatformPricingSettings: vi.fn() },
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: mocks.requirePlatformSessionAdmin,
}));
vi.mock("@/lib/services/platform/pricing-mode-service", () => ({
  getPlatformPricingSettings: mocks.pricingMode.getPlatformPricingSettings,
}));

import {
  addBillingMonths,
  calculateUserBasedSubscriptionAmounts,
  approveSubscription,
  createPendingSubscriptions,
  createPendingUserBasedSubscription,
  deleteSubscription,
  isSubscriptionActiveAt,
  getLatestPaidUserLicenseCount,
  subscriptionMatchesPricingMode,
  mapOrganizationsByReference,
  orphanedSubscriptionAuditDetails,
} from "./subscription-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(
    (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) => operation(mocks.transaction),
  );
  mocks.transaction.plan.findUnique.mockResolvedValue({ tier_key: "CLASSIC" });
  mocks.transaction.organization.findUnique.mockResolvedValue({
    id: "organization-id",
    pricing_mode: "MODULE_BASED",
  });
  mocks.pricingMode.getPlatformPricingSettings.mockResolvedValue({
    module_based_active: true,
    user_based_active: false,
  });
});

describe("subscription report organization lookup", () => {
  it("resolves organizations by internal or public identifier", () => {
    const organization = {
      id: "internal-org-id",
      organization_id: "public-org-id",
      organization_name: "Example Organization",
      organization_number: "0000000042",
    };
    const organizationsByReference = mapOrganizationsByReference([organization]);

    expect(organizationsByReference.get("internal-org-id")).toEqual(organization);
    expect(organizationsByReference.get("public-org-id")).toEqual(organization);
  });

  describe("subscription pricing mode mapping", () => {
    it("maps user-based flat subscriptions without business types", () => {
      const subscription = {
        business_type_id: null,
        plan: { tier_key: "USER_BASED" },
      };

      expect(subscriptionMatchesPricingMode(subscription, "USER_BASED")).toBe(true);
      expect(subscriptionMatchesPricingMode(subscription, "MODULE_BASED")).toBe(false);
    });

    it("reports the user-license count from the latest paid user-based subscription only", () => {
      const subscriptions = [
        {
          business_type_id: null,
          payment_status: "paid",
          billed_user_count: 3,
          created_at: new Date("2026-09-01T00:00:00.000Z"),
          plan: { tier_key: "USER_BASED" },
        },
        {
          business_type_id: null,
          payment_status: "paid",
          billed_user_count: 5,
          created_at: new Date("2026-10-01T00:00:00.000Z"),
          plan: { tier_key: "USER_BASED" },
        },
        {
          business_type_id: null,
          payment_status: "pending",
          billed_user_count: 8,
          created_at: new Date("2026-10-05T00:00:00.000Z"),
          plan: { tier_key: "USER_BASED" },
        },
        {
          business_type_id: "business-type-id",
          payment_status: "paid",
          billed_user_count: 12,
          created_at: new Date("2026-10-06T00:00:00.000Z"),
          plan: { tier_key: "STANDARD" },
        },
      ];

      expect(getLatestPaidUserLicenseCount(subscriptions)).toBe(5);
      expect(getLatestPaidUserLicenseCount([])).toBe(0);
    });

    it("maps module subscriptions only when they have a business type", () => {
      const subscription = {
        business_type_id: "business-type-id",
        plan: { tier_key: "STANDARD" },
      };

      expect(subscriptionMatchesPricingMode(subscription, "MODULE_BASED")).toBe(true);
      expect(subscriptionMatchesPricingMode(subscription, "USER_BASED")).toBe(false);
      expect(subscriptionMatchesPricingMode({ ...subscription, business_type_id: null }, "MODULE_BASED")).toBe(false);
      expect(subscriptionMatchesPricingMode(subscription, "UNASSIGNED")).toBe(false);
    });
  });

  it("leaves an unmatched subscription reference detectable", () => {
    const organizationsByReference = mapOrganizationsByReference([
      { id: "internal-org-id", organization_id: "public-org-id" },
    ]);

    expect(organizationsByReference.has("orphaned-org-reference")).toBe(false);
  });

  it("preserves the orphan reference and cleanup reason in platform audit details", () => {
    expect(orphanedSubscriptionAuditDetails({
      organization_id: "missing-organization-reference",
      organization_name: "Legacy Customer",
    })).toEqual({
      organizationReference: "missing-organization-reference",
      organizationName: "Legacy Customer",
      reason: "The referenced organization record does not exist.",
    });
  });

  it("deletes linked subscriptions through the organization audit trigger", async () => {
    mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      id: "subscription-id",
      organization_id: "internal-org-id",
      organization_name: "Example Organization",
    });
    mocks.prisma.organization.findFirst.mockResolvedValue({ id: "internal-org-id" });
    mocks.transaction.subscription.findUnique.mockResolvedValue({ organization_id: "internal-org-id" });
    mocks.transaction.subscription.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteSubscription("subscription-id", "platform-admin-id")).resolves.toEqual({ deleted: true });

    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "platform-admin-id",
        action: "SUBSCRIPTION_DELETED",
        entity_id: "subscription-id",
      }),
    }));
    expect(mocks.transaction.$executeRaw).not.toHaveBeenCalled();
    expect(mocks.transaction.subscription.deleteMany).toHaveBeenCalledWith({ where: { id: "subscription-id", organization_id: "internal-org-id" } });
  });

  it("audits and deletes an orphan only for the authenticated platform admin", async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      id: "orphan-subscription-id",
      organization_id: "missing-organization-reference",
      organization_name: "Legacy Customer",
    });
    mocks.prisma.organization.findFirst.mockResolvedValue(null);
    mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
    mocks.transaction.subscription.findUnique.mockResolvedValue({
      id: "orphan-subscription-id",
      organization_id: "missing-organization-reference",
      organization_name: "Legacy Customer",
    });
    mocks.transaction.organization.findFirst.mockResolvedValue(null);
    mocks.transaction.platformAuditEvent.create.mockResolvedValue({ id: "platform-audit-id" });
    mocks.transaction.subscription.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteSubscription("orphan-subscription-id", "platform-admin-id"))
      .resolves.toEqual({ deleted: true });

    expect(mocks.requirePlatformSessionAdmin).toHaveBeenCalledOnce();
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "platform-admin-id",
        action: "ORPHANED_SUBSCRIPTION_DELETED",
        entity_type: "Subscription",
        entity_id: "orphan-subscription-id",
        details: orphanedSubscriptionAuditDetails({
          organization_id: "missing-organization-reference",
          organization_name: "Legacy Customer",
        }),
      },
    });
    expect(mocks.transaction.$executeRaw).toHaveBeenCalledOnce();
    expect(mocks.transaction.subscription.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.transaction.platformAuditEvent.create.mock.invocationCallOrder[0]);
  });

  it("does not delete an orphan without a platform-admin actor", async () => {
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      id: "orphan-subscription-id",
      organization_id: "missing-organization-reference",
      organization_name: null,
    });
    mocks.prisma.organization.findFirst.mockResolvedValue(null);

    await expect(deleteSubscription("orphan-subscription-id")).rejects.toThrow(/platform administrator is required/);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("subscription lifecycle eligibility", () => {
  const now = new Date("2026-10-02T12:00:00.000Z");
  const plan = { price: 4999, tier_key: "CLASSIC" };
  const subscription = {
    payment_status: "paid",
    service_status: "active",
    start_date: new Date("2026-01-01T00:00:00.000Z"),
    end_date: new Date("2027-01-01T00:00:00.000Z"),
  };

  it("accepts paid active subscriptions only within their start and expiry dates", () => {
    expect(isSubscriptionActiveAt(subscription, plan, now)).toBe(true);
    expect(isSubscriptionActiveAt({ ...subscription, start_date: new Date("2026-10-02T12:00:01.000Z") }, plan, now)).toBe(false);
    expect(isSubscriptionActiveAt({ ...subscription, end_date: now }, plan, now)).toBe(false);
    expect(isSubscriptionActiveAt({ ...subscription, payment_status: "pending" }, plan, now)).toBe(false);
    expect(isSubscriptionActiveAt({ ...subscription, service_status: "inactive" }, plan, now)).toBe(false);
    expect(isSubscriptionActiveAt(subscription, { price: 0, tier_key: "FREE" }, now)).toBe(false);
  });

  it("clamps billing-month calculations to the last day of short months", () => {
    expect(addBillingMonths(new Date("2026-08-31T09:30:00.000Z"), 6))
      .toEqual(new Date("2027-02-28T09:30:00.000Z"));
  });

  it("calculates user-based subscription totals from the requested license count", () => {
    const amounts = calculateUserBasedSubscriptionAmounts(new Prisma.Decimal("25.00"), 5, 6);
    expect(amounts.subtotal_amount.toFixed(2)).toBe("750.00");
    expect(amounts.gst_amount.toFixed(2)).toBe("135.00");
    expect(amounts.total_amount.toFixed(2)).toBe("885.00");
    expect(() => calculateUserBasedSubscriptionAmounts(new Prisma.Decimal("25.00"), 0, 6))
      .toThrow(/at least one user license/);
  });

  it("creates a user-based request for purchased licenses beyond the active member count", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue({
      id: "organization-id",
      pricing_mode: "USER_BASED",
    });
    mocks.pricingMode.getPlatformPricingSettings.mockResolvedValue({
      user_based_active: true,
      user_monthly_price: new Prisma.Decimal("25.00"),
    });
    mocks.transaction.organizationMembership.count.mockResolvedValue(5);
    mocks.transaction.plan.upsert.mockResolvedValue({ id: "user-plan-id" });
    mocks.transaction.subscription.findFirst.mockResolvedValue(null);
    mocks.transaction.subscription.create.mockResolvedValue({ id: "subscription-id" });

    await createPendingUserBasedSubscription({
      organizationId: "organization-id",
      organizationName: "Example Organization",
      userId: "user-id",
      billingMonths: 6,
      billedUserCount: 8,
    });

    expect(mocks.transaction.subscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "organization-id",
        plan_id: "user-plan-id",
        billing_months: 6,
        billed_user_count: 8,
        subtotal_amount: new Prisma.Decimal("1200"),
        gst_amount: new Prisma.Decimal("216"),
        total_amount: new Prisma.Decimal("1416"),
      }),
    });
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "USER_BASED_SUBSCRIPTION_REQUESTED",
        details: expect.objectContaining({ billedUserCount: 8 }),
      }),
    }));
  });

  it("rejects a user-based license request below the current active member count", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue({
      id: "organization-id",
      pricing_mode: "USER_BASED",
    });
    mocks.pricingMode.getPlatformPricingSettings.mockResolvedValue({
      user_based_active: true,
      user_monthly_price: new Prisma.Decimal("25.00"),
    });
    mocks.transaction.organizationMembership.count.mockResolvedValue(5);

    await expect(createPendingUserBasedSubscription({
      organizationId: "organization-id",
      userId: "user-id",
      billingMonths: 12,
      billedUserCount: 4,
    })).rejects.toThrow(/at least 5 user licenses/);

    expect(mocks.transaction.subscription.create).not.toHaveBeenCalled();
  });

  it("requires support pricing for more than ten user licenses", async () => {
    mocks.transaction.organization.findUnique.mockResolvedValue({
      id: "organization-id",
      pricing_mode: "USER_BASED",
    });
    mocks.pricingMode.getPlatformPricingSettings.mockResolvedValue({
      user_based_active: true,
      user_monthly_price: new Prisma.Decimal("25.00"),
    });
    mocks.transaction.organizationMembership.count.mockResolvedValue(5);

    await expect(createPendingUserBasedSubscription({
      organizationId: "organization-id",
      userId: "user-id",
      billingMonths: 12,
      billedUserCount: 11,
    })).rejects.toThrow(/more than 10 users, contact support/);

    expect(mocks.transaction.subscription.create).not.toHaveBeenCalled();
  });

  it("returns an identical pending request on retry without creating duplicates", async () => {
    const existingSubscription = {
      id: "existing-subscription-id",
      business_type_id: "business-type-id",
      plan_id: "plan-id",
      billing_months: 12,
    };
    mocks.transaction.subscription.findMany.mockResolvedValue([existingSubscription]);

    await expect(createPendingSubscriptions({
      organizationId: "organization-id",
      items: [{
        businessTypeId: "business-type-id",
        planId: "plan-id",
        monthlyPrice: new Prisma.Decimal("4999.00"),
      }],
      billingMonths: 12,
    })).resolves.toEqual([existingSubscription]);

    expect(mocks.transaction.subscription.create).not.toHaveBeenCalled();
  });

  it("rejects a different plan when the business type already has a pending request", async () => {
    mocks.transaction.subscription.findMany.mockResolvedValue([{
      id: "existing-subscription-id",
      business_type_id: "business-type-id",
      plan_id: "another-plan-id",
      billing_months: 12,
    }]);

    await expect(createPendingSubscriptions({
      organizationId: "organization-id",
      items: [{
        businessTypeId: "business-type-id",
        planId: "plan-id",
        monthlyPrice: new Prisma.Decimal("4999.00"),
      }],
      billingMonths: 12,
    })).rejects.toThrow(/different subscription request is already awaiting approval/);
  });

  it("scopes organization deletion to the authorized organization", async () => {
    mocks.prisma.$transaction.mockImplementationOnce(
      (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) => operation(mocks.transaction),
    );
    mocks.transaction.subscription.findFirst.mockResolvedValue({
      business_type_id: "business-type-id",
      plan_id: "plan-id",
      payment_status: "pending",
    });

    await expect(deleteSubscription("subscription-id", undefined, "internal-organization-id", "workspace-user-id"))
      .resolves.toEqual({ deleted: true });

    expect(mocks.transaction.subscription.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "subscription-id",
        organization_id: "internal-organization-id",
        payment_status: { in: ["pending", "PENDING"] },
      },
    });
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-organization-id",
        user_id: "workspace-user-id",
        action: "PENDING_SUBSCRIPTION_DELETED",
      }),
    }));
  });

  it("schedules approval after an active paid term and sets its end date", async () => {
    const existingEndDate = new Date("2027-01-31T09:30:00.000Z");
    const latestExistingEndDate = new Date("2027-03-31T09:30:00.000Z");
    mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
    mocks.transaction.organization.findFirst.mockResolvedValue({ id: "organization-id" });
    mocks.transaction.subscription.findUnique.mockResolvedValue({
      id: "pending-subscription-id",
      organization_id: "organization-id",
      business_type_id: "business-type-id",
      payment_status: "pending",
      service_status: "inactive",
      billing_months: 6,
    });
    mocks.transaction.subscription.findMany.mockResolvedValue([
      { end_date: existingEndDate },
      { end_date: latestExistingEndDate },
    ]);
    mocks.transaction.subscription.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.subscription.findUniqueOrThrow.mockResolvedValue({
      id: "pending-subscription-id",
      organization_id: "organization-id",
      business_type_id: "business-type-id",
      plan_id: "plan-id",
      payment_status: "paid",
      service_status: "active",
      start_date: latestExistingEndDate,
      end_date: addBillingMonths(latestExistingEndDate, 6),
    });

    await approveSubscription("pending-subscription-id");

    expect(mocks.transaction.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pending-subscription-id", payment_status: { in: ["pending", "PENDING"] } },
      data: expect.objectContaining({
        start_date: latestExistingEndDate,
        end_date: addBillingMonths(latestExistingEndDate, 6),
        payment_status: "paid",
        service_status: "active",
      }),
    }));
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "platform-admin-id",
        action: "SUBSCRIPTION_APPROVED",
        entity_type: "Subscription",
        entity_id: "pending-subscription-id",
      }),
    }));
  });

  it("repairs a public organization reference before approving a legacy subscription", async () => {
    mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
    mocks.transaction.organization.findFirst.mockResolvedValue({ id: "internal-organization-id" });
    mocks.transaction.subscription.findUnique.mockResolvedValue({
      id: "pending-subscription-id",
      organization_id: "public-organization-id",
      business_type_id: "business-type-id",
      payment_status: "pending",
      service_status: "inactive",
      billing_months: 12,
    });
    mocks.transaction.subscription.findMany.mockResolvedValue([]);
    mocks.transaction.subscription.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.subscription.findUniqueOrThrow.mockResolvedValue({
      id: "pending-subscription-id",
      organization_id: "internal-organization-id",
      business_type_id: "business-type-id",
      plan_id: "plan-id",
      payment_status: "paid",
      service_status: "active",
      start_date: new Date("2026-10-04T00:00:00.000Z"),
      end_date: new Date("2027-10-04T00:00:00.000Z"),
    });

    await approveSubscription("pending-subscription-id");

    expect(mocks.transaction.subscription.update).toHaveBeenCalledWith({
      where: { id: "pending-subscription-id" },
      data: { organization_id: "internal-organization-id" },
    });
    expect(mocks.transaction.subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pending-subscription-id", payment_status: { in: ["pending", "PENDING"] } },
    }));
  });

  it("rejects approval of a subscription with no matching organization", async () => {
    mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
    mocks.transaction.organization.findFirst.mockResolvedValue(null);
    mocks.transaction.subscription.findUnique.mockResolvedValue({
      id: "orphan-subscription-id",
      organization_id: "missing-organization-id",
      business_type_id: "business-type-id",
      payment_status: "pending",
      service_status: "inactive",
      billing_months: 12,
    });

    await expect(approveSubscription("orphan-subscription-id"))
      .rejects.toThrow(/organization no longer exists/);
    expect(mocks.transaction.subscription.updateMany).not.toHaveBeenCalled();
  });
});