import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";

import { normalizeOrganizationInput, validateOrganizationInput } from "./organization-validators";

export type OrganizationCreateInput = {
  workspaceUserId: string;
  organizationName: string;
  gstNumber: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
};

export type OrganizationContext = {
  id: string;
  organizationId: string;
  membershipId: string;
  role: OrganizationRole;
};

export const SYSTEM_ORGANIZATION_ROLES = ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING", "APPROVER", "VIEWER"] as const;
export type OrganizationRole = string;
export const ORGANIZATION_PERMISSIONS = ["ORGANIZATION_SETTINGS", "MANAGE_USERS", "MANAGE_ROLES", "VIEW_REPORTS", "MANAGE_MASTER_DATA", "CREATE_ORDERS", "APPROVE_ORDERS", "VIEW_ORDERS"] as const;
export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];
const SYSTEM_ROLE_LABELS: Record<string, string> = { OWNER: "Owner", ADMIN: "Administrator", FINANCE: "Finance", MERCHANDISING: "Merchandising", APPROVER: "Approver", VIEWER: "Viewer" };
const DEFAULT_ROLE_PERMISSIONS: Record<string, OrganizationPermission[]> = {
  OWNER: [...ORGANIZATION_PERMISSIONS],
  ADMIN: ["ORGANIZATION_SETTINGS", "MANAGE_USERS", "VIEW_REPORTS", "MANAGE_MASTER_DATA", "CREATE_ORDERS", "VIEW_ORDERS"],
  FINANCE: ["VIEW_REPORTS", "VIEW_ORDERS"],
  MERCHANDISING: ["CREATE_ORDERS", "VIEW_ORDERS", "MANAGE_MASTER_DATA"],
  APPROVER: ["APPROVE_ORDERS", "VIEW_ORDERS"],
  VIEWER: ["VIEW_ORDERS", "VIEW_REPORTS"],
};

function roleKeyFromLabel(label: string) {
  return label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 90);
}

async function ensureOrganizationRoleDefinitions(organizationId: string) {
  const existing = await prisma.organizationRoleDefinition.findMany({ where: { organization_id: organizationId } });
  const existingKeys = new Set(existing.map((role) => role.role_key));
  const missing = SYSTEM_ORGANIZATION_ROLES.filter((role) => !existingKeys.has(role));
  if (missing.length > 0) {
    await prisma.organizationRoleDefinition.createMany({
      data: missing.map((role) => ({ organization_id: organizationId, role_key: role, label: SYSTEM_ROLE_LABELS[role], is_system: true })),
      skipDuplicates: true,
    });
  }
  return prisma.organizationRoleDefinition.findMany({ where: { organization_id: organizationId }, orderBy: [{ is_system: "desc" }, { label: "asc" }] });
}

export async function listOrganizationRoles(organizationId: string) {
  return ensureOrganizationRoleDefinitions(organizationId);
}

export async function isOrganizationRole(organizationId: string, role: unknown) {
  return typeof role === "string" && Boolean(await prisma.organizationRoleDefinition.findUnique({ where: { organization_id_role_key: { organization_id: organizationId, role_key: role } } }));
}

export async function createOrganizationRole(organizationId: string, workspaceUserId: string, label: string, permissions: string[]) {
  const membership = await requireOrganizationPermission(workspaceUserId, organizationId, "MANAGE_ROLES");
  const cleanLabel = label.trim();
  const roleKey = roleKeyFromLabel(cleanLabel);
  if (cleanLabel.length < 2 || !roleKey || roleKey === "OWNER") throw new Error("Enter a valid role name that is not Owner.");
  const validPermissions = permissions.filter((permission): permission is OrganizationPermission => ORGANIZATION_PERMISSIONS.includes(permission as OrganizationPermission));
  const role = await prisma.$transaction(async (transaction) => {
    const created = await transaction.organizationRoleDefinition.create({ data: { organization_id: membership.organization_id, role_key: roleKey, label: cleanLabel, is_system: false } });
    if (validPermissions.length > 0) {
      await transaction.organizationRolePermission.createMany({ data: validPermissions.map((permission) => ({ id: randomUUID(), organization_id: membership.organization_id, role: roleKey, permission })) });
    }
    return created;
  });
  return { ...role, permissions: validPermissions };
}

function isMissingTableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message || "";
  return message.includes("does not exist") || message.includes("P2021") || message.includes("table") && message.includes("public");
}

export async function listOrganizationsForUser(workspaceUserId: string) {
  try {
    const organizations = await prisma.organization.findMany({
      where: {
        is_active: true,
        memberships: {
          some: {
            workspace_user_id: workspaceUserId,
            is_active: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
      include: {
        memberships: {
          where: { workspace_user_id: workspaceUserId, is_active: true },
          select: { role: true },
          take: 1,
        },
      },
    });

    return organizations.map(({ memberships, ...organization }) => ({
      ...organization,
      membership_role: memberships[0]?.role ?? "VIEWER",
    }));
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function createOrganization(input: OrganizationCreateInput) {
  try {
    const validated = validateOrganizationInput({
      organizationName: input.organizationName,
      gstNumber: input.gstNumber,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      country: input.country,
      pinCode: input.pinCode,
    });

    return await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          organization_id: randomUUID(),
          organization_name: validated.organizationName,
          gst_number: validated.gstNumber,
          address_line_1: validated.addressLine1 || null,
          address_line_2: validated.addressLine2 || null,
          city: validated.city || null,
          state: validated.state || null,
          country: validated.country || null,
          pin_code: validated.pinCode || null,
          is_active: true,
          approval_status: "PENDING_APPROVAL",
          memberships: {
            create: {
              id: randomUUID(),
              workspace_user_id: input.workspaceUserId,
              role: "OWNER",
            },
          },
        },
      });

      await transaction.eRPSoftware.create({
        data: {
          software_id: randomUUID(),
          organization_id: organization.id,
          software_name: "ERP Software",
          status: "active",
        },
      });

      await transaction.organizationRoleDefinition.createMany({
        data: SYSTEM_ORGANIZATION_ROLES.map((role) => ({ organization_id: organization.id, role_key: role, label: SYSTEM_ROLE_LABELS[role], is_system: true })),
      });
      await transaction.organizationRolePermission.createMany({
        data: SYSTEM_ORGANIZATION_ROLES.flatMap((role) => DEFAULT_ROLE_PERMISSIONS[role].map((permission) => ({
          id: randomUUID(), organization_id: organization.id, role, permission,
        }))),
      });

      return organization;
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Organization database table is not available yet. Run the Prisma migration or sync the database schema before creating organizations.");
    }

    throw error;
  }
}

export async function getOrganizationForUser(workspaceUserId: string, organizationId: string) {
  return prisma.organization.findFirst({
    where: {
      organization_id: organizationId,
      memberships: {
        some: {
          workspace_user_id: workspaceUserId,
          is_active: true,
        },
      },
    },
    include: {
      erpSoftware: {
        include: {
          modules: true,
        },
      },
    },
  });
}

export async function getOrganizationByPublicId(organizationId: string) {
  return prisma.organization.findUnique({
    where: { organization_id: organizationId },
    include: {
      erpSoftware: {
        include: {
          modules: true,
        },
      },
    },
  });
}

export async function deleteOrganization(organizationId: string, workspaceUserId: string) {
  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      memberships: {
        some: {
          workspace_user_id: workspaceUserId,
          is_active: true,
        },
      },
    },
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  const membership = await requireOrganizationAccess(workspaceUserId, organizationId, ["OWNER"]);
  const orgToDelete = await prisma.organization.findUnique({
    where: { id: membership.organization_id },
  });

  if (!orgToDelete) {
    throw new Error("Organization not found.");
  }

  await prisma.organization.delete({
    where: { id: orgToDelete.id },
  });

  return { deleted: true, organizationId: organization.organization_id };
}

export async function listOrganizationMembers(organizationId: string, workspaceUserId: string) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);

  return prisma.organizationMembership.findMany({
    where: {
      organization_id: membership.organization_id,
      is_active: true,
    },
    include: {
      workspaceUser: {
        select: {
          id: true,
          profile_name: true,
          full_name: true,
          email: true,
        },
      },
    },
    orderBy: { created_at: "asc" },
  });
}

