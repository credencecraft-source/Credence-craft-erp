import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requirePlatformNavigationPermissionMock,
  findPlatformAdminMock,
  createPlatformAdminMock,
  findPlatformAdminsMock,
  createAuditEventMock,
  prismaMock,
} = vi.hoisted(() => {
  const findPlatformAdmin = vi.fn();
  const createPlatformAdmin = vi.fn();
  const updatePlatformAdmin = vi.fn();
  const findPlatformAdmins = vi.fn();
  const createAuditEvent = vi.fn();
  const transaction = {
    platformAdmin: {
      findUnique: findPlatformAdmin,
      findMany: findPlatformAdmins,
      create: createPlatformAdmin,
      update: updatePlatformAdmin,
    },
    platformAuditEvent: { create: createAuditEvent },
  };

  return {
    requirePlatformNavigationPermissionMock: vi.fn(),
    findPlatformAdminMock: findPlatformAdmin,
    createPlatformAdminMock: createPlatformAdmin,
    findPlatformAdminsMock: findPlatformAdmins,
    createAuditEventMock: createAuditEvent,
    prismaMock: {
      platformAdmin: {
        findUnique: findPlatformAdmin,
        findMany: findPlatformAdmins,
        create: createPlatformAdmin,
        update: updatePlatformAdmin,
      },
      platformAuditEvent: { create: createAuditEvent },
      $transaction: vi.fn((operation: unknown) =>
        (operation as (tx: typeof transaction) => unknown)(transaction),
      ),
    },
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformNavigationPermission: requirePlatformNavigationPermissionMock,
}));

vi.mock("@/lib/auth/platform-password-hasher", () => ({
  hashPlatformPassword: vi.fn(() => "hashed-password"),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: prismaMock,
}));

import {
  createPlatformSalesManager,
  listPlatformSalesManagers,
} from "./platform-sales-manager-service";

describe("platform sales manager service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformNavigationPermissionMock.mockResolvedValue({
      id: "cmo-1",
      actualRole: "ADMIN",
      team_role: "CMO",
    });
  });

  it("creates an audited Sales Manager account under the managing CMO", async () => {
    const createdAt = new Date("2026-10-20T12:00:00Z");
    findPlatformAdminMock.mockResolvedValue(null);
    createPlatformAdminMock.mockResolvedValue({
      id: "sales-manager-1",
      full_name: "SAM SALES",
      email: "sam@example.com",
      mobile_number: "+919876543210",
      is_active: true,
      team_role: "SALES_MANAGER",
      manager_id: "cmo-1",
      created_at: createdAt,
      last_login_at: null,
    });
    createAuditEventMock.mockResolvedValue({ id: "audit-1" });

    await expect(createPlatformSalesManager({
      fullName: " Sam Sales ",
      email: " SAM@Example.com ",
      mobileNumber: "+919876543210",
    })).resolves.toMatchObject({
      id: "sales-manager-1",
      full_name: "SAM SALES",
      email: "sam@example.com",
      is_active: true,
      created_at: createdAt,
    });

    expect(createPlatformAdminMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        full_name: "SAM SALES",
        email: "sam@example.com",
        role: "ADMIN",
        team_role: "SALES_MANAGER",
        manager_id: "cmo-1",
        password_hash: "hashed-password",
      }),
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        platform_admin_id: "cmo-1",
        action: "PLATFORM_SALES_MANAGER_CREATED",
        entity_id: "sales-manager-1",
      }),
    }));
  });

  it("lists only Sales Managers belonging to the authenticated CMO", async () => {
    findPlatformAdminsMock.mockResolvedValue([]);

    await expect(listPlatformSalesManagers()).resolves.toEqual([]);

    expect(findPlatformAdminsMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        role: "ADMIN",
        team_role: "SALES_MANAGER",
        manager_id: "cmo-1",
      },
    }));
  });
});
