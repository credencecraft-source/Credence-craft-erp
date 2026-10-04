import { Prisma } from "@prisma/client";

import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import {
  isValidEmail,
  isValidFullName,
  isValidProfileName,
  normalizeEmail,
  normalizeFullName,
  normalizeProfileName,
} from "@/lib/auth/validation-rules";
import { organizationUsageCountSelect } from "@/lib/services/organizations/organization-usage-statistics-service";

export class WorkspaceUserServiceError extends Error {}

const workspaceUserReportSelect = {
  id: true,
  workspace_id: true,
  profile_name: true,
  full_name: true,
  email: true,
  email_verified: true,
  mobile_number: true,
  mobile_verified_at: true,
  created_at: true,
  last_login_at: true,
  organizationMemberships: {
    select: {
      is_active: true,
      organization: {
        select: {
          id: true,
          organization_name: true,
          is_active: true,
        },
      },
    },
  },
} satisfies Prisma.WorkspaceUserSelect;

type WorkspaceUserReportRecord = Prisma.WorkspaceUserGetPayload<{
  select: typeof workspaceUserReportSelect;
}>;

async function getOrganizationRecordTotals(organizationIds: string[]) {
  const organizationsWithCounts = organizationIds.length
    ? await prisma.organization.findMany({
        where: { id: { in: organizationIds }, is_active: true },
        select: {
          id: true,
          _count: { select: organizationUsageCountSelect },
        },
      })
    : [];
  const totalRecordsByOrganizationId = new Map(
    organizationsWithCounts.map((organization) => [
      organization.id,
      Object.values(organization._count).reduce(
        (total, count) => total + count,
        0,
      ),
    ]),
  );
  return totalRecordsByOrganizationId;
}

function addWorkspaceUsage(
  user: WorkspaceUserReportRecord,
  totalRecordsByOrganizationId: Map<string, number>,
) {
  const { organizationMemberships, ...account } = user;
  const organisations = organizationMemberships
    .filter(({ is_active, organization }) => is_active && organization.is_active)
    .map(({ organization }) => organization);
  return {
    ...account,
    organisations,
    canDelete: organizationMemberships.length === 0,
    totalRecords: organisations.reduce(
      (total, organization) =>
        total + (totalRecordsByOrganizationId.get(organization.id) ?? 0),
      0,
    ),
    status: organisations.length > 0 ? "Active" : "No organisation",
  };
}

export async function listWorkspaceUsers() {
  await requirePlatformSessionAdmin();

  const users = await prisma.workspaceUser.findMany({
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: workspaceUserReportSelect,
  });
  const organizationIds = [
    ...new Set(
      users.flatMap((user) =>
        user.organizationMemberships
          .filter(({ is_active }) => is_active)
          .map(({ organization }) => organization.id),
      ),
    ),
  ];
  const totalRecordsByOrganizationId =
    await getOrganizationRecordTotals(organizationIds);
  return users.map((user) =>
    addWorkspaceUsage(user, totalRecordsByOrganizationId),
  );
}

export async function getWorkspaceUser(userId: string) {
  await requirePlatformSessionAdmin();
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new WorkspaceUserServiceError("Workspace user ID is required.");
  }

  const user = await prisma.workspaceUser.findUnique({
    where: { id: normalizedUserId },
    select: workspaceUserReportSelect,
  });
  if (!user) return null;
  const organizationIds = user.organizationMemberships
    .filter(({ is_active }) => is_active)
    .map(({ organization }) => organization.id);
  const totalRecordsByOrganizationId =
    await getOrganizationRecordTotals(organizationIds);
  return addWorkspaceUsage(user, totalRecordsByOrganizationId);
}

