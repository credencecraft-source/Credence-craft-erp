import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    organizationKycProfile: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    auditEvent: { create: vi.fn() },
    platformAuditEvent: { create: vi.fn() },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn(),
      organizationKycProfile: { findUnique: vi.fn() },
    },
    requireOrganizationPermission: vi.fn(),
    requirePlatformSessionAdmin: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: mocks.requirePlatformSessionAdmin,
}));

import {
  getOrganizationKycProfileForUser,
  OrganizationKycReviewError,
  resetOrganizationKycDraft,
  reviewOrganizationKyc,
  upsertOrganizationKycDraft,
} from "./organization-kyc-service";

const validData = {
  businessTypes: ["Manufacturing"],
  businessTypeOther: null,
  staffCount: 12,
  factoryCount: 1,
  outletCount: 0,
  businessStartedYear: 2018,
  softwareUsed: "Tally ERP",
  majorChallenges: ["Quality control"],
  majorChallengeOther: null,
  brandsWorkedWith: null,
  monthlyProductionPcs: 2500,
  businessActivities: ["Own brands"],
  factoryArrangement: "OWN",
  kycDetails: {
    founderName: "Asha",
    founderDesignation: "Founder",
    teamMemberCount: 14,
    topManagementCount: 2,
    products: ["Shirts"],
    otherProduct: null,
    washingUnit: "NO",
    embroideryUnit: "YES",
    shiftCount: 2,
    businessChannel: "MANUFACTURING",
    businessRole: "BRAND_OWNER",
    marketCoverage: "DOMESTIC_ONLY",
    brandModel: "OWN_BRAND",
    ownBrandNames: "Studio A",
    ownBrandChannels: ["POS"],
    whiteLabelFulfilment: null,
    whiteLabelBrands: null,
    whiteLabelWorkTypes: [],
    buyerNominatedRawMaterials: null,
    softwareModules: ["None"],
    usesSoftware: "YES",
    financeSoftware: ["TALLY"],
    financeSoftwareOther: null,
    hasMerchandisers: "YES",
    hasDedicatedStoreIncharge: "NO",
    hasProductionManager: "YES",
    hasSeparateDispatchAccounts: "NO",
    lastYearTurnover: 5000000,
    msmeStatus: "REGISTERED",
  },
  registrationSnapshot: { gst_number: "GSTIN", name: "Example Garments" },
  submitting: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(
    (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
      operation(mocks.transaction),
  );
  mocks.requireOrganizationPermission.mockResolvedValue({
    organization_id: "internal-organization-id",
    workspace_user_id: "workspace-user-id",
  });
  mocks.prisma.organizationKycProfile.findUnique.mockResolvedValue(null);
  mocks.requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
  mocks.transaction.organizationKycProfile.findUnique.mockResolvedValue(null);
  mocks.transaction.organizationKycProfile.create.mockResolvedValue({
    id: "kyc-profile-id",
    status: "SUBMITTED",
  });
  mocks.transaction.organizationKycProfile.updateMany.mockResolvedValue({ count: 1 });
  mocks.transaction.organizationKycProfile.findUniqueOrThrow.mockResolvedValue({
    id: "kyc-profile-id",
    status: "APPROVED",
  });
});

