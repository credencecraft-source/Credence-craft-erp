import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";

import { normalizeOrganizationInput, validateOrganizationInput } from "./organization-validators";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { hasOrganizationTrialAccess, startOrganizationTrialOnApproval, startOrganizationTrialOnFirstOpen } from "@/lib/services/platform/organization-trial-service";

export type OrganizationCreateInput = {
  workspaceUserId: string;
  organizationName: string;
  organizationEmail?: string;
  gstNumber: string;
  mobileNo?: string;
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
const INDIAN_STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi"] as const;
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

function getDatabaseSchemaError(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  const message = error.message || "";
  if (message.includes("organizations.organization_number") || message.includes("P2022")) {
    return new Error("Organization schema is out of date. Apply the pending Prisma migration before continuing.");
  }
  if (message.includes("P2021") || /table .* does not exist/i.test(message)) {
    return new Error("Organization database table is not available yet. Run the Prisma migration or sync the database schema before creating organizations.");
  }
  return null;
}

async function findOrganizationsForUser(
  workspaceUserId: string,
  activeOnly: boolean,
  cursor?: string,
  take?: number,
) {
  try {
    const organizations = await prisma.organization.findMany({
      where: {
        ...(activeOnly ? { is_active: true, approval_status: "APPROVED" } : {}),
        memberships: {
          some: {
            workspace_user_id: workspaceUserId,
            is_active: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      ...(take ? { take } : {}),
      select: {
        id: true,
        organization_number: true,
        organization_id: true,
        organization_name: true,
        gst_number: true,
        approval_status: true,
        is_active: true,
        memberships: {
          where: { workspace_user_id: workspaceUserId, is_active: true },
          select: { role: true },
          take: 1,
        },
        roleDefinitions: { select: { role_key: true, label: true } },
        rolePermissions: {
          where: { permission: "ORGANIZATION_SETTINGS" },
          select: { role: true },
        },
      },
    });

    return organizations.map(({ memberships, roleDefinitions, rolePermissions, ...organization }) => {
      const role = memberships[0]?.role ?? "VIEWER";
      const roleLabel = roleDefinitions.find((definition) => definition.role_key === role)?.label
        ?? role.split("_").map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(" ");
      return {
        ...organization,
        organization_number: organization.organization_number.toString().padStart(10, "0"),
        membership_role: role,
        membership_role_label: roleLabel,
        can_manage_settings: role === "OWNER" || role === "ADMIN" || rolePermissions.some((item) => item.role === role),
      };
    });
  } catch (error) {
    const schemaError = getDatabaseSchemaError(error);
    if (schemaError) throw schemaError;
    throw error;
  }
}

export async function listOrganizationsForUser(workspaceUserId: string) {
  return findOrganizationsForUser(workspaceUserId, false);
}

export async function countOrganizationsForUser(workspaceUserId: string) {
  try {
    return await prisma.organization.count({
      where: {
        memberships: {
          some: { workspace_user_id: workspaceUserId, is_active: true },
        },
      },
    });
  } catch (error) {
    const schemaError = getDatabaseSchemaError(error);
    if (schemaError) throw schemaError;
    throw error;
  }
}

export async function listActiveOrganizationsForUser(workspaceUserId: string) {
  return findOrganizationsForUser(workspaceUserId, true);
}

export async function listWorkspaceOrganizationPage(workspaceUserId: string, cursor?: string) {
  const pageSize = 24;
  const rowsPromise = findOrganizationsForUser(workspaceUserId, false, cursor, pageSize + 1);
  const toPage = (rows: Awaited<typeof rowsPromise>) => {
    const hasMore = rows.length > pageSize;
    const organizations = rows.slice(0, pageSize);
    return {
      organizations,
      nextCursor: hasMore ? organizations[organizations.length - 1]?.id ?? null : null,
    };
  };

  if (cursor) {
    return { ...toPage(await rowsPromise), totalCount: null, activeCount: null };
  }

  const statusCountsPromise = prisma.organization.groupBy({
        by: ["is_active", "approval_status"],
        where: {
          memberships: {
            some: { workspace_user_id: workspaceUserId, is_active: true },
          },
        },
        _count: { _all: true },
      }).catch((error: unknown) => {
        const schemaError = getDatabaseSchemaError(error);
        if (schemaError) throw schemaError;
        throw error;
      });
  const [rows, statusCounts] = await Promise.all([rowsPromise, statusCountsPromise]);
  const totalCount = statusCounts.reduce((total, item) => total + item._count._all, 0);
  const activeCount = statusCounts.reduce(
    (total, item) => total + (item.is_active && item.approval_status === "APPROVED" ? item._count._all : 0),
    0,
  );
  return { ...toPage(rows), totalCount, activeCount };
}

export async function createOrganization(input: OrganizationCreateInput) {
  try {
    const validated = validateOrganizationInput({
      organizationName: input.organizationName,
      organizationEmail: input.organizationEmail,
      gstNumber: input.gstNumber,
      mobileNo: input.mobileNo,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      country: input.country,
      pinCode: input.pinCode,
    });

    const organization = await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          organization_id: randomUUID(),
          organization_name: validated.organizationName,
          organization_email: validated.organizationEmail || null,
          gst_number: validated.gstNumber,
          mobile_number: validated.mobileNo || null,
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
      await transaction.masterGstType.createMany({
        data: ["CGST & SGST", "IGST"].map((gstType, index) => ({
          organization_id: organization.id,
          gst_type: gstType,
          is_active: true,
          sort_order: index,
        })),
        skipDuplicates: true,
      });
      await transaction.masterRawMaterialType.createMany({
        data: [{ organization_id: organization.id, raw_material_type: "Item", is_active: true, sort_order: 0 }],
        skipDuplicates: true,
      });
      await transaction.masterProduct.createMany({
        data: [{ organization_id: organization.id, product_master_name: "Finished Goods", is_active: true, sort_order: 0 }],
        skipDuplicates: true,
      });
      await transaction.masterEntity.createMany({
        data: [{ organization_id: organization.id, entity_name: validated.organizationName, is_active: true, sort_order: 0 }],
        skipDuplicates: true,
      });
      const defaultGstRates = [5, 12, 18, 28].map((rate, index) => ({
        organization_id: organization.id,
        name: `${rate}%`,
        gst: rate,
        cgst_rate: rate / 2,
        sgst_rate: rate / 2,
        igst_rate: rate,
        is_active: true,
        sort_order: index,
      }));
      await transaction.masterGst.createMany({ data: defaultGstRates, skipDuplicates: true });
      await transaction.masterState.createMany({
        data: INDIAN_STATES.map((state, index) => ({ organization_id: organization.id, state, is_active: true, sort_order: index })),
        skipDuplicates: true,
      });

      return organization;
    }, { maxWait: 10000, timeout: 30000 });

    return {
      ...organization,
      organization_number: organization.organization_number.toString().padStart(10, "0"),
    };
  } catch (error) {
    const schemaError = getDatabaseSchemaError(error);
    if (schemaError) throw schemaError;
    throw error;
  }
}

export async function getOrganizationForUser(workspaceUserId: string, organizationId: string) {
  return prisma.organization.findFirst({
    where: {
      organization_id: organizationId,
      is_active: true,
      memberships: {
        some: {
          workspace_user_id: workspaceUserId,
          is_active: true,
        },
      },
    },
    include: {
      platformVersion: true,
      erpSoftware: {
        include: {
          modules: true,
        },
      },
    },
  });
}

export async function getOrganizationShellContext(workspaceUserId: string, organizationId: string) {
  return prisma.organization.findFirst({
    where: {
      organization_id: organizationId,
      is_active: true,
      memberships: {
        some: {
          workspace_user_id: workspaceUserId,
          is_active: true,
        },
      },
    },
    select: {
      id: true,
      organization_id: true,
      organization_name: true,
      approval_status: true,
      platform_version_id: true,
      trial_enabled: true,
      trial_started_at: true,
      trial_ends_at: true,
    },
  });
}

export async function getOrganizationByPublicId(organizationId: string) {
  return prisma.organization.findUnique({
    where: { organization_id: organizationId },
    include: {
      platformVersion: true,
      erpSoftware: {
        include: {
          modules: true,
        },
      },
    },
  });
}

async function deleteOrganizationDependencies(transaction: Prisma.TransactionClient, organizationId: string) {
  await transaction.factoryDailyProductionReportLine.deleteMany({
    where: { report: { organization_id: organizationId } },
  });
  await transaction.factoryGrn.deleteMany({ where: { organization_id: organizationId } });
  await transaction.factoryBundleTransfer.deleteMany({ where: { organization_id: organizationId } });
  await transaction.workOrderProcessControllerProcess.deleteMany({
    where: { controller: { workOrder: { organization_id: organizationId } } },
  });
  await transaction.workOrderProcessController.deleteMany({
    where: { workOrder: { organization_id: organizationId } },
  });
  await transaction.orderProcessControllerProcess.deleteMany({
    where: { controller: { order: { organization_id: organizationId } } },
  });
  await transaction.orderProcessController.deleteMany({
    where: { order: { organization_id: organizationId } },
  });
  await transaction.merchandisingOrderProcessStep.deleteMany({
    where: { order: { organization_id: organizationId } },
  });
}

async function permanentlyDeleteOrganization(transaction: Prisma.TransactionClient, organizationId: string) {
  await transaction.$executeRaw`SELECT set_config('app.skip_organization_audit', 'true', true)`;
  await deleteOrganizationDependencies(transaction, organizationId);
  await transaction.organization.delete({ where: { id: organizationId } });
}

export async function archiveOrganization(
  organizationId: string,
  workspaceUserId: string,
  confirmationName: string,
) {
  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findFirst({
      where: {
        id: organizationId,
        memberships: {
          some: { workspace_user_id: workspaceUserId, role: "OWNER", is_active: true },
        },
      },
      select: { id: true, organization_id: true, organization_name: true, approval_status: true },
    });

    if (!organization) throw new Error("Organization not found or owner access required.");
    if (organization.organization_name !== confirmationName) {
      throw new Error("Organization name confirmation did not match.");
    }
    if (organization.approval_status === "ARCHIVED") {
      throw new Error("Organization is already archived.");
    }

    await transaction.$executeRaw`SELECT set_config('app.user_id', ${workspaceUserId}, true)`;
    const updated = await transaction.organization.updateMany({
      where: { id: organization.id, approval_status: organization.approval_status },
      data: { approval_status: "ARCHIVED", archived_at: new Date(), is_active: false },
    });
    if (updated.count !== 1) throw new Error("Organization changed during archival. Refresh and try again.");

    return { archived: true, organizationId: organization.organization_id };
  });
}

