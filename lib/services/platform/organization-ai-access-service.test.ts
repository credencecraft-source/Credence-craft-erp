import { beforeEach, describe, expect, it, vi } from "vitest";

const { requirePlatformSessionSuperAdminMock, transactionMock, prismaMock } = vi.hoisted(() => {
  const transactionMock = {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };
  return {
    requirePlatformSessionSuperAdminMock: vi.fn(),
    transactionMock,
    prismaMock: {
      $transaction: vi.fn((callback: (transaction: typeof transactionMock) => unknown) => callback(transactionMock)),
    },
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionSuperAdmin: requirePlatformSessionSuperAdminMock,
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));

import { setOrganizationAiEnabled } from "./organization-ai-access-service";

describe("setOrganizationAiEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSessionSuperAdminMock.mockResolvedValue({ id: "platform-admin-1" });
    transactionMock.organization.findUnique.mockResolvedValue({ id: "org-internal-1", ai_enabled: false });
    transactionMock.organization.update.mockResolvedValue({ id: "org-internal-1", ai_enabled: true });
    transactionMock.auditEvent.create.mockResolvedValue({});
  });

  it("requires Super Admin before opening a transaction", async () => {
    requirePlatformSessionSuperAdminMock.mockRejectedValue(new Error("This action requires Super Admin access."));

    await expect(setOrganizationAiEnabled("org-internal-1", true)).rejects.toThrow("Super Admin");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("updates the organization flag and audits the change atomically", async () => {
    await expect(setOrganizationAiEnabled("org-internal-1", true)).resolves.toEqual({
      id: "org-internal-1",
      ai_enabled: true,
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
          platformAdminId: "platform-admin-1",
          previousEnabled: false,
          enabled: true,
        },
      },
    });
  });

  it("does not create an audit event when the value is unchanged", async () => {
    transactionMock.organization.findUnique.mockResolvedValue({ id: "org-internal-1", ai_enabled: true });

    await expect(setOrganizationAiEnabled("org-internal-1", true)).resolves.toEqual({
      id: "org-internal-1",
      ai_enabled: true,
    });

    expect(transactionMock.organization.update).not.toHaveBeenCalled();
    expect(transactionMock.auditEvent.create).not.toHaveBeenCalled();
  });
});
