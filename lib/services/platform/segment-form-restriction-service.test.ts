import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { organization: { findUnique: vi.fn() } },
  getEffectivePlansForOrganization: vi.fn(),
  isOrganizationTrialActive: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/platform/subscription-service", () => ({ getEffectivePlansForOrganization: mocks.getEffectivePlansForOrganization }));
vi.mock("@/lib/services/platform/organization-trial-service", () => ({ isOrganizationTrialActive: mocks.isOrganizationTrialActive }));

import {
  getConfiguredMonthlyRecordLimits,
  exceedsMonthlyQuantityLimit,
  getEffectiveSegmentFormRestriction,
  resolveEffectiveMonthlyFormLimits,
  resolveMonthlyEntryLimit,
  validateMonthlyFormLimits,
  validateRestrictedFormFields,
} from "./segment-form-restriction-service";

describe("trial form access", () => {
  it("does not apply form field or monthly limits during an active trial", async () => {
    mocks.isOrganizationTrialActive.mockResolvedValue(true);

    await expect(getEffectiveSegmentFormRestriction("internal-organization-id", "merchandising_orders")).resolves.toBeNull();

    expect(mocks.isOrganizationTrialActive).toHaveBeenCalledWith("internal-organization-id");
    expect(mocks.getEffectivePlansForOrganization).not.toHaveBeenCalled();
  });
});

describe("User Based form access", () => {
  it("does not resolve segment restrictions or monthly limits", async () => {
    mocks.isOrganizationTrialActive.mockResolvedValue(false);
    mocks.prisma.organization.findUnique.mockResolvedValue({
      platform_version_id: "version-1",
      pricing_mode: "USER_BASED",
    });

    await expect(
      getEffectiveSegmentFormRestriction("internal-organization-id", "merchandising_orders"),
    ).resolves.toBeNull();

    expect(mocks.getEffectivePlansForOrganization).not.toHaveBeenCalled();
  });
});

describe("factory monthly record limit pricing data", () => {
  it("rejects monthly order quantities above the cap but allows the exact cap", () => {
    expect(exceedsMonthlyQuantityLimit(80, 21, 100)).toBe(true);
    expect(exceedsMonthlyQuantityLimit(80, 20, 100)).toBe(false);
    expect(exceedsMonthlyQuantityLimit(80, 21, null)).toBe(false);
    expect(exceedsMonthlyQuantityLimit("999999999999999999", "1", 1_000_000_000)).toBe(true);
  });

  it("keeps the segment quantity cap when a version entry cap exists", () => {
    expect(resolveEffectiveMonthlyFormLimits(
      { monthly_qty_limit: 250, monthly_entry_limit: 12 },
      { monthly_entry_limit: 8 },
    )).toEqual({ monthly_qty_limit: 250, monthly_entry_limit: 8 });
  });

  it("allows a version entry cap to explicitly clear the entry limit without clearing quantity", () => {
    expect(resolveEffectiveMonthlyFormLimits(
      { monthly_qty_limit: 250, monthly_entry_limit: 12 },
      { monthly_entry_limit: null },
    )).toEqual({ monthly_qty_limit: 250, monthly_entry_limit: null });
  });

  it("uses version-level limits before business-type segment limits", () => {
    expect(resolveMonthlyEntryLimit(20, { monthly_entry_limit: 8 })).toBe(8);
    expect(resolveMonthlyEntryLimit(20, null)).toBe(20);
  });

  it("treats a blank version-level override as unlimited", () => {
    expect(resolveMonthlyEntryLimit(20, { monthly_entry_limit: null })).toBeNull();
  });

  it("lists only positive version-level form limits for the matching segment", () => {
    const limits = getConfiguredMonthlyRecordLimits(
      "free-segment",
      [
        { segment_id: "free-segment", form_key: "inventory_receipts", monthly_entry_limit: 6 },
        { segment_id: "free-segment", form_key: "finished_goods_stock", monthly_entry_limit: 0 },
        { segment_id: "free-segment", form_key: "purchase_orders", monthly_entry_limit: null },
        { segment_id: "premium-segment", form_key: "purchase_orders", monthly_entry_limit: 4 },
      ],
    );

    expect(limits).toEqual([
      { formKey: "inventory_receipts", label: "Inventory Receipts", monthlyEntryLimit: 6 },
    ]);
  });
});

describe("preloaded form restriction validation", () => {
  const restriction = {
    monthly_qty_limit: 50,
    monthly_entry_limit: 1,
    restricted_fields: ["colors"],
  } as unknown as NonNullable<Awaited<ReturnType<typeof getEffectiveSegmentFormRestriction>>>;

  it("still blocks restricted fields using a resolved restriction", async () => {
    await expect(validateRestrictedFormFields(
      "organization-id",
      "merchandising_orders",
      { colors: "Red" },
      restriction,
    )).rejects.toThrow("These fields are restricted for your segment: colors.");
  });

  it("still enforces monthly limits using a resolved restriction", async () => {
    const countMock = vi.fn().mockResolvedValue(1);
    const aggregateMock = vi.fn().mockResolvedValue({ _sum: { orderQty: 20 } });
    const database = {
      merchandisingOrder: {
        count: countMock,
        aggregate: aggregateMock,
      },
    } as unknown as NonNullable<Parameters<typeof validateMonthlyFormLimits>[4]>;

    await expect(validateMonthlyFormLimits(
      "organization-id",
      "merchandising_orders",
      10,
      undefined,
      database,
      restriction,
    )).rejects.toThrow("This form allows 1 entries per month.");

    const countedWhere = countMock.mock.calls[0][0].where;
    expect(countedWhere.sourceStatus).toEqual({ not: "DEMO" });
    expect(aggregateMock).toHaveBeenCalledWith(expect.objectContaining({ where: countedWhere }));
  });

  it("counts every entry when validating a batch of records", async () => {
    const database = {
      merchandisingOrder: {
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _sum: { orderQty: 0 } }),
      },
    } as unknown as NonNullable<Parameters<typeof validateMonthlyFormLimits>[4]>;

    await expect(validateMonthlyFormLimits(
      "organization-id",
      "merchandising_orders",
      40,
      undefined,
      database,
      { ...restriction, monthly_entry_limit: 10 },
      10,
    )).resolves.toBeUndefined();

    await expect(validateMonthlyFormLimits(
      "organization-id",
      "merchandising_orders",
      40,
      undefined,
      database,
      { ...restriction, monthly_entry_limit: 9 },
      10,
    )).rejects.toThrow("This form allows 9 entries per month.");
  });
});