export async function restoreOrganization(organizationId: string, workspaceUserId: string) {
  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findFirst({
      where: {
        id: organizationId,
        approval_status: "ARCHIVED",
        memberships: {
          some: { workspace_user_id: workspaceUserId, role: "OWNER", is_active: true },
        },
      },
      select: { id: true, organization_id: true },
    });

    if (!organization) throw new Error("Archived organization not found or owner access required.");

    await transaction.$executeRaw`SELECT set_config('app.user_id', ${workspaceUserId}, true)`;
    const updated = await transaction.organization.updateMany({
      where: { id: organization.id, approval_status: "ARCHIVED" },
      data: { approval_status: "PENDING_APPROVAL", archived_at: null, is_active: false },
    });
    if (updated.count !== 1) throw new Error("Organization changed during restoration. Refresh and try again.");

    return { restored: true, organizationId: organization.organization_id };
  });
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
  if (input.role === "OWNER" || !(await isOrganizationRole(actorMembership.organization_id, input.role))) {
    throw new Error("The selected organization role is not available.");
  }

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
  const targetMembership = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, organization_id: actorMembership.organization_id },
    select: { id: true, role: true },
  });

  if (!targetMembership) {
    throw new Error("Organization member not found.");
  }

  if (targetMembership.role === "OWNER" || data.role === "OWNER") {
    throw new Error("Owner membership changes require an explicit ownership transfer.");
  }

  if (data.role && !(await isOrganizationRole(actorMembership.organization_id, data.role))) {
    throw new Error("The selected organization role is not available.");
  }

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
      organization: { is_active: true },
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
      is_active: true,
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

  await startOrganizationTrialOnFirstOpen(organization.id, workspaceUserId);
  if (!await hasOrganizationTrialAccess(organization.id)) {
    throw new Error("This organization's trial has ended. Activate a subscription or contact the platform administrator.");
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
    prisma.organizationInvitation.count({ where: { organization_id: membership.organization_id, role: roleKey, status: "PENDING", expires_at: { gt: new Date() } } }),
  ]);
  if (memberCount > 0 || invitationCount > 0) throw new Error("Reassign members and cancel pending invitations before deleting this role.");
  await prisma.organizationRoleDefinition.delete({ where: { id: role.id } });
  return { deleted: true, role: roleKey };
}

