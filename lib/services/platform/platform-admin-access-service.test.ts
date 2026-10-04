import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformSessionAdminMock,
  prismaMock,
  transactionMock,
  findPlatformAdminMock,
  createPlatformAdminMock,
  updatePlatformAdminMock,
  findTeamMembersMock,
  updateManyPlatformAdminsMock,
  createAuditEventMock,
  createManyAuditEventsMock,
} = vi.hoisted(() => {
  const findPlatformAdmin = vi.fn();
  const createPlatformAdmin = vi.fn();
  const updatePlatformAdmin = vi.fn();
  const findTeamMembers = vi.fn();
  const updateManyPlatformAdmins = vi.fn();
  const createAuditEvent = vi.fn();
  const createManyAuditEvents = vi.fn();
  type TransactionMock = {
    platformAdmin: {
      findUnique: typeof findPlatformAdmin;
      create: typeof createPlatformAdmin;
      update: typeof updatePlatformAdmin;
      findMany: typeof findTeamMembers;
      updateMany: typeof updateManyPlatformAdmins;
    };
    platformAuditEvent: {
      create: typeof createAuditEvent;
      createMany: typeof createManyAuditEvents;
    };
  };
  const transaction: TransactionMock = {
    platformAdmin: {
      findUnique: findPlatformAdmin,
      create: createPlatformAdmin,
      update: updatePlatformAdmin,
      findMany: findTeamMembers,
      updateMany: updateManyPlatformAdmins,
    },
    platformAuditEvent: {
      create: createAuditEvent,
      createMany: createManyAuditEvents,
    },
  };
  const prisma = {
    platformAdmin: {
      findUnique: findPlatformAdmin,
      findMany: vi.fn(),
    },
    $transaction: vi.fn((callback: (transaction: TransactionMock) => unknown) =>
      callback(transaction),
    ),
  };
  return {
    requirePlatformSessionAdminMock: vi.fn(),
    prismaMock: prisma,
    transactionMock: transaction,
    findPlatformAdminMock: findPlatformAdmin,
    createPlatformAdminMock: createPlatformAdmin,
    updatePlatformAdminMock: updatePlatformAdmin,
    findTeamMembersMock: findTeamMembers,
    updateManyPlatformAdminsMock: updateManyPlatformAdmins,
    createAuditEventMock: createAuditEvent,
    createManyAuditEventsMock: createManyAuditEvents,
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: prismaMock,
}));

import {
  createPlatformAccessAccount,
  setPlatformAccessAccountActive,
} from "@/lib/services/platform/platform-admin-access-service";

describe("platform account management permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      (callback: (transaction: typeof transactionMock) => unknown) => callback(transactionMock),
    );
    findPlatformAdminMock.mockResolvedValue(null);
    createPlatformAdminMock.mockResolvedValue({
      id: "team-seat",
      role: "ADMIN",
      team_role: "CMO",
    });
    updatePlatformAdminMock.mockResolvedValue({ id: "team-seat" });
    findTeamMembersMock.mockResolvedValue([]);
    updateManyPlatformAdminsMock.mockResolvedValue({ count: 0 });
    createAuditEventMock.mockResolvedValue({});
    createManyAuditEventsMock.mockResolvedValue({ count: 0 });
  });

  it("prevents an Admin from creating another Admin account", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      team_role: null,
    });

    await expect(
      createPlatformAccessAccount({
        fullName: "Second Admin",
        email: "second-admin@example.com",
        mobileNumber: "+919876543210",
        kind: "ADMIN",
      }),
    ).rejects.toThrow("Only a Super Admin can add a Platform Admin.");
  });

  it("prevents a CMO/CTO team member from managing platform accounts", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "team-member-1",
      role: "ADMIN",
      team_role: "CMO",
    });

    await expect(
      createPlatformAccessAccount({
        fullName: "Another Team Member",
        email: "another@example.com",
        mobileNumber: "+919876543210",
        kind: "CTO",
      }),
    ).rejects.toThrow("CMO and CTO team accounts cannot manage platform accounts.");
  });

  it("validates mobile numbers before creating access", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      team_role: null,
    });

    await expect(
      createPlatformAccessAccount({
        fullName: "Support Contact",
        email: "support@example.com",
        mobileNumber: "not-a-number",
        kind: "CTO",
      }),
    ).rejects.toThrow("Enter a valid mobile number with country code");
  });

  it("creates a CMO team seat under its managing Admin and audits it atomically", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      team_role: null,
    });
    findPlatformAdminMock
      .mockResolvedValueOnce({ is_active: true })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await createPlatformAccessAccount({
      fullName: "Sales Lead",
      email: "sales@example.com",
      mobileNumber: "+919876543210",
      kind: "CMO",
    });

    expect(createPlatformAdminMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          full_name: "Sales Lead",
          email: "sales@example.com",
          mobile_number: "+919876543210",
          role: "ADMIN",
          team_role: "CMO",
          manager_id: "admin-1",
          password_hash: expect.any(String),
        }),
      }),
    );
    expect(createAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          platform_admin_id: "admin-1",
          action: "PLATFORM_ACCOUNT_CREATED",
          entity_id: "team-seat",
        }),
      }),
    );
  });

  it("deactivates active team seats with their Admin and records audit events", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "super-admin",
      role: "SUPER_ADMIN",
      team_role: null,
    });
    findPlatformAdminMock.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      team_role: null,
      manager_id: null,
      is_active: true,
    });
    findTeamMembersMock.mockResolvedValue([
      { id: "cmo-1", team_role: "CMO" },
      { id: "cto-1", team_role: "CTO" },
    ]);

    await setPlatformAccessAccountActive("admin-1", false);

    expect(updateManyPlatformAdminsMock).toHaveBeenCalledWith({
      where: { id: { in: ["cmo-1", "cto-1"] } },
      data: { is_active: false },
    });
    expect(createManyAuditEventsMock).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          platform_admin_id: "super-admin",
          entity_id: "cmo-1",
          action: "PLATFORM_ACCOUNT_DEACTIVATED",
        }),
        expect.objectContaining({
          platform_admin_id: "super-admin",
          entity_id: "cto-1",
          action: "PLATFORM_ACCOUNT_DEACTIVATED",
        }),
      ]),
    });
  });

  it("prevents an Admin from deactivating another Admin account", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      team_role: null,
    });
    findPlatformAdminMock.mockResolvedValue({
      id: "other-admin",
      role: "ADMIN",
      team_role: null,
      manager_id: null,
      is_active: true,
    });

    await expect(setPlatformAccessAccountActive("other-admin", false))
      .rejects.toThrow("You can only manage your own CMO and CTO team seats.");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does not reactivate a team seat while its managing Admin is inactive", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "super-admin",
      role: "SUPER_ADMIN",
      team_role: null,
    });
    findPlatformAdminMock
      .mockResolvedValueOnce({
        id: "cmo-1",
        role: "ADMIN",
        team_role: "CMO",
        manager_id: "inactive-admin",
        is_active: false,
      })
      .mockResolvedValueOnce({ is_active: false });

    await expect(setPlatformAccessAccountActive("cmo-1", true))
      .rejects.toThrow("Activate the managing Admin account before reactivating this team seat.");

    expect(updatePlatformAdminMock).not.toHaveBeenCalled();
  });
});
