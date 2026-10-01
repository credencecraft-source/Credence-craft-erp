import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    subscription: { findUnique: vi.fn() },
    organization: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
  transaction: {
    subscription: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    organization: { findFirst: vi.fn() },
    platformAuditEvent: { create: vi.fn() },
    $executeRaw: vi.fn(),
  },
  requirePlatformSessionAdmin: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: mocks.requirePlatformSessionAdmin,
}));

import {
  deleteSubscription,
  mapOrganizationsByReference,
  orphanedSubscriptionAuditDetails,
} from "./subscription-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(
    (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) => operation(mocks.transaction),
  );
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
    mocks.prisma.subscription.findUnique.mockResolvedValue({
      id: "subscription-id",
      organization_id: "internal-org-id",
      organization_name: "Example Organization",
    });
    mocks.prisma.organization.findFirst.mockResolvedValue({ id: "internal-org-id" });
    mocks.transaction.subscription.findUnique.mockResolvedValue({ organization_id: "internal-org-id" });
    mocks.transaction.subscription.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteSubscription("subscription-id", "platform-admin-id")).resolves.toEqual({ deleted: true });

    expect(mocks.transaction.platformAuditEvent.create).not.toHaveBeenCalled();
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

    await expect(deleteSubscription("orphan-subscription-id")).rejects.toThrow(/requires platform-admin cleanup/);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});