export async function deleteWorkspaceUser(userId: string) {
  const admin = await requirePlatformSessionAdmin();
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId) {
    throw new WorkspaceUserServiceError("Workspace user ID is required.");
  }

  await prisma.$transaction(async (transaction) => {
    const user = await transaction.workspaceUser.findUnique({
      where: { id: normalizedUserId },
      select: {
        id: true,
        full_name: true,
        email: true,
        profile_name: true,
        organizationMemberships: {
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!user) throw new WorkspaceUserServiceError("Workspace user not found.");
    if (user.organizationMemberships.length > 0) {
      throw new WorkspaceUserServiceError(
        "Workspace users can only be deleted when they have no organisation memberships.",
      );
    }

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: admin.id,
        action: "WORKSPACE_USER_DELETED",
        entity_type: "WorkspaceUser",
        entity_id: user.id,
        details: {
          fullName: user.full_name,
          email: user.email,
          profileName: user.profile_name,
        },
      },
    });

    const deleted = await transaction.workspaceUser.deleteMany({
      where: {
        id: user.id,
        organizationMemberships: { none: {} },
      },
    });
    if (deleted.count !== 1) {
      throw new WorkspaceUserServiceError(
        "Workspace user membership changed during deletion. Refresh and try again.",
      );
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type UpdateWorkspaceUserInput = {
  userId: string;
  fullName: string;
  profileName: string;
  email: string;
  mobileNumber: string;
  resetEmailVerification: boolean;
  resetMobileVerification: boolean;
};

export async function updateWorkspaceUser(input: UpdateWorkspaceUserInput) {
  const admin = await requirePlatformSessionAdmin();
  if (
    !input ||
    typeof input.userId !== "string" ||
    typeof input.fullName !== "string" ||
    typeof input.profileName !== "string" ||
    typeof input.email !== "string" ||
    typeof input.mobileNumber !== "string" ||
    typeof input.resetEmailVerification !== "boolean" ||
    typeof input.resetMobileVerification !== "boolean"
  ) {
    throw new WorkspaceUserServiceError("Workspace user details are invalid.");
  }

  const userId = input.userId.trim();
  const fullName = normalizeFullName(input.fullName);
  const profileName = normalizeProfileName(input.profileName);
  const email = normalizeEmail(input.email) || null;
  const enteredMobileNumber = input.mobileNumber.trim();
  const mobileNumber = enteredMobileNumber
    ? enteredMobileNumber.replace(/[\s()-]/g, "")
    : null;
  if (!userId) {
    throw new WorkspaceUserServiceError("Workspace user ID is required.");
  }
  if (!isValidFullName(fullName)) {
    throw new WorkspaceUserServiceError("Enter a valid full name.");
  }
  if (!isValidProfileName(profileName)) {
    throw new WorkspaceUserServiceError(
      "Enter a valid profile name (2-100 characters).",
    );
  }
  if (email && !isValidEmail(email)) {
    throw new WorkspaceUserServiceError("Enter a valid email address or leave it blank.");
  }
  if (mobileNumber && !/^\+?[1-9]\d{7,14}$/.test(mobileNumber)) {
    throw new WorkspaceUserServiceError(
      "Enter a mobile number with country code or leave it blank.",
    );
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const user = await transaction.workspaceUser.findUnique({
        where: { id: userId },
        select: {
          id: true,
          full_name: true,
          profile_name: true,
          email: true,
          email_verified: true,
          mobile_number: true,
          mobile_verified_at: true,
        },
      });
      if (!user) throw new WorkspaceUserServiceError("Workspace user not found.");

      const normalizedMobileNumber = mobileNumber?.replace(/^\+/, "") ?? null;
      const emailChanged = email !== user.email;
      const profileNameChanged = profileName !== user.profile_name;
      const mobileChanged = normalizedMobileNumber !== user.mobile_number;
      const emailVerificationReset =
        input.resetEmailVerification || emailChanged || !email;
      const mobileVerificationReset =
        input.resetMobileVerification || mobileChanged || !normalizedMobileNumber;
      const changedFields: string[] = [];

      if (fullName !== user.full_name) changedFields.push("fullName");
      if (profileNameChanged) changedFields.push("profileName");
      if (emailChanged) changedFields.push("email");
      if (mobileChanged) changedFields.push("mobileNumber");
      if (emailVerificationReset && user.email_verified) {
        changedFields.push("emailVerification");
      }
      if (mobileVerificationReset && user.mobile_verified_at) {
        changedFields.push("mobileVerification");
      }
      if (changedFields.length === 0) {
        throw new WorkspaceUserServiceError(
          "No workspace user changes to save.",
        );
      }

      const [profileNameOwner, emailOwner, mobileOwner] = await Promise.all([
        profileNameChanged
          ? transaction.workspaceUser.findFirst({
              where: { profile_name: profileName, id: { not: user.id } },
              select: { id: true },
            })
          : null,
        email && emailChanged
          ? transaction.workspaceUser.findFirst({
              where: { email, id: { not: user.id } },
              select: { id: true },
            })
          : null,
        normalizedMobileNumber && mobileChanged
          ? transaction.workspaceUser.findFirst({
              where: { mobile_number: normalizedMobileNumber, id: { not: user.id } },
              select: { id: true },
            })
          : null,
      ]);
      if (profileNameOwner) {
        throw new WorkspaceUserServiceError("That profile name is already in use.");
      }
      if (emailOwner) {
        throw new WorkspaceUserServiceError("That email address is already in use.");
      }
      if (mobileOwner) {
        throw new WorkspaceUserServiceError("That mobile number is already in use.");
      }

      await transaction.workspaceUser.update({
        where: { id: user.id },
        data: {
          full_name: fullName,
          profile_name: profileName,
          email,
          email_verified: emailVerificationReset ? false : user.email_verified,
          mobile_number: normalizedMobileNumber,
          mobile_verified_at: mobileVerificationReset
            ? null
            : user.mobile_verified_at,
        },
      });
      await transaction.platformAuditEvent.create({
        data: {
          platform_admin_id: admin.id,
          action: "WORKSPACE_USER_UPDATED",
          entity_type: "WorkspaceUser",
          entity_id: user.id,
          details: {
            changedFields,
            emailVerificationReset,
            mobileVerificationReset,
          },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new WorkspaceUserServiceError(
        "Email, profile name, or mobile number is already in use.",
      );
    }
    throw error;
  }
}