describe("organization KYC lifecycle", () => {
  it("authorizes profile reads and scopes them to the membership's internal organization ID", async () => {
    await getOrganizationKycProfileForUser("workspace-user-id", "public-organization-id");

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "workspace-user-id",
      "public-organization-id",
      "ORGANIZATION_SETTINGS",
    );
    expect(mocks.prisma.organizationKycProfile.findUnique).toHaveBeenCalledWith({
      where: { organization_id: "internal-organization-id" },
    });
  });

  it("does not read a profile when organization permission is denied", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied"));

    await expect(
      getOrganizationKycProfileForUser("workspace-user-id", "public-organization-id"),
    ).rejects.toThrow("Access denied");

    expect(mocks.prisma.organizationKycProfile.findUnique).not.toHaveBeenCalled();
  });

  it("authorizes by internal organization ID and audits a submission transactionally", async () => {
    await upsertOrganizationKycDraft("workspace-user-id", "internal-organization-id", validData);

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "workspace-user-id",
      "internal-organization-id",
      "ORGANIZATION_SETTINGS",
    );
    expect(mocks.transaction.organizationKycProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: "internal-organization-id",
          status: "SUBMITTED",
          kyc_details: validData.kycDetails,
        }),
      }),
    );
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "internal-organization-id",
        action: "KYC_SUBMITTED",
        entity_id: "kyc-profile-id",
      }),
    });
  });

  it("prevents edits while a submission is pending review", async () => {
    mocks.transaction.organizationKycProfile.findUnique.mockResolvedValue({ status: "SUBMITTED" });

    await expect(
      upsertOrganizationKycDraft("workspace-user-id", "internal-organization-id", validData),
    ).rejects.toThrow("locked while submitted or approved");

    expect(mocks.transaction.organizationKycProfile.create).not.toHaveBeenCalled();
    expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("uses a conditional tenant-scoped update for an existing draft", async () => {
    mocks.transaction.organizationKycProfile.findUnique.mockResolvedValue({ status: "DRAFT" });

    await upsertOrganizationKycDraft("workspace-user-id", "internal-organization-id", validData);

    expect(mocks.transaction.organizationKycProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organization_id: "internal-organization-id",
          status: { in: ["DRAFT", "REJECTED"] },
        },
        data: expect.objectContaining({ status: "SUBMITTED" }),
      }),
    );
  });

  it("does not overwrite a draft if its lifecycle status changes before the update", async () => {
    mocks.transaction.organizationKycProfile.findUnique.mockResolvedValue({ status: "DRAFT" });
    mocks.transaction.organizationKycProfile.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      upsertOrganizationKycDraft("workspace-user-id", "internal-organization-id", validData),
    ).rejects.toThrow("changed and can no longer be edited");

    expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("clears an editable KYC draft and records an organization-scoped audit event", async () => {
    mocks.transaction.organizationKycProfile.findUnique.mockResolvedValue({
      id: "kyc-profile-id",
      status: "DRAFT",
    });

    await resetOrganizationKycDraft("workspace-user-id", "internal-organization-id");

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "workspace-user-id",
      "internal-organization-id",
      "ORGANIZATION_SETTINGS",
    );
    expect(mocks.transaction.organizationKycProfile.updateMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-organization-id",
        status: { in: ["DRAFT", "REJECTED", "NOT_STARTED"] },
      },
      data: expect.objectContaining({
        status: "DRAFT",
        kyc_details: expect.anything(),
        business_types: [],
        business_started_year: null,
        major_challenges: [],
        submitted_at: null,
        reviewed_at: null,
      }),
    });
    expect(mocks.transaction.organizationKycProfile.updateMany.mock.calls[0][0].data)
      .not.toHaveProperty("registration_snapshot");
    expect(mocks.transaction.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_id: "internal-organization-id",
        user_id: "workspace-user-id",
        action: "KYC_DRAFT_RESET",
        entity_id: "kyc-profile-id",
      }),
    });
  });

  it("does not clear submitted or approved KYC profiles", async () => {
    mocks.transaction.organizationKycProfile.findUnique.mockResolvedValue({
      id: "kyc-profile-id",
      status: "SUBMITTED",
    });

    await expect(
      resetOrganizationKycDraft("workspace-user-id", "internal-organization-id"),
    ).rejects.toThrow("locked while submitted or approved");

    expect(mocks.transaction.organizationKycProfile.updateMany).not.toHaveBeenCalled();
    expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("does not audit a reset if the profile lifecycle changes before clearing", async () => {
    mocks.transaction.organizationKycProfile.findUnique.mockResolvedValue({
      id: "kyc-profile-id",
      status: "DRAFT",
    });
    mocks.transaction.organizationKycProfile.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      resetOrganizationKycDraft("workspace-user-id", "internal-organization-id"),
    ).rejects.toThrow("changed and can no longer be reset");

    expect(mocks.transaction.auditEvent.create).not.toHaveBeenCalled();
  });

  it("approves only submitted profiles and records the platform audit event", async () => {
    await reviewOrganizationKyc("platform-admin-id", "internal-organization-id", true, "Verified");

    expect(mocks.transaction.organizationKycProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-organization-id", status: "SUBMITTED" },
        data: expect.objectContaining({
          status: "APPROVED",
          reviewed_by_platform_admin_id: "platform-admin-id",
          review_note: "Verified",
        }),
      }),
    );
    expect(mocks.transaction.platformAuditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "KYC_APPROVED",
        entity_id: "kyc-profile-id",
      }),
    });
  });

  it("requires a rejection reason and refuses stale review actions", async () => {
    await expect(
      reviewOrganizationKyc("platform-admin-id", "internal-organization-id", false),
    ).rejects.toBeInstanceOf(OrganizationKycReviewError);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();

    mocks.transaction.organizationKycProfile.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      reviewOrganizationKyc("platform-admin-id", "internal-organization-id", true),
    ).rejects.toThrow("Only a submitted KYC profile can be reviewed");
    expect(mocks.transaction.platformAuditEvent.create).not.toHaveBeenCalled();
  });
});