import { normalizeSystemStatusKey } from "@/lib/auth/validation-rules";

export async function updateOrganizationApprovalStatus(organizationId: string, approvalStatus: string) {
  const normalizedStatus = normalizeSystemStatusKey(approvalStatus);
  if (!["PENDING_APPROVAL", "APPROVED", "REJECTED"].includes(normalizedStatus)) {
    throw new Error("Select a valid organization approval status.");
  }
  const platformAdmin = await requirePlatformSessionAdmin();

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.organization.updateMany({
      where: {
        id: organizationId,
        approval_status: { not: "ARCHIVED" },
        ...(normalizedStatus === "APPROVED" ? {
          OR: [
            { platform_version_id: null },
            { platformVersion: { is: { is_active: true } } },
          ],
        } : {}),
      },
      data: {
        approval_status: normalizedStatus,
        is_active: normalizedStatus === "APPROVED",
      },
    });
    if (updated.count !== 1) {
      const existing = await transaction.organization.findUnique({
        where: { id: organizationId },
        select: {
          id: true,
          approval_status: true,
          platform_version_id: true,
          platformVersion: { select: { is_active: true } },
        },
      });
      if (!existing) throw new Error("Organization not found.");
      if (existing.approval_status === "ARCHIVED") {
        throw new Error("Restore the organization from its workspace before changing its approval status.");
      }
      if (normalizedStatus === "APPROVED" && existing.platform_version_id && !existing.platformVersion?.is_active) {
        throw new Error("Assign an active platform version before approving this organization.");
      }
      throw new Error("Restore the organization from its workspace before changing its approval status.");
    }
    if (normalizedStatus === "APPROVED") {
      await startOrganizationTrialOnApproval(transaction, organizationId, platformAdmin.id);
    }
    const organization = await transaction.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new Error("Organization not found.");
    return organization;
  });
}

