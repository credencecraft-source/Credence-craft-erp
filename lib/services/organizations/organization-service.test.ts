import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock } = vi.hoisted(() => {
  const transactionMock = {
    $executeRaw: vi.fn(),
    organization: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prismaMock = {
    $transaction: vi.fn(),
    organization: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  return { prismaMock, transactionMock };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));

import {
  archiveOrganization,
  restoreOrganization,
  updateOrganizationApprovalStatus,
} from "./organization-service";

const organization = {
  id: "org-internal-id",
  organization_id: "org-public-id",
  organization_name: "Northwind Apparel",
  approval_status: "APPROVED",
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  transactionMock.$executeRaw.mockResolvedValue(1);
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
      data: { approval_status: "ARCHIVED", is_active: false },
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
      data: { approval_status: "PENDING_APPROVAL", is_active: false },
    });
  });

  it("does not let approval changes reactivate an archived organization", async () => {
    transactionMock.organization.updateMany.mockResolvedValue({ count: 0 });
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "org-internal-id",
      approval_status: "ARCHIVED",
    });

    await expect(updateOrganizationApprovalStatus("org-internal-id", "APPROVED"))
      .rejects.toThrow("Restore the organization from its workspace before changing its approval status.");
    expect(transactionMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-internal-id", approval_status: { not: "ARCHIVED" } },
      data: { approval_status: "APPROVED", is_active: true },
    });
  });
});
