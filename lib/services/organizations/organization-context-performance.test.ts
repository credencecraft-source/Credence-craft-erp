import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  organizationFindFirst: vi.fn(),
  startOrganizationTrialOnFirstOpen: vi.fn(),
  hasOrganizationTrialAccess: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { organization: { findFirst: mocks.organizationFindFirst } },
}));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: vi.fn(),
  requirePlatformSessionSuperAdmin: vi.fn(),
}));
vi.mock("@/lib/services/platform/organization-trial-service", () => ({
  hasOrganizationTrialAccess: mocks.hasOrganizationTrialAccess,
  startOrganizationTrialOnApproval: vi.fn(),
  startOrganizationTrialOnFirstOpen: mocks.startOrganizationTrialOnFirstOpen,
}));
vi.mock("./organization-process-template-service", () => ({
  ensureDefaultProcessTemplate: vi.fn(),
}));

import { requireOrganizationContext } from "./organization-service";

const activeTrialOrganization = {
  id: "internal-org-1",
  organization_id: "public-org-1",
  approval_status: "APPROVED",
  trial_started_at: new Date("2026-10-02T10:00:00.000Z"),
  trial_ends_at: new Date("2026-10-03T10:00:00.000Z"),
  trial_enabled: true,
  memberships: [{ id: "membership-1", role: "OWNER" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.organizationFindFirst.mockResolvedValue(activeTrialOrganization);
  mocks.hasOrganizationTrialAccess.mockResolvedValue(true);
  mocks.startOrganizationTrialOnFirstOpen.mockResolvedValue({
    trial_started_at: new Date("2026-10-02T10:00:00.000Z"),
    trial_ends_at: new Date("2026-10-03T10:00:00.000Z"),
    trial_enabled: true,
  });
});

describe("organization access and trial performance", () => {
  it("uses the authorized active-trial snapshot without starting a transaction or rereading organization state", async () => {
    await expect(requireOrganizationContext("user-1", "public-org-1", ["OWNER"])).resolves.toEqual({
      id: "internal-org-1",
      organizationId: "public-org-1",
      membershipId: "membership-1",
      role: "OWNER",
    });

    expect(mocks.organizationFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "public-org-1",
        memberships: {
          some: {
            workspace_user_id: "user-1",
            is_active: true,
            role: { in: ["OWNER"] },
          },
        },
      }),
      select: expect.objectContaining({
        id: true,
        organization_id: true,
        approval_status: true,
        trial_started_at: true,
        trial_ends_at: true,
        trial_enabled: true,
      }),
    }));
    expect(mocks.startOrganizationTrialOnFirstOpen).not.toHaveBeenCalled();
    expect(mocks.hasOrganizationTrialAccess).toHaveBeenCalledWith(
      "internal-org-1",
      expect.any(Date),
      {
        trial_started_at: activeTrialOrganization.trial_started_at,
        trial_ends_at: activeTrialOrganization.trial_ends_at,
        trial_enabled: true,
      },
    );
  });

  it("starts an approved trial only on first access and checks the resulting snapshot", async () => {
    mocks.organizationFindFirst.mockResolvedValue({
      ...activeTrialOrganization,
      trial_started_at: null,
      trial_ends_at: null,
    });
    const startedSnapshot = {
      trial_started_at: new Date("2026-10-02T12:00:00.000Z"),
      trial_ends_at: new Date("2026-10-03T12:00:00.000Z"),
      trial_enabled: true,
    };
    mocks.startOrganizationTrialOnFirstOpen.mockResolvedValue(startedSnapshot);

    await expect(requireOrganizationContext("user-1", "public-org-1")).resolves.toMatchObject({
      id: "internal-org-1",
      role: "OWNER",
    });

    expect(mocks.startOrganizationTrialOnFirstOpen).toHaveBeenCalledWith("internal-org-1", "user-1");
    expect(mocks.hasOrganizationTrialAccess).toHaveBeenCalledWith(
      "internal-org-1",
      expect.any(Date),
      startedSnapshot,
    );
  });

  it("still denies access when an expired trial has no eligible subscription", async () => {
    mocks.organizationFindFirst.mockResolvedValue({
      ...activeTrialOrganization,
      trial_started_at: new Date("2026-10-01T10:00:00.000Z"),
      trial_ends_at: new Date("2026-10-02T10:00:00.000Z"),
    });
    mocks.hasOrganizationTrialAccess.mockResolvedValue(false);

    await expect(requireOrganizationContext("user-1", "public-org-1"))
      .rejects.toThrow("This organization's trial has ended.");
    expect(mocks.startOrganizationTrialOnFirstOpen).not.toHaveBeenCalled();
  });

  it("preserves expired-trial access exceptions without checking trial entitlement", async () => {
    mocks.organizationFindFirst.mockResolvedValue({
      ...activeTrialOrganization,
      trial_started_at: new Date("2026-10-01T10:00:00.000Z"),
      trial_ends_at: new Date("2026-10-02T10:00:00.000Z"),
    });

    await expect(requireOrganizationContext(
      "user-1",
      "public-org-1",
      undefined,
      { allowExpiredTrial: true },
    )).resolves.toMatchObject({ id: "internal-org-1" });
    expect(mocks.hasOrganizationTrialAccess).not.toHaveBeenCalled();
  });

  it("rejects missing memberships before checking trial access", async () => {
    mocks.organizationFindFirst.mockResolvedValue(null);

    await expect(requireOrganizationContext("user-1", "public-org-1"))
      .rejects.toThrow("Access denied: organization not found or membership is inactive.");
    expect(mocks.startOrganizationTrialOnFirstOpen).not.toHaveBeenCalled();
    expect(mocks.hasOrganizationTrialAccess).not.toHaveBeenCalled();
  });

  it("preserves role denial after trial access is checked", async () => {
    mocks.organizationFindFirst.mockResolvedValue({
      ...activeTrialOrganization,
      memberships: [{ id: "membership-1", role: "VIEWER" }],
    });

    await expect(requireOrganizationContext("user-1", "public-org-1", ["ADMIN"]))
      .rejects.toThrow("Access denied: insufficient organization permissions.");
  });
});