export const ORGANIZATION_DELETE_RETENTION_DAYS = 90;

export function getOrganizationDeletionEligibility(archivedAt: Date | null, now = new Date()) {
  const eligibleAt = archivedAt
    ? new Date(archivedAt.getTime() + ORGANIZATION_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    : null;

  return { eligibleAt, isEligible: eligibleAt !== null && now >= eligibleAt };
}

export async function deleteOrganizationFromPlatform(organizationId: string) {
  await requirePlatformSessionAdmin();

  await prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, approval_status: true, archived_at: true },
    });

    if (!organization) throw new Error("Organization not found.");
    if (organization.approval_status !== "ARCHIVED") {
      throw new Error("Only archived organizations can be deleted.");
    }

    const eligibility = getOrganizationDeletionEligibility(organization.archived_at);
    if (!eligibility.isEligible) {
      if (!organization.archived_at) {
        throw new Error("The archive date is unavailable. Restore and re-archive the organization to start the 90-day retention period.");
      }
      throw new Error("Organizations can only be deleted 90 days after archiving.");
    }

    await permanentlyDeleteOrganization(transaction, organization.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function forceDeleteOrganizationFromPlatform(organizationId: string, confirmationName: string) {
  const platformAdmin = await requirePlatformSessionAdmin();

  await prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, organization_name: true, approval_status: true, archived_at: true },
    });

    if (!organization) throw new Error("Organization not found.");
    if (organization.organization_name !== confirmationName) {
      throw new Error("Organization name confirmation did not match.");
    }

    await transaction.platformAuditEvent.create({
      data: {
        platform_admin_id: platformAdmin.id,
        action: "ORGANIZATION_FORCE_DELETED",
        entity_type: "Organization",
        entity_id: organization.id,
        details: {
          organizationName: organization.organization_name,
          approvalStatus: organization.approval_status,
          archivedAt: organization.archived_at?.toISOString() ?? null,
          bypassedRetention: true,
        },
      },
    });

    await permanentlyDeleteOrganization(transaction, organization.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}