import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findManyUsersMock,
  findManyOrganizationsMock,
  findUniqueUserMock,
  findFirstUserMock,
  updateUserMock,
  deleteUserMock,
  platformAuditCreateMock,
  transactionMock,
  requireAdminMock,
} = vi.hoisted(() => {
  const findUniqueUser = vi.fn();
  const findFirstUser = vi.fn();
  const updateUser = vi.fn();
  const deleteUser = vi.fn();
  const platformAuditCreate = vi.fn();
  const transaction = {
    workspaceUser: {
      findUnique: findUniqueUser,
      findFirst: findFirstUser,
      update: updateUser,
      deleteMany: deleteUser,
    },
    platformAuditEvent: { create: platformAuditCreate },
  };
  return {
    findManyUsersMock: vi.fn(),
    findManyOrganizationsMock: vi.fn(),
    findUniqueUserMock: findUniqueUser,
    findFirstUserMock: findFirstUser,
    updateUserMock: updateUser,
    deleteUserMock: deleteUser,
    platformAuditCreateMock: platformAuditCreate,
    transactionMock: vi.fn((callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
    requireAdminMock: vi.fn().mockResolvedValue({ id: "platform-admin-1" }),
  };
});

vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requireAdminMock,
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    workspaceUser: {
      findMany: findManyUsersMock,
      findUnique: findUniqueUserMock,
    },
    organization: { findMany: findManyOrganizationsMock },
    $transaction: transactionMock,
  },
}));

vi.mock("@/lib/services/organizations/organization-usage-statistics-service", () => ({
  organizationUsageCountSelect: { widgets: true },
}));

import {
  deleteWorkspaceUser,
  listWorkspaceUsers,
  updateWorkspaceUser,
} from "./workspace-user-service";

