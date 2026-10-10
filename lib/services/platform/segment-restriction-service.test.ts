import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    organization: { findUnique: vi.fn() },
    platformVersion: { findFirst: vi.fn() },
    versionBusinessType: { findMany: vi.fn() },
  },
  getEffectivePlansForOrganization: vi.fn(),
  isOrganizationTrialActive: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/platform/subscription-service", () => ({ getEffectivePlansForOrganization: mocks.getEffectivePlansForOrganization }));
vi.mock("@/lib/services/platform/organization-trial-service", () => ({ isOrganizationTrialActive: mocks.isOrganizationTrialActive }));

import { getEffectiveSegmentRestrictions } from "./segment-restriction-service";

describe("trial feature access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not apply plan segment restrictions during an active trial", async () => {
    mocks.isOrganizationTrialActive.mockResolvedValue(true);

    await expect(getEffectiveSegmentRestrictions("internal-organization-id")).resolves.toEqual([]);

    expect(mocks.isOrganizationTrialActive).toHaveBeenCalledWith("internal-organization-id");
    expect(mocks.getEffectivePlansForOrganization).not.toHaveBeenCalled();
  });
});