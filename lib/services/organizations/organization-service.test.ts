import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock, requirePlatformSessionAdmin } = vi.hoisted(() => {
  const transactionMock = {
    $executeRaw: vi.fn(),
    platformAuditEvent: { create: vi.fn() },
    organization: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    factoryDailyProductionReportLine: { deleteMany: vi.fn() },
    factoryGrn: { deleteMany: vi.fn() },
    factoryBundleTransfer: { deleteMany: vi.fn() },
    workOrderProcessControllerProcess: { deleteMany: vi.fn() },
    workOrderProcessController: { deleteMany: vi.fn() },
    orderProcessControllerProcess: { deleteMany: vi.fn() },
    orderProcessController: { deleteMany: vi.fn() },
    merchandisingOrderProcessStep: { deleteMany: vi.fn() },
    eRPSoftware: { create: vi.fn() },
    organizationRoleDefinition: { createMany: vi.fn() },
    organizationRolePermission: { createMany: vi.fn() },
    masterGstType: { createMany: vi.fn() },
    masterGst: { findMany: vi.fn(), createMany: vi.fn() },
    masterRawMaterialType: { createMany: vi.fn() },
    masterProduct: { createMany: vi.fn() },
    masterEntity: { createMany: vi.fn() },
    masterState: { createMany: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(),
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const requirePlatformSessionAdmin = vi.fn();
  return { prismaMock, transactionMock, requirePlatformSessionAdmin };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/platform-session-manager", () => ({ requirePlatformSessionAdmin }));

import {
  normalizeDisplayText,
  normalizeFullName,
  normalizeProfileName,
  normalizeStatusLabel,
  normalizeSystemStatusKey,
} from "@/lib/auth/validation-rules";
import {
  archiveOrganization,
  countOrganizationsForUser,
  createOrganization,
  deleteOrganizationFromPlatform,
  forceDeleteOrganizationFromPlatform,
  getOrganizationDeletionEligibility,
  listWorkspaceOrganizationPage,
  restoreOrganization,
  updateOrganizationApprovalStatus,
} from "./organization-service";

const organization = {
  id: "org-internal-id",
  organization_number: "0000000123",
  organization_id: "org-public-id",
  organization_name: "Northwind Apparel",
  approval_status: "APPROVED",
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePlatformSessionAdmin.mockResolvedValue({ id: "platform-admin-id" });
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  transactionMock.$executeRaw.mockResolvedValue(1);
  transactionMock.organization.create.mockResolvedValue(organization);
  transactionMock.masterGst.findMany.mockResolvedValue([]);
});

describe("shared display-text normalization", () => {
  it("trims and standardizes name-like input to title case while preserving emails and codes", () => {
    expect(normalizeDisplayText("  jOHN   DOE  ")).toBe("John Doe");
    expect(normalizeProfileName("  FULL  CAP  ")).toBe("Full Cap");
    expect(normalizeFullName("  mARIA  dELA  cRUZ  ")).toBe("Maria Dela Cruz");
    expect(normalizeDisplayText("  abC@EXAMPLE.COM  ")).toBe("abc@example.com");
    expect(normalizeDisplayText("  GSTIN-123  ")).toBe("Gstin-123");
  });

  it("normalizes system and custom status labels consistently at the shared boundary", () => {
    expect(normalizeStatusLabel("  draft  ")).toBe("Draft");
    expect(normalizeStatusLabel("WAITING_FOR_APPROVAL")).toBe("Waiting For Approval");
    expect(normalizeStatusLabel("pending review")).toBe("Pending Review");
    expect(normalizeSystemStatusKey("  draft  ")).toBe("DRAFT");
    expect(normalizeSystemStatusKey("waiting for approval")).toBe("WAITING_FOR_APPROVAL");
  });
});

describe("organization creation defaults", () => {
  it("creates default raw-material, product, and GST-derived entity masters transactionally", async () => {
    await createOrganization({
      workspaceUserId: "workspace-user-id",
      organizationName: "Northwind Apparel",
      organizationEmail: " SALES@NORTHWIND.COM ",
      gstNumber: "22AAAAA0000A1Z5",
      mobileNo: "9876543210",
    });

    expect(transactionMock.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organization_name: "Northwind Apparel",
        organization_email: "sales@northwind.com",
        gst_number: "22AAAAA0000A1Z5",
        mobile_number: "9876543210",
      }),
    });
    expect(transactionMock.masterRawMaterialType.createMany).toHaveBeenCalledWith({
      data: [{ organization_id: organization.id, raw_material_type: "Item", is_active: true, sort_order: 0 }],
      skipDuplicates: true,
    });
    expect(transactionMock.masterProduct.createMany).toHaveBeenCalledWith({
      data: [{ organization_id: organization.id, product_master_name: "Finished Goods", is_active: true, sort_order: 0 }],
      skipDuplicates: true,
    });
    expect(transactionMock.masterEntity.createMany).toHaveBeenCalledWith({
      data: [{ organization_id: organization.id, entity_name: "Northwind Apparel", is_active: true, sort_order: 0 }],
      skipDuplicates: true,
    });
    expect(transactionMock.masterGst.createMany).toHaveBeenCalledWith({
      data: [5, 12, 18, 28].map((rate, index) => ({
        organization_id: organization.id,
        name: `${rate}%`,
        gst: rate,
        cgst_rate: rate / 2,
        sgst_rate: rate / 2,
        igst_rate: rate,
        is_active: true,
        sort_order: index,
      })),
      skipDuplicates: true,
    });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 10000, timeout: 30000 });
  });

  it("rejects an invalid organization email before writing", async () => {
    await expect(createOrganization({
      workspaceUserId: "workspace-user-id",
      organizationName: "Northwind Apparel",
      organizationEmail: "not-an-email",
      gstNumber: "22AAAAA0000A1Z5",
    })).rejects.toThrow("Organization email must be a valid email address of 320 characters or fewer.");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("organization directory identifiers", () => {
  it("returns fixed-width numeric IDs that can be serialized to the directory client", async () => {
    prismaMock.organization.findMany.mockResolvedValue([{
      id: "org-internal-id",
      organization_number: "0000000123",
      organization_id: "org-public-id",
      organization_name: "Northwind Apparel",
      gst_number: "22AAAAA0000A1Z5",
      approval_status: "APPROVED",
      is_active: true,
      memberships: [{ role: "OWNER" }],
      roleDefinitions: [{ role_key: "OWNER", label: "Owner" }],
      rolePermissions: [],
    }]);
    prismaMock.organization.groupBy.mockResolvedValue([{
      is_active: true,
      approval_status: "APPROVED",
      _count: { _all: 1 },
    }]);

    const page = await listWorkspaceOrganizationPage("workspace-user-id");

    expect(page.organizations[0].organization_number).toBe("0000000123");
    expect(() => JSON.stringify(page)).not.toThrow();
  });
});

describe("organization onboarding count", () => {
  it("counts only organizations with an active membership for the authenticated workspace user", async () => {
    prismaMock.organization.count.mockResolvedValue(0);

    await expect(countOrganizationsForUser("workspace-user-id")).resolves.toBe(0);
    expect(prismaMock.organization.count).toHaveBeenCalledWith({
      where: {
        memberships: {
          some: { workspace_user_id: "workspace-user-id", is_active: true },
        },
      },
    });
  });
});

describe("organization archive lifecycle", () => {
  it("requires owner membership and exact organization-name confirmation", async () => {
    transactionMock.organization.findFirst.mockResolvedValue(organization);

    await expect(archiveOrganization("org-internal-id", "owner-id", "Northwind"))
      .rejects.toThrow("Organization name confirmation did not match.");
    expect(transactionMock.organization.updateMany).not.toHaveBeenCalled();
    expect(transactionMock.organization.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        memberships: { some: { workspace_user_id: "owner-id", role: "OWNER", is_active: true } },
      }),
    }));

    transactionMock.organization.findFirst.mockResolvedValue(null);
    await expect(archiveOrganization("org-internal-id", "viewer-id", "Northwind Apparel"))
      .rejects.toThrow("Organization not found or owner access required.");
  });

  it("archives without deleting data and records the acting owner for the audit trigger", async () => {
    transactionMock.organization.findFirst.mockResolvedValue(organization);
    transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });

    await expect(archiveOrganization("org-internal-id", "owner-id", "Northwind Apparel"))
      .resolves.toEqual({ archived: true, organizationId: "org-public-id" });

    expect(transactionMock.$executeRaw).toHaveBeenCalled();
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-internal-id", approval_status: "APPROVED" },
      data: { approval_status: "ARCHIVED", archived_at: expect.any(Date), is_active: false },
    });
  });

  it("restores to inactive pending approval, never directly to operational", async () => {
    transactionMock.organization.findFirst.mockResolvedValue({
      id: "org-internal-id",
      organization_id: "org-public-id",
    });
    transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });

    await expect(restoreOrganization("org-internal-id", "owner-id"))
      .resolves.toEqual({ restored: true, organizationId: "org-public-id" });

    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-internal-id", approval_status: "ARCHIVED" },
      data: { approval_status: "PENDING_APPROVAL", archived_at: null, is_active: false },
    });
  });

  it("makes deletion available exactly 90 days after archival", () => {
    const archivedAt = new Date("2026-01-01T12:00:00.000Z");
    const eligibleAt = new Date("2026-04-01T12:00:00.000Z");

    expect(getOrganizationDeletionEligibility(archivedAt, new Date(eligibleAt.getTime() - 1)).isEligible).toBe(false);
    expect(getOrganizationDeletionEligibility(archivedAt, eligibleAt)).toEqual({ eligibleAt, isEligible: true });
    expect(getOrganizationDeletionEligibility(null, eligibleAt)).toEqual({ eligibleAt: null, isEligible: false });
  });

  it("blocks platform deletion unless the organization is archived for 90 days", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "ARCHIVED",
      archived_at: new Date(Date.now() - 89 * 24 * 60 * 60 * 1000),
    });

    await expect(deleteOrganizationFromPlatform("org-internal-id"))
      .rejects.toThrow("Organizations can only be deleted 90 days after archiving.");
    expect(requirePlatformSessionAdmin).toHaveBeenCalled();
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("blocks platform deletion for an organization that is not archived", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "APPROVED",
      archived_at: null,
    });

    await expect(deleteOrganizationFromPlatform("org-internal-id"))
      .rejects.toThrow("Only archived organizations can be deleted.");
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("deletes an organization once its archived retention period has elapsed", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "ARCHIVED",
      archived_at: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    });

    await deleteOrganizationFromPlatform("org-internal-id");

    expect(transactionMock.organization.delete).toHaveBeenCalledWith({ where: { id: "org-internal-id" } });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: expect.any(String),
    });
  });

  it("force deletes an organization without archive or retention eligibility and records the platform admin", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      organization_name: "Northwind Apparel",
      approval_status: "APPROVED",
      archived_at: null,
    });

    await forceDeleteOrganizationFromPlatform("org-internal-id", "Northwind Apparel");

    expect(requirePlatformSessionAdmin).toHaveBeenCalled();
    expect(transactionMock.platformAuditEvent.create).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "platform-admin-id",
        action: "ORGANIZATION_FORCE_DELETED",
        entity_type: "Organization",
        entity_id: "org-internal-id",
        details: {
          organizationName: "Northwind Apparel",
          approvalStatus: "APPROVED",
          archivedAt: null,
          bypassedRetention: true,
        },
      },
    });
    expect(transactionMock.organization.delete).toHaveBeenCalledWith({ where: { id: "org-internal-id" } });
    expect(prismaMock.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: expect.any(String),
    });
  });

  it("requires an exact organization name before force deletion", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      organization_name: "Northwind Apparel",
      approval_status: "APPROVED",
      archived_at: null,
    });

    await expect(forceDeleteOrganizationFromPlatform("org-internal-id", "Northwind"))
      .rejects.toThrow("Organization name confirmation did not match.");

    expect(transactionMock.platformAuditEvent.create).not.toHaveBeenCalled();
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("does not audit or delete when force-delete cannot find the organization", async () => {
    transactionMock.organization.findUnique.mockResolvedValue(null);

    await expect(forceDeleteOrganizationFromPlatform("missing-organization", "Northwind Apparel"))
      .rejects.toThrow("Organization not found.");

    expect(transactionMock.platformAuditEvent.create).not.toHaveBeenCalled();
    expect(transactionMock.organization.delete).not.toHaveBeenCalled();
  });

  it("does not let approval changes reactivate an archived organization", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 0 });
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "ARCHIVED",
      platform_version_id: null,
      platformVersion: null,
    });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .rejects.toThrow("Restore the organization from its workspace before changing its approval status.");
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-internal-id",
        approval_status: { not: "ARCHIVED" },
        OR: [
          { platform_version_id: null },
          { platformVersion: { is: { is_active: true } } },
        ],
      },
      data: { approval_status: "APPROVED", is_active: true },
    });
  });

  it("allows approval when a platform version is assigned", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });
    transactionMock.organization.findUnique
      .mockResolvedValueOnce({
        approval_status: "APPROVED",
        trial_started_at: null,
        trial_enabled: true,
        trial_extension_hours: 0,
      })
      .mockResolvedValueOnce({
      ...organization,
      platform_version_id: "version-id",
      platformVersion: { is_active: true },
      });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .resolves.toEqual({ ...organization, platform_version_id: "version-id", platformVersion: { is_active: true } });
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-internal-id",
        approval_status: { not: "ARCHIVED" },
        OR: [
          { platform_version_id: null },
          { platformVersion: { is: { is_active: true } } },
        ],
      },
      data: { approval_status: "APPROVED", is_active: true },
    });
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-internal-id", approval_status: "APPROVED", trial_started_at: null, trial_enabled: true },
      data: {
        trial_started_at: expect.any(Date),
        trial_ends_at: expect.any(Date),
      },
    });
    expect(transactionMock.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ platform_admin_id: "platform-admin-id", action: "ORGANIZATION_TRIAL_STARTED" }),
    }));
  });

  it("allows approval when no platform version is assigned", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 1 });
    transactionMock.organization.findUnique
      .mockResolvedValueOnce({
        approval_status: "APPROVED",
        trial_started_at: null,
        trial_enabled: true,
        trial_extension_hours: 0,
      })
      .mockResolvedValueOnce({
        ...organization,
        platform_version_id: null,
        platformVersion: null,
      });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .resolves.toEqual({ ...organization, platform_version_id: null, platformVersion: null });
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-internal-id",
        approval_status: { not: "ARCHIVED" },
        OR: [
          { platform_version_id: null },
          { platformVersion: { is: { is_active: true } } },
        ],
      },
      data: { approval_status: "APPROVED", is_active: true },
    });
    expect(transactionMock.platformAuditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ platform_admin_id: "platform-admin-id", action: "ORGANIZATION_TRIAL_STARTED" }),
    }));
  });

  it("rejects approval when the assigned platform version is inactive", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 0 });
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "PENDING_APPROVAL",
      platform_version_id: "version-id",
      platformVersion: { is_active: false },
    });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .rejects.toThrow("Assign an active platform version before approving this organization.");
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: "org-internal-id",
        approval_status: { not: "ARCHIVED" },
        OR: [
          { platform_version_id: null },
          { platformVersion: { is: { is_active: true } } },
        ],
      },
      data: { approval_status: "APPROVED", is_active: true },
    });
  });
});