describe("platform workspace-user report service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyUsersMock.mockResolvedValue([
      {
        id: "user-1",
        workspace_id: "workspace-1",
        profile_name: "member",
        full_name: "Workspace Member",
        email: null,
        email_verified: false,
        mobile_number: "919876543210",
        mobile_verified_at: new Date("2026-10-01T00:00:00Z"),
        created_at: new Date("2026-09-01T00:00:00Z"),
        last_login_at: null,
        organizationMemberships: [
          {
            is_active: true,
            organization: {
              id: "organization-1",
              organization_name: "Active Organization",
              is_active: true,
            },
          },
          {
            is_active: true,
            organization: {
              id: "organization-2",
              organization_name: "Inactive Organization",
              is_active: false,
            },
          },
          {
            is_active: false,
            organization: {
              id: "organization-3",
              organization_name: "Inactive Membership",
              is_active: true,
            },
          },
        ],
      },
      {
        id: "user-2",
        workspace_id: "workspace-2",
        profile_name: "new-user",
        full_name: "New User",
        email: "new@example.com",
        email_verified: true,
        mobile_number: null,
        mobile_verified_at: null,
        created_at: new Date("2026-09-02T00:00:00Z"),
        last_login_at: new Date("2026-10-02T00:00:00Z"),
        organizationMemberships: [],
      },
    ]);
    findManyOrganizationsMock.mockResolvedValue([
      { id: "organization-1", _count: { widgets: 3 } },
    ]);
    findUniqueUserMock.mockResolvedValue({
      id: "user-1",
      full_name: "Workspace Member",
      profile_name: "member",
      email: "member@example.com",
      email_verified: true,
      mobile_number: "919876543210",
      mobile_verified_at: new Date("2026-10-01T00:00:00Z"),
    });
    findFirstUserMock.mockResolvedValue(null);
    updateUserMock.mockResolvedValue({});
    platformAuditCreateMock.mockResolvedValue({});
  });

  it("returns optional-email users with active organization and usage summaries", async () => {
    const users = await listWorkspaceUsers();

    expect(requireAdminMock).toHaveBeenCalledOnce();
    expect(findManyOrganizationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["organization-1", "organization-2"] }, is_active: true },
      }),
    );
    expect(users).toEqual([
      expect.objectContaining({
        id: "user-1",
        email: null,
        organisations: [
          expect.objectContaining({ id: "organization-1" }),
        ],
        totalRecords: 3,
        status: "Active",
        canDelete: false,
      }),
      expect.objectContaining({
        id: "user-2",
        email: "new@example.com",
        organisations: [],
        totalRecords: 0,
        status: "No organisation",
        canDelete: true,
      }),
    ]);
  });

  it("deletes a workspace user only when there are no organization memberships", async () => {
    deleteUserMock.mockResolvedValue({ count: 1 });
    findUniqueUserMock.mockResolvedValue({
      id: "user-2",
      full_name: "New User",
      email: "new@example.com",
      profile_name: "new-user",
      organizationMemberships: [],
    });

    await deleteWorkspaceUser("user-2");

    expect(requireAdminMock).toHaveBeenCalledOnce();
    expect(deleteUserMock).toHaveBeenCalledWith({
      where: {
        id: "user-2",
        organizationMemberships: { none: {} },
      },
    });
    expect(platformAuditCreateMock).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "platform-admin-1",
        action: "WORKSPACE_USER_DELETED",
        entity_type: "WorkspaceUser",
        entity_id: "user-2",
        details: {
          fullName: "New User",
          email: "new@example.com",
          profileName: "new-user",
        },
      },
    });
  });

  it("blocks deletion when any organization membership exists", async () => {
    findUniqueUserMock.mockResolvedValue({
      id: "user-1",
      full_name: "Workspace Member",
      email: "member@example.com",
      profile_name: "member",
      organizationMemberships: [{ id: "membership-1" }],
    });

    await expect(deleteWorkspaceUser("user-1")).rejects.toThrow(
      "Workspace users can only be deleted when they have no organisation memberships.",
    );

    expect(platformAuditCreateMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("does not delete when the workspace user no longer exists", async () => {
    findUniqueUserMock.mockResolvedValue(null);

    await expect(deleteWorkspaceUser("missing-user")).rejects.toThrow(
      "Workspace user not found.",
    );

    expect(platformAuditCreateMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("updates account fields, resets affected verification, and records a platform audit event", async () => {
    await updateWorkspaceUser({
      userId: "user-1",
      fullName: "Updated Member",
      profileName: "updated-member",
      email: "updated@example.com",
      mobileNumber: "+919123456789",
      resetEmailVerification: false,
      resetMobileVerification: false,
    });

    expect(updateUserMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        full_name: "Updated Member",
        profile_name: "Updated-member",
        email: "updated@example.com",
        email_verified: false,
        mobile_number: "919123456789",
        mobile_verified_at: null,
      },
    });
    expect(platformAuditCreateMock).toHaveBeenCalledWith({
      data: {
        platform_admin_id: "platform-admin-1",
        action: "WORKSPACE_USER_UPDATED",
        entity_type: "WorkspaceUser",
        entity_id: "user-1",
        details: {
          changedFields: [
            "fullName",
            "profileName",
            "email",
            "mobileNumber",
            "emailVerification",
            "mobileVerification",
          ],
          emailVerificationReset: true,
          mobileVerificationReset: true,
        },
      },
    });
  });

  it("does not allow invalid email or mobile values to reach persistence", async () => {
    await expect(
      updateWorkspaceUser({
        userId: "user-1",
        fullName: "Updated Member",
        profileName: "member",
        email: "not-an-email",
        mobileNumber: "123",
        resetEmailVerification: false,
        resetMobileVerification: false,
      }),
    ).rejects.toThrow("Enter a valid email address or leave it blank.");

    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects duplicate email addresses", async () => {
    findFirstUserMock.mockImplementation(async ({ where }: { where: { email?: string } }) =>
      where.email ? { id: "other-user" } : null,
    );

    await expect(
      updateWorkspaceUser({
        userId: "user-1",
        fullName: "Workspace Member",
        profileName: "member",
        email: "taken@example.com",
        mobileNumber: "919876543210",
        resetEmailVerification: false,
        resetMobileVerification: false,
      }),
    ).rejects.toThrow("That email address is already in use.");

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(platformAuditCreateMock).not.toHaveBeenCalled();
  });

  it("allows a verified status to be reset without changing the contact value", async () => {
    await updateWorkspaceUser({
      userId: "user-1",
      fullName: "Workspace Member",
      profileName: "member",
      email: "member@example.com",
      mobileNumber: "919876543210",
      resetEmailVerification: true,
      resetMobileVerification: false,
    });

    expect(updateUserMock).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        email: "member@example.com",
        email_verified: false,
        mobile_number: "919876543210",
        mobile_verified_at: new Date("2026-10-01T00:00:00Z"),
      }),
    });
    expect(platformAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          details: expect.objectContaining({
            changedFields: ["profileName", "emailVerification"],
            emailVerificationReset: true,
            mobileVerificationReset: false,
          }),
        }),
      }),
    );
  });
});