export async function addOrganizationMember(input: {
  organizationId: string;
  workspaceUserId: string;
  role: string;
  actorUserId: string;
}) {
  const actorMembership = await requireOrganizationAccess(input.actorUserId, input.organizationId, ["OWNER", "ADMIN"]);

  return prisma.organizationMembership.create({
    data: {
      id: randomUUID(),
      organization_id: actorMembership.organization_id,
      workspace_user_id: input.workspaceUserId,
      role: input.role,
      is_active: true,
    },
  });
}

export async function updateOrganizationMember(
  membershipId: string,
  organizationId: string,
  actorUserId: string,
  data: { role?: string; is_active?: boolean }
) {
  const actorMembership = await requireOrganizationAccess(actorUserId, organizationId, ["OWNER", "ADMIN"]);

  return prisma.organizationMembership.update({
    where: { id: membershipId, organization_id: actorMembership.organization_id },
    data: {
      ...data,
      role: data.role,
    },
  });
}

export async function requireOrganizationAccess(
  workspaceUserId: string,
  organizationId: string,
  allowedRoles?: string[]
) {
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      OR: [
        { organization_id: organizationId },
        { organization: { organization_id: organizationId } },
      ],
      workspace_user_id: workspaceUserId,
      is_active: true,
    },
  });

  if (!membership) {
    throw new Error("Access denied: You are not a member of this organization.");
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new Error("Access denied: Insufficient permissions.");
  }

  return membership;
}

export function normalizeOrganizationData(raw: OrganizationCreateInput) {
  return normalizeOrganizationInput(raw);
}

export async function requireOrganizationContext(
  workspaceUserId: string,
  publicOrganizationId: string,
  allowedRoles?: string[],
): Promise<OrganizationContext> {
  const organization = await prisma.organization.findFirst({
    where: {
      organization_id: publicOrganizationId,
      memberships: {
        some: {
          workspace_user_id: workspaceUserId,
          is_active: true,
          ...(allowedRoles ? { role: { in: allowedRoles } } : {}),
        },
      },
    },
    select: {
      id: true,
      organization_id: true,
      memberships: {
        where: { workspace_user_id: workspaceUserId, is_active: true },
        select: { id: true, role: true },
        take: 1,
      },
    },
  });

  const membership = organization?.memberships[0];
  if (!organization || !membership) {
    throw new Error("Access denied: organization not found or membership is inactive.");
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new Error("Access denied: insufficient organization permissions.");
  }

  return {
    id: organization.id,
    organizationId: organization.organization_id,
    membershipId: membership.id,
    role: membership.role,
  };
}

export async function listOrganizationRolePermissions(organizationId: string, workspaceUserId: string) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);
  if (membership.role !== "OWNER") {
    const readableRole = await prisma.organizationRolePermission.findFirst({
      where: { organization_id: membership.organization_id, role: membership.role, permission: { in: ["MANAGE_ROLES", "MANAGE_USERS"] } },
    });
    if (!readableRole && !(DEFAULT_ROLE_PERMISSIONS[membership.role] || []).some((permission) => permission === "MANAGE_ROLES" || permission === "MANAGE_USERS")) {
      throw new Error("Access denied: This role cannot view organization roles.");
    }
  }
  const roles = await ensureOrganizationRoleDefinitions(membership.organization_id);
  const stored = await prisma.organizationRolePermission.findMany({ where: { organization_id: membership.organization_id }, orderBy: [{ role: "asc" }, { permission: "asc" }] });
  return roles.map((role) => ({
    role: role.role_key,
    label: role.label,
    isSystem: role.is_system,
    permissions: stored.some((item) => item.role === role.role_key)
      ? stored.filter((item) => item.role === role.role_key).map((item) => item.permission)
      : DEFAULT_ROLE_PERMISSIONS[role.role_key] || [],
  }));
}

