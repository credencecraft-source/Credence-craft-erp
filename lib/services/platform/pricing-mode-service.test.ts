import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock, requirePlatformSessionAdminMock } = vi.hoisted(() => {
  const transaction = {
    platformPricingSettings: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    organization: { count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    organizationMembership: { count: vi.fn() },
    platformAuditEvent: { create: vi.fn() },
  };
  return {
    transactionMock: transaction,
    prismaMock: {
      platformPricingSettings: transaction.platformPricingSettings,
      organization: transaction.organization,
      organizationMembership: transaction.organizationMembership,
      platformAuditEvent: transaction.platformAuditEvent,
      $transaction: vi.fn(),
    },
    requirePlatformSessionAdminMock: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
}));

import {
  countActiveOrganizationMembers,
  countOrganizationMembers,
  isPricingModeEnabled,
  parseUserMonthlyPrice,
  setOrganizationPricingMode,
  updatePlatformPricingSettings,
} from "./pricing-mode-service";

describe("platform pricing modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSessionAdminMock.mockResolvedValue({ id: "admin-id" });
    prismaMock.$transaction.mockImplementation(async (operation: (transaction: typeof transactionMock) => Promise<unknown>) =>
      operation(transactionMock),
    );
    transactionMock.platformPricingSettings.upsert.mockResolvedValue({
      id: "global",
      module_based_active: true,
      user_based_active: false,
      user_monthly_price: new Prisma.Decimal("25.00"),
    });
    transactionMock.platformPricingSettings.update.mockResolvedValue({
      id: "global",
      module_based_active: true,
      user_based_active: true,
      user_monthly_price: new Prisma.Decimal("25.00"),
    });
    transactionMock.platformAuditEvent.create.mockResolvedValue({});
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "organization-id",
      pricing_mode: "MODULE_BASED",
    });
    transactionMock.organization.update.mockResolvedValue({
      id: "organization-id",
      pricing_mode: "USER_BASED",
    });
    transactionMock.organizationMembership.count.mockResolvedValue(4);
  });

  it("only enables pricing modes configured with a valid platform rate", () => {
    const settings = {
      module_based_active: true,
      user_based_active: true,
      user_monthly_price: new Prisma.Decimal("25.00"),
    };

    expect(isPricingModeEnabled(settings, "MODULE_BASED")).toBe(true);
    expect(isPricingModeEnabled(settings, "USER_BASED")).toBe(true);
    expect(isPricingModeEnabled({ ...settings, user_monthly_price: new Prisma.Decimal("0") }, "USER_BASED")).toBe(false);
    expect(isPricingModeEnabled({ ...settings, module_based_active: false }, "MODULE_BASED")).toBe(false);
    expect(isPricingModeEnabled(settings, "UNASSIGNED")).toBe(false);
  });

  it("parses supported decimal rates and rejects malformed values", () => {
    expect(parseUserMonthlyPrice("25.5").toFixed(2)).toBe("25.50");
    expect(() => parseUserMonthlyPrice("-1")).toThrow();
    expect(() => parseUserMonthlyPrice("1.999")).toThrow();
    expect(() => parseUserMonthlyPrice("1e3")).toThrow();
  });

  it("prevents deactivating a pricing mode assigned to organizations", async () => {
    transactionMock.organization.count.mockResolvedValue(1);

    await expect(updatePlatformPricingSettings({
      mode: "MODULE_BASED",
      isActive: false,
    })).rejects.toThrow(/assigned to organizations/);

    expect(transactionMock.platformPricingSettings.update).not.toHaveBeenCalled();
  });

  it("requires a positive per-user rate before activation", async () => {
    transactionMock.platformPricingSettings.upsert.mockResolvedValueOnce({
      id: "global",
      module_based_active: true,
      user_based_active: false,
      user_monthly_price: new Prisma.Decimal("0"),
    });

    await expect(updatePlatformPricingSettings({
      mode: "USER_BASED",
      isActive: true,
    })).rejects.toThrow(/greater than zero/);
    expect(transactionMock.platformPricingSettings.update).not.toHaveBeenCalled();
  });

  it("assigns only an enabled pricing mode to the requested organization", async () => {
    transactionMock.platformPricingSettings.upsert.mockResolvedValue({
      id: "global",
      module_based_active: true,
      user_based_active: true,
      user_monthly_price: new Prisma.Decimal("25.00"),
    });

    await expect(setOrganizationPricingMode("organization-id", "USER_BASED"))
      .resolves.toEqual({ id: "organization-id", pricing_mode: "USER_BASED" });
    expect(transactionMock.organization.findUnique).toHaveBeenCalledWith({
      where: { id: "organization-id" },
      select: { id: true, pricing_mode: true },
    });
    expect(transactionMock.organization.update).toHaveBeenCalledWith({
      where: { id: "organization-id" },
      data: { pricing_mode: "USER_BASED" },
      select: { id: true, pricing_mode: true },
    });
  });

  it("counts billable organization members using active membership rows", async () => {
    await expect(countActiveOrganizationMembers("organization-id")).resolves.toBe(4);
    expect(prismaMock.organizationMembership.count).toHaveBeenCalledWith({
      where: { organization_id: "organization-id", is_active: true },
    });
  });

  it("counts all organization memberships including inactive ones", async () => {
    await expect(countOrganizationMembers("organization-id")).resolves.toBe(4);
    expect(prismaMock.organizationMembership.count).toHaveBeenCalledWith({
      where: { organization_id: "organization-id" },
    });
  });
});
