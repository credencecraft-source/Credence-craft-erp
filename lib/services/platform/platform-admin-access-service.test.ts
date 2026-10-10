import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformSessionAdminMock,
  prismaMock,
  transactionMock,
  findPlatformAdminMock,
  createPlatformAdminMock,
  updatePlatformAdminMock,
  deletePlatformAdminMock,
  findTeamMembersMock,
  updateManyPlatformAdminsMock,
  createAuditEventMock,
  createManyAuditEventsMock,
} = vi.hoisted(() => {
  const findPlatformAdmin = vi.fn();
  const createPlatformAdmin = vi.fn();
  const updatePlatformAdmin = vi.fn();
  const deletePlatformAdmin = vi.fn();
  const findTeamMembers = vi.fn();
  const updateManyPlatformAdmins = vi.fn();
  const createAuditEvent = vi.fn();
  const createManyAuditEvents = vi.fn();
  type TransactionMock = {
    platformAdmin: {
      findUnique: typeof findPlatformAdmin;
      create: typeof createPlatformAdmin;
      update: typeof updatePlatformAdmin;
      delete: typeof deletePlatformAdmin;
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
      delete: deletePlatformAdmin,
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
    deletePlatformAdminMock: deletePlatformAdmin,
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
  deletePlatformAccessAccount,
  setPlatformAccessAccountActive,
  updatePlatformAccessAccount,
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
    deletePlatformAdminMock.mockResolvedValue({ id: "team-seat" });
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

  it("allows the Super Admin to update a team account's role and details with an audit trail", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "super-admin",
      role: "SUPER_ADMIN",
      team_role: null,
    });
    findPlatformAdminMock
      .mockResolvedValueOnce({ is_active: true })
      .mockResolvedValueOnce({
        id: "team-seat",
        full_name: "Support",
        email: "support@example.com",
        mobile_number: "+919876543210",
        role: "ADMIN",
        team_role: "CTO",
        manager_id: "admin-1",
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "admin-1", role: "ADMIN", team_role: null, is_active: true })
      .mockResolvedValueOnce(null);
    updatePlatformAdminMock.mockResolvedValue({
      id: "team-seat",
      full_name: "Sales Lead",
      email: "sales@example.com",
      mobile_number: "+919876543210",
      role: "ADMIN",
      team_role: "CMO",
      manager_id: "admin-1",
    });

    await updatePlatformAccessAccount("team-seat", {
      fullName: "Sales Lead",
      email: "sales@example.com",
      mobileNumber: "+919876543210",
      kind: "CMO",
      managerId: "admin-1",
    });

    expect(updatePlatformAdminMock).toHaveBeenCalledWith({
      where: { id: "team-seat" },
      data: {
        full_name: "Sales Lead",
        email: "sales@example.com",
        mobile_number: "+919876543210",
        role: "ADMIN",
        team_role: "CMO",
        manager_id: "admin-1",
      },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "super-admin",
        action: "PLATFORM_ACCOUNT_UPDATED",
        entity_id: "team-seat",
      }),
    }));
  });

  it("prevents changing an Admin into a team seat when that team role is already assigned", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "super-admin",
      role: "SUPER_ADMIN",
      team_role: null,
    });
    findPlatformAdminMock
      .mockResolvedValueOnce({ is_active: true })
      .mockResolvedValueOnce({
        id: "admin-account",
        full_name: "Admin",
        email: "admin@example.com",
        mobile_number: "+919876543210",
        role: "ADMIN",
        team_role: null,
        manager_id: null,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "manager-id", role: "ADMIN", team_role: null, is_active: true })
      .mockResolvedValueOnce({ id: "another-cmo" });

    await expect(updatePlatformAccessAccount("admin-account", {
      fullName: "Admin",
      email: "admin@example.com",
      mobileNumber: "+919876543210",
      kind: "CMO",
      managerId: "manager-id",
    })).rejects.toThrow("This Admin already has a CMO team seat.");

    expect(updatePlatformAdminMock).not.toHaveBeenCalled();
  });

  it("uses the Super Admin as manager when changing an Admin to a team seat without a manager selector", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "super-admin",
      role: "SUPER_ADMIN",
      team_role: null,
    });
    findPlatformAdminMock
      .mockResolvedValueOnce({ is_active: true })
      .mockResolvedValueOnce({
        id: "admin-account",
        full_name: "Admin",
        email: "admin@example.com",
        mobile_number: "+919876543210",
        role: "ADMIN",
        team_role: null,
        manager_id: null,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "super-admin",
        role: "SUPER_ADMIN",
        team_role: null,
        is_active: true,
      })
      .mockResolvedValueOnce(null);

    await updatePlatformAccessAccount("admin-account", {
      fullName: "Admin",
      email: "admin@example.com",
      mobileNumber: "+919876543210",
      kind: "CMO",
    });

    expect(updatePlatformAdminMock).toHaveBeenCalledWith({
      where: { id: "admin-account" },
      data: {
        full_name: "Admin",
        email: "admin@example.com",
        mobile_number: "+919876543210",
        role: "ADMIN",
        team_role: "CMO",
        manager_id: "super-admin",
      },
    });
  });

  it("deletes a team account only after typed confirmation and writes an audit record", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "super-admin",
      role: "SUPER_ADMIN",
      team_role: null,
    });
    findPlatformAdminMock
      .mockResolvedValueOnce({ is_active: true })
      .mockResolvedValueOnce({
        id: "team-seat",
        full_name: "Support",
        email: "support@example.com",
        role: "ADMIN",
        team_role: "CTO",
        manager_id: "admin-1",
      });

    await deletePlatformAccessAccount("team-seat", " SUPPORT@example.com ");

    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "super-admin",
        action: "PLATFORM_ACCOUNT_DELETED",
        entity_id: "team-seat",
      }),
    }));
    expect(deletePlatformAdminMock).toHaveBeenCalledWith({ where: { id: "team-seat" } });
  });

  it("transfers team seats to the Super Admin when deleting their Admin manager", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "super-admin",
      role: "SUPER_ADMIN",
      team_role: null,
    });
    findPlatformAdminMock
      .mockResolvedValueOnce({ is_active: true })
      .mockResolvedValueOnce({
        id: "managed-admin",
        full_name: "Manager",
        email: "manager@example.com",
        role: "ADMIN",
        team_role: null,
        manager_id: null,
      });
    findTeamMembersMock.mockResolvedValue([
      { id: "cmo-1", team_role: "CMO", manager_id: "managed-admin" },
    ]);

    await deletePlatformAccessAccount("managed-admin", "manager@example.com");

    expect(updatePlatformAdminMock).toHaveBeenCalledWith({
      where: { id: "cmo-1" },
      data: { manager_id: "super-admin" },
      select: { team_role: true },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "super-admin",
        entity_id: "cmo-1",
        details: expect.objectContaining({
          before: { managerId: "managed-admin" },
          after: { managerId: "super-admin" },
        }),
      }),
    }));
    expect(deletePlatformAdminMock).toHaveBeenCalledWith({ where: { id: "managed-admin" } });
  });

  it("rejects deletion when typed confirmation does not match the account email", async () => {
    requirePlatformSessionAdminMock.mockResolvedValue({
      id: "super-admin",
      role: "SUPER_ADMIN",
      team_role: null,
    });
    findPlatformAdminMock
      .mockResolvedValueOnce({ is_active: true })
      .mockResolvedValueOnce({
        id: "team-seat",
        full_name: "Support",
        email: "support@example.com",
        role: "ADMIN",
        team_role: "CTO",
        manager_id: "admin-1",
      });

    await expect(deletePlatformAccessAccount("team-seat", "wrong@example.com"))
      .rejects.toThrow("Enter the account email exactly to confirm deletion.");

    expect(deletePlatformAdminMock).not.toHaveBeenCalled();
  });
});