export async function updateOrganizationRolePermissions(organizationId: string, workspaceUserId: string, role: string, permissions: string[]) {
  const membership = await requireOrganizationPermission(workspaceUserId, organizationId, "MANAGE_ROLES");
  const roleDefinition = await prisma.organizationRoleDefinition.findUnique({ where: { organization_id_role_key: { organization_id: membership.organization_id, role_key: role } } });
  if (!roleDefinition) throw new Error("The selected organization role was not found.");
  const validPermissions = permissions.filter((permission): permission is OrganizationPermission => ORGANIZATION_PERMISSIONS.includes(permission as OrganizationPermission));
  if (role === "OWNER") throw new Error("Owner permissions cannot be changed.");
  await prisma.$transaction([
    prisma.organizationRolePermission.deleteMany({ where: { organization_id: membership.organization_id, role } }),
    ...(validPermissions.length > 0 ? [prisma.organizationRolePermission.createMany({ data: validPermissions.map((permission) => ({ id: randomUUID(), organization_id: membership.organization_id, role, permission })) })] : []),
  ]);
  return { role, permissions: validPermissions };
}

export async function requireOrganizationPermission(workspaceUserId: string, organizationId: string, permission: OrganizationPermission) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);
  if (membership.role === "OWNER") return membership;
  const granted = await prisma.organizationRolePermission.findUnique({ where: { organization_id_role_permission: { organization_id: membership.organization_id, role: membership.role, permission } } });
  if (!granted && !(DEFAULT_ROLE_PERMISSIONS[membership.role] || []).includes(permission)) throw new Error("Access denied: This role does not have the required permission.");
  return membership;
}

export async function updateOrganizationRole(organizationId: string, workspaceUserId: string, roleKey: string, label: string, permissions: string[]) {
  const membership = await requireOrganizationPermission(workspaceUserId, organizationId, "MANAGE_ROLES");
  const role = await prisma.organizationRoleDefinition.findUnique({ where: { organization_id_role_key: { organization_id: membership.organization_id, role_key: roleKey } } });
  if (!role) throw new Error("The selected organization role was not found.");
  if (role.is_system) throw new Error("Built-in roles cannot be renamed.");
  const cleanLabel = label.trim();
  if (cleanLabel.length < 2) throw new Error("Enter a valid role name.");
  await prisma.organizationRoleDefinition.update({ where: { id: role.id }, data: { label: cleanLabel } });
  return updateOrganizationRolePermissions(organizationId, workspaceUserId, roleKey, permissions);
}

export async function deleteOrganizationRole(organizationId: string, workspaceUserId: string, roleKey: string) {
  const membership = await requireOrganizationPermission(workspaceUserId, organizationId, "MANAGE_ROLES");
  const role = await prisma.organizationRoleDefinition.findUnique({ where: { organization_id_role_key: { organization_id: membership.organization_id, role_key: roleKey } } });
  if (!role) throw new Error("The selected organization role was not found.");
  if (role.is_system || role.role_key === "OWNER") throw new Error("Built-in roles cannot be deleted.");
  const [memberCount, invitationCount] = await Promise.all([
    prisma.organizationMembership.count({ where: { organization_id: membership.organization_id, role: roleKey, is_active: true } }),
    prisma.organizationInvitation.count({ where: { organization_id: membership.organization_id, role: roleKey, status: "PENDING" } }),
  ]);
  if (memberCount > 0 || invitationCount > 0) throw new Error("Reassign members and cancel pending invitations before deleting this role.");
  await prisma.organizationRoleDefinition.delete({ where: { id: role.id } });
  return { deleted: true, role: roleKey };
}

export async function updateOrganizationApprovalStatus(organizationId: string, approvalStatus: string) {
  const normalizedStatus = approvalStatus.toUpperCase();
  if (!["PENDING_APPROVAL", "APPROVED", "REJECTED"].includes(normalizedStatus)) {
    throw new Error("Select a valid organization approval status.");
  }

  return prisma.organization.update({
    where: { id: organizationId },
    data: {
      approval_status: normalizedStatus,
      is_active: normalizedStatus === "APPROVED",
    },
  });
}

export async function deleteOrganizationFromPlatform(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });

  if (!organization) throw new Error("Organization not found.");

  await prisma.organization.delete({ where: { id: organization.id } });
}