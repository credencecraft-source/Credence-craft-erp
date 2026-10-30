import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOrganizationAccessMock, transactionMock, prismaMock } = vi.hoisted(() => {
  const transactionMock = {
    organization: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };
  return {
    requireOrganizationAccessMock: vi.fn(),
    transactionMock,
    prismaMock: {
      $transaction: vi.fn((callback: (transaction: typeof transactionMock) => unknown) => callback(transactionMock)),
    },
  };
});

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationAccess: requireOrganizationAccessMock,
}));
vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));

import { setOrganizationAiEnabledByAdmin } from "./organization-ai-access-service";

describe("setOrganizationAiEnabledByAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrganizationAccessMock.mockResolvedValue({
      organization_id: "org-internal-1",
      role: "OWNER",
    });
    transactionMock.organization.findFirst.mockResolvedValue({ id: "org-internal-1", ai_enabled: false });
    transactionMock.organization.update.mockResolvedValue({ id: "org-internal-1", ai_enabled: true });
    transactionMock.auditEvent.create.mockResolvedValue({});
  });

  it("requires an organization owner or admin before the transaction", async () => {
    requireOrganizationAccessMock.mockRejectedValue(new Error("Access denied: Insufficient permissions."));

    await expect(setOrganizationAiEnabledByAdmin("user-1", "org-public-1", true))
      .rejects.toThrow("Insufficient permissions");

    expect(requireOrganizationAccessMock).toHaveBeenCalledWith("user-1", "org-public-1", ["OWNER", "ADMIN"]);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("updates and audits the tenant-scoped setting atomically", async () => {
    await expect(setOrganizationAiEnabledByAdmin("user-1", "org-public-1", true)).resolves.toEqual({
      id: "org-internal-1",
      ai_enabled: true,
    });

    expect(transactionMock.organization.findFirst).toHaveBeenCalledWith({
      where: { id: "org-internal-1", organization_id: "org-public-1" },
      select: { id: true, ai_enabled: true },
    });
    expect(transactionMock.organization.update).toHaveBeenCalledWith({
      where: { id: "org-internal-1" },
      data: { ai_enabled: true },
      select: { id: true, ai_enabled: true },
    });
    expect(transactionMock.auditEvent.create).toHaveBeenCalledWith({
      data: {
        organization_id: "org-internal-1",
        module: "ai",
        action: "AI_COPILOT_ACCESS_UPDATED",
        entity_type: "Organization",
        entity_id: "org-internal-1",
        details: {
          actorUserId: "user-1",
          actorRole: "OWNER",
          previousEnabled: false,
          enabled: true,
        },
      },
    });
  });

  it("allows an organization administrator and records their role", async () => {
    requireOrganizationAccessMock.mockResolvedValue({
      organization_id: "org-internal-1",
      role: "ADMIN",
    });

    await setOrganizationAiEnabledByAdmin("admin-user-1", "org-public-1", true);

    expect(transactionMock.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        details: {
          actorUserId: "admin-user-1",
          actorRole: "ADMIN",
          previousEnabled: false,
          enabled: true,
        },
      }),
    }));
  });

  it("does not write or audit when the setting is unchanged", async () => {
    transactionMock.organization.findFirst.mockResolvedValue({ id: "org-internal-1", ai_enabled: true });

    await expect(setOrganizationAiEnabledByAdmin("user-1", "org-public-1", true)).resolves.toEqual({
      id: "org-internal-1",
      ai_enabled: true,
    });

    expect(transactionMock.organization.update).not.toHaveBeenCalled();
    expect(transactionMock.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects invalid input before authorization or database access", async () => {
    await expect(setOrganizationAiEnabledByAdmin("", "org-public-1", true)).rejects.toThrow("valid organization");

    expect(requireOrganizationAccessMock).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
