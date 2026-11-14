import { randomUUID } from "node:crypto";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";

import { normalizeOrganizationInput, validateOrganizationInput } from "./organization-validators";
import {
  requirePlatformSessionAdmin,
  requirePlatformSessionSuperAdmin,
} from "@/lib/auth/platform-session-manager";
import { getSessionUser } from "@/lib/auth/session-manager";
import {
  hasOrganizationTrialAccess,
  startOrganizationTrialOnApproval,
  startOrganizationTrialOnFirstOpen,
  type OrganizationTrialAccessSnapshot,
} from "@/lib/services/platform/organization-trial-service";
import { ensureDefaultProcessTemplate } from "./organization-process-template-service";
import {
  evaluateOrganizationPermission,
  ORGANIZATION_PERMISSION_DENY_PREFIX,
} from "./organization-permission-evaluator";
import {
  ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY,
  getLegacyOrganizationModuleAccessPermissions,
  getLegacyOrganizationModuleSubmoduleAccessPermissions,
  getLegacyOrganizationOrderManagementPermissions,
  getOrganizationOrderManagementLegacyPermission,
  getOrganizationOrderManagementPermission,
  isOrganizationModuleAccessPermission,
  isOrganizationOrderManagementPermission,
  isOrganizationSubmoduleAccessPermission,
  ORGANIZATION_PERMISSIONS,
  type OrganizationOrderManagementAction,
  type OrganizationOrderManagementResource,
  type OrganizationPermissionKey,
} from "@/lib/organizations/organization-permission-registry";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export type OrganizationCreateInput = {
  workspaceUserId: string;
  verifiedWorkspaceEmail?: string;
  workspaceUserFullName?: string;
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
export { ORGANIZATION_PERMISSIONS };
export type OrganizationPermission = OrganizationPermissionKey;
const INDIAN_STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi"] as const;
const SYSTEM_ROLE_LABELS: Record<string, string> = { OWNER: "Owner", ADMIN: "Administrator", FINANCE: "Finance", MERCHANDISING: "Merchandising", APPROVER: "Approver", VIEWER: "Viewer" };
const DEFAULT_ROLE_PERMISSIONS: Record<string, OrganizationPermission[]> = {
  OWNER: [...ORGANIZATION_PERMISSIONS],
  ADMIN: ["ORGANIZATION_SETTINGS", "MANAGE_USERS", "MANAGE_ROLES", "MANAGE_TAX_RULES", "MANAGE_FINANCE_INTEGRATIONS", "DISPATCH_FINANCE_SYNC", "CREATE_PROCUREMENT_VENDOR_BILL", "SUBMIT_PROCUREMENT_VENDOR_BILL", "APPROVE_PROCUREMENT_VENDOR_BILL", "POST_PROCUREMENT_VENDOR_BILL", "VIEW_REPORTS", "MANAGE_MASTER_DATA", "CREATE_ORDERS", "SHARE_ORDERS", "VIEW_ORDERS", "UPDATE_ORDERS", "DELETE_ORDERS", "VIEW_POS_SALES", "VIEW_POS_COUNTERS", "CREATE_POS_COUNTERS", "VIEW_POS_SALES_RETURNS", "VIEW_FACTORY_PRODUCTION", "UPDATE_FACTORY_PRODUCTION", "MANAGE_FACTORY_PRODUCTION", "VIEW_WORK_ORDERS", "CREATE_WORK_ORDERS", "UPDATE_WORK_ORDERS", "DELETE_WORK_ORDERS", "VIEW_PURCHASE_ORDERS", "CREATE_PURCHASE_ORDERS", "UPDATE_PURCHASE_ORDERS", "DELETE_PURCHASE_ORDERS", "SUBMIT_PURCHASE_ORDERS_FOR_APPROVAL", "SHARE_PURCHASE_ORDERS", "APPROVE_PURCHASE_ORDERS", "REJECT_PURCHASE_ORDERS", "ADJUST_RAW_MATERIAL_STOCK", "VIEW_INVENTORY_STOCK", "CREATE_FINISHED_GOODS_STOCK", "ADJUST_FINISHED_GOODS_STOCK", "RESERVE_RAW_MATERIAL_STOCK", "REQUEST_RAW_MATERIAL_OUTWARD", "MANAGE_RAW_MATERIAL_OUTWARD", "REQUEST_FINISHED_GOODS_OUTWARD", "MANAGE_FINISHED_GOODS_OUTWARD", "VIEW_STORAGE_NODES", "MANAGE_STORAGE_NODES", "VIEW_GATE_ENTRIES", "CREATE_GATE_ENTRIES", "VIEW_POS_OFFERS", "MANAGE_POS_OFFERS", "VIEW_POS_COUPONS", "MANAGE_POS_COUPONS", "VIEW_POS_ONLINE_STORE", "MANAGE_POS_ONLINE_STORE", "VIEW_INVENTORY_RECEIPTS", "MANAGE_INVENTORY_RECEIPTS", "VIEW_POS_PURCHASE_RECORDS", "MANAGE_POS_PURCHASE_RECORDS", "DELETE_POS_PURCHASE_RECORDS", "POST_POS_PURCHASE_BILLS", "ACCESS_MODULE_FINANCE_MANAGEMENT", "SUBMIT_FINANCE_DOCUMENT", "APPROVE_FINANCE_DOCUMENT", "POST_FINANCE_DOCUMENT", "LOCK_FINANCE_DOCUMENT", "CANCEL_FINANCE_DOCUMENT", "REVERSE_FINANCE_DOCUMENT"],
  FINANCE: ["MANAGE_TAX_RULES", "DISPATCH_FINANCE_SYNC", "CREATE_PROCUREMENT_VENDOR_BILL", "SUBMIT_PROCUREMENT_VENDOR_BILL", "POST_PROCUREMENT_VENDOR_BILL", "VIEW_REPORTS", "VIEW_ORDERS", "VIEW_PURCHASE_ORDERS", "VIEW_INVENTORY_STOCK", "VIEW_STORAGE_NODES", "VIEW_POS_SALES", "VIEW_POS_COUNTERS", "VIEW_POS_SALES_RETURNS", "VIEW_POS_OFFERS", "MANAGE_POS_OFFERS", "VIEW_POS_COUPONS", "MANAGE_POS_COUPONS", "VIEW_POS_PURCHASE_RECORDS", "MANAGE_POS_PURCHASE_RECORDS", "DELETE_POS_PURCHASE_RECORDS", "POST_POS_PURCHASE_BILLS", "ACCESS_MODULE_FINANCE_MANAGEMENT", "SUBMIT_FINANCE_DOCUMENT", "POST_FINANCE_DOCUMENT", "LOCK_FINANCE_DOCUMENT", "CANCEL_FINANCE_DOCUMENT", "REVERSE_FINANCE_DOCUMENT"],
  MERCHANDISING: ["CREATE_ORDERS", "SHARE_ORDERS", "VIEW_ORDERS", "UPDATE_ORDERS", "DELETE_ORDERS", "MANAGE_MASTER_DATA", "VIEW_FACTORY_PRODUCTION", "UPDATE_FACTORY_PRODUCTION", "VIEW_WORK_ORDERS", "CREATE_WORK_ORDERS", "UPDATE_WORK_ORDERS", "DELETE_WORK_ORDERS", "VIEW_PURCHASE_ORDERS", "CREATE_PURCHASE_ORDERS", "UPDATE_PURCHASE_ORDERS", "DELETE_PURCHASE_ORDERS", "SUBMIT_PURCHASE_ORDERS_FOR_APPROVAL", "SHARE_PURCHASE_ORDERS", "RESERVE_RAW_MATERIAL_STOCK", "REQUEST_RAW_MATERIAL_OUTWARD", "REQUEST_FINISHED_GOODS_OUTWARD", "VIEW_STORAGE_NODES", "MANAGE_STORAGE_NODES", "VIEW_POS_PURCHASE_RECORDS", "MANAGE_POS_PURCHASE_RECORDS", "DELETE_POS_PURCHASE_RECORDS"],
  APPROVER: ["APPROVE_ORDERS", "VIEW_ORDERS", "VIEW_PURCHASE_ORDERS", "APPROVE_PURCHASE_ORDERS", "REJECT_PURCHASE_ORDERS", "APPROVE_PROCUREMENT_VENDOR_BILL", "VIEW_STORAGE_NODES", "ACCESS_MODULE_FINANCE_MANAGEMENT", "APPROVE_FINANCE_DOCUMENT"],
  VIEWER: ["VIEW_ORDERS", "VIEW_REPORTS", "VIEW_PURCHASE_ORDERS", "VIEW_STORAGE_NODES"],
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
  const cleanLabel = normalizeUppercase(label.trim());
  const roleKey = roleKeyFromLabel(cleanLabel);
  if (cleanLabel.length < 2 || !roleKey || roleKey === "OWNER") throw new Error("Enter a valid role name that is not Owner.");
  const validPermissions = validateOrganizationPermissions(permissions);
  const role = await prisma.$transaction(async (transaction) => {
    const created = await transaction.organizationRoleDefinition.create({ data: { organization_id: membership.organization_id, role_key: roleKey, label: cleanLabel, is_system: false } });
    await transaction.organizationRolePermission.createMany({
      data: buildOrganizationRolePermissionRows(membership.organization_id, roleKey, validPermissions),
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: workspaceUserId,
        module: "ORGANIZATION_ACCESS",
        action: "ROLE_CREATED",
        entity_type: "OrganizationRoleDefinition",
        entity_id: created.id,
        details: { role_key: roleKey, permissions: validPermissions },
      },
    });
    return created;
  });
  return { role: role.role_key, label: role.label, isSystem: role.is_system, permissions: validPermissions };
}

function validateOrganizationPermissions(permissions: string[]) {
  const uniquePermissions = [...new Set(permissions)];
  if (uniquePermissions.some((permission) => !ORGANIZATION_PERMISSIONS.includes(permission as OrganizationPermission))) {
    throw new Error("The permission list contains an unsupported permission.");
  }
  return uniquePermissions as OrganizationPermission[];
}

function buildOrganizationRolePermissionRows(
  organizationId: string,
  role: string,
  permissions: readonly OrganizationPermission[],
) {
  const granted = new Set(permissions);
  return [
    ...permissions.map((permission) => ({
      id: randomUUID(),
      organization_id: organizationId,
      role,
      permission,
    })),
    ...ORGANIZATION_PERMISSIONS
      .filter((permission) => !granted.has(permission))
      .map((permission) => ({
        id: randomUUID(),
        organization_id: organizationId,
        role,
        permission: `${ORGANIZATION_PERMISSION_DENY_PREFIX}${permission}`,
      })),
  ];
}

async function replaceOrganizationRolePermissions(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  role: string,
  permissions: readonly OrganizationPermission[],
) {
  await transaction.organizationRolePermission.deleteMany({
    where: { organization_id: organizationId, role },
  });
  await transaction.organizationRolePermission.createMany({
    data: buildOrganizationRolePermissionRows(organizationId, role, permissions),
  });
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

export async function hasOrganizationsForUser(workspaceUserId: string) {
  return Boolean(await prisma.organizationMembership.findFirst({
    where: { workspace_user_id: workspaceUserId, is_active: true },
    select: { id: true },
  }));
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
      if (input.verifiedWorkspaceEmail) {
        await transaction.workspaceUser.update({
          where: { id: input.workspaceUserId },
          data: {
            email: input.verifiedWorkspaceEmail,
            email_verified: true,
            ...(input.workspaceUserFullName
              ? { full_name: input.workspaceUserFullName }
              : {}),
          },
        });
      }

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

      const erpSoftware = await transaction.eRPSoftware.create({
        data: {
          software_id: randomUUID(),
          organization_id: organization.id,
          software_name: "ERP Software",
          status: "active",
        },
        select: { id: true },
      });
      await transaction.eRPModule.createMany({
        data: ERP_MODULES.map(({ key, label }) => ({
          software_id: erpSoftware.id,
          module_key: key,
          module_name: label,
          status: "disabled",
        })),
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
      await ensureDefaultProcessTemplate(transaction, organization.id);

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

export async function getOrganizationForUserWithPermission(
  workspaceUserId: string,
  publicOrganizationId: string,
  permission: OrganizationPermission,
) {
  const organization = await prisma.organization.findFirst({
    where: {
      organization_id: publicOrganizationId,
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
      memberships: {
        where: { workspace_user_id: workspaceUserId, is_active: true },
        select: { role: true },
        take: 1,
      },
    },
  });
  const role = organization?.memberships[0]?.role;
  if (!organization || !role) return null;
  if (role !== "OWNER") {
    const stored = await prisma.organizationRolePermission.findMany({
      where: { organization_id: organization.id, role },
      select: { permission: true },
    });
    const evaluation = evaluateOrganizationPermission({
      role,
      permission,
      storedPermissions: stored.map((item) => item.permission),
      defaultPermissions: DEFAULT_ROLE_PERMISSIONS[role] || [],
    });
    if (!evaluation.allowed) throw new Error("Access denied: This role does not have the required permission.");
  }
  return { id: organization.id };
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
      gst_number: true,
      address_line_1: true,
      address_line_2: true,
      city: true,
      state: true,
      country: true,
      pin_code: true,
      created_at: true,
      approval_status: true,
      pricing_mode: true,
      platform_version_id: true,
      trial_enabled: true,
      trial_started_at: true,
      trial_ends_at: true,
      ai_enabled: true,
      erpSoftware: {
        orderBy: { created_at: "asc" },
        take: 1,
        select: {
          modules: {
            select: { module_key: true, module_name: true, status: true, settings: true },
          },
        },
      },
    },
  });
}

export async function getOrganizationInternalIdForUser(workspaceUserId: string, organizationId: string) {
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
    select: { id: true },
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
  const membership = await requireOrganizationPermission(workspaceUserId, organizationId, "MANAGE_USERS");

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
  const actorMembership = await requireOrganizationPermission(input.actorUserId, input.organizationId, "MANAGE_USERS");
  if (input.role === "OWNER" || !(await isOrganizationRole(actorMembership.organization_id, input.role))) {
    throw new Error("The selected organization role is not available.");
  }

  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.organizationMembership.create({
      data: {
        id: randomUUID(),
        organization_id: actorMembership.organization_id,
        workspace_user_id: input.workspaceUserId,
        role: input.role,
        is_active: true,
      },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: actorMembership.organization_id,
        user_id: input.actorUserId,
        module: "ORGANIZATION_ACCESS",
        action: "MEMBERSHIP_CREATED",
        entity_type: "OrganizationMembership",
        entity_id: membership.id,
        details: { role: input.role, is_active: true },
      },
    });
    return membership;
  });
}

export async function updateOrganizationMember(
  membershipId: string,
  organizationId: string,
  actorUserId: string,
  data: { role?: string; is_active?: boolean }
) {
  const actorMembership = await requireOrganizationPermission(actorUserId, organizationId, "MANAGE_USERS");
  const targetMembership = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, organization_id: actorMembership.organization_id },
    select: { id: true, role: true, is_active: true },
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

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.organizationMembership.update({
      where: { id: membershipId, organization_id: actorMembership.organization_id },
      data: {
        ...data,
        role: data.role,
      },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: actorMembership.organization_id,
        user_id: actorUserId,
        module: "ORGANIZATION_ACCESS",
        action: "MEMBERSHIP_UPDATED",
        entity_type: "OrganizationMembership",
        entity_id: membershipId,
        details: {
          previous_role: targetMembership.role,
          role: data.role ?? targetMembership.role,
          previous_is_active: targetMembership.is_active,
          is_active: data.is_active ?? targetMembership.is_active,
        },
      },
    });
    return updated;
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
  options: { allowExpiredTrial?: boolean } = {},
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
      approval_status: true,
      trial_started_at: true,
      trial_ends_at: true,
      trial_enabled: true,
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

  let trialSnapshot: OrganizationTrialAccessSnapshot = {
    trial_started_at: organization.trial_started_at,
    trial_ends_at: organization.trial_ends_at,
    trial_enabled: organization.trial_enabled,
  };
  if (
    organization.approval_status === "APPROVED"
    && organization.trial_enabled
    && !organization.trial_started_at
  ) {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.supportAccess) {
      trialSnapshot = await startOrganizationTrialOnFirstOpen(organization.id, workspaceUserId) ?? trialSnapshot;
    }
  }
  if (!options.allowExpiredTrial && !await hasOrganizationTrialAccess(organization.id, new Date(), trialSnapshot)) {
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
  const stored = await prisma.organizationRolePermission.findMany({
    where: { organization_id: membership.organization_id },
    orderBy: [{ role: "asc" }, { permission: "asc" }],
  });
  if (membership.role !== "OWNER") {
    const storedPermissions = stored
      .filter((item) => item.role === membership.role)
      .map((item) => item.permission);
    const canManageRoles = ["MANAGE_ROLES", "MANAGE_USERS"].some((permission) =>
      evaluateOrganizationPermission({
        role: membership.role,
        permission,
        storedPermissions,
        defaultPermissions: DEFAULT_ROLE_PERMISSIONS[membership.role] || [],
      }).allowed,
    );
    if (!canManageRoles) {
      throw new Error("Access denied: This role cannot view organization roles.");
    }
  }
  const roles = await ensureOrganizationRoleDefinitions(membership.organization_id);
  const memberCounts = await prisma.organizationMembership.groupBy({
    by: ["role"],
    where: { organization_id: membership.organization_id, is_active: true },
    _count: { _all: true },
  });
  return roles.map((role) => ({
    role: role.role_key,
    label: role.label,
    isSystem: role.is_system,
    userCount: memberCounts.find((item) => item.role === role.role_key)?._count._all || 0,
    permissions: getConfiguredRolePermissions(role.role_key, stored
      .filter((item) => item.role === role.role_key)
      .map((item) => item.permission)),
  }));
}

function resolveOrganizationRolePermissions(
  role: string,
  storedPermissions: readonly string[],
  defaultPermissions: readonly OrganizationPermission[],
) {
  const evaluate = (permission: OrganizationPermission) => evaluateOrganizationPermission({
    role,
    permission,
    storedPermissions,
    defaultPermissions,
  });
  const effectiveCorePermissions = ORGANIZATION_PERMISSIONS.filter((permission) =>
    !isOrganizationModuleAccessPermission(permission)
    && !isOrganizationSubmoduleAccessPermission(permission)
    && !isOrganizationOrderManagementPermission(permission)
    && evaluate(permission).allowed,
  );
  const legacyOrderManagementPermissions = new Set(
    getLegacyOrganizationOrderManagementPermissions(effectiveCorePermissions),
  );
  const legacyModuleAccessPermissions = new Set(
    getLegacyOrganizationModuleAccessPermissions(effectiveCorePermissions),
  );
  const effectiveModuleAccessPermissions = Object.values(ORGANIZATION_MODULE_ACCESS_PERMISSION_BY_KEY)
    .filter((permission) => {
      const result = evaluate(permission);
      if (result.reason === "explicit-denial") return false;
      return result.allowed || legacyModuleAccessPermissions.has(permission);
    });
  const legacySubmoduleAccessPermissions = new Set(
    getLegacyOrganizationModuleSubmoduleAccessPermissions(effectiveModuleAccessPermissions),
  );

  return ORGANIZATION_PERMISSIONS.filter((permission) => {
    const result = evaluate(permission);
    if (isOrganizationOrderManagementPermission(permission)) {
      if (result.reason === "explicit-denial") return false;
      return result.allowed || legacyOrderManagementPermissions.has(permission);
    }
    if (isOrganizationModuleAccessPermission(permission)) {
      return effectiveModuleAccessPermissions.includes(permission);
    }
    if (isOrganizationSubmoduleAccessPermission(permission)) {
      if (result.reason === "explicit-denial") return false;
      return result.allowed || legacySubmoduleAccessPermissions.has(permission);
    }
    return result.allowed;
  });
}

function getConfiguredRolePermissions(role: string, storedPermissions: readonly string[]) {
  return resolveOrganizationRolePermissions(
    role,
    storedPermissions,
    DEFAULT_ROLE_PERMISSIONS[role] || [],
  );
}

async function ensureOrganizationRoleAdminRecovery(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  role: string,
  permissions: readonly OrganizationPermission[],
) {
  if (permissions.includes("MANAGE_ROLES")) return;
  const activeMembershipsByRole = await transaction.organizationMembership.groupBy({
    by: ["role"],
    where: { organization_id: organizationId, is_active: true },
    _count: { _all: true },
  });
  if (!activeMembershipsByRole.some((item) => item.role === role && item._count._all > 0)) return;

  const storedPermissions = await transaction.organizationRolePermission.findMany({
    where: { organization_id: organizationId },
    select: { role: true, permission: true },
  });
  const hasOtherRoleAdmin = activeMembershipsByRole.some((item) => {
    if (item.role === role || item._count._all === 0) return false;
    if (item.role === "OWNER") return true;
    const permissionsForRole = storedPermissions
      .filter((storedPermission) => storedPermission.role === item.role)
      .map((storedPermission) => storedPermission.permission);
    return evaluateOrganizationPermission({
      role: item.role,
      permission: "MANAGE_ROLES",
      storedPermissions: permissionsForRole,
      defaultPermissions: DEFAULT_ROLE_PERMISSIONS[item.role] || [],
    }).allowed;
  });
  if (!hasOtherRoleAdmin) {
    throw new Error("Keep role-management access for at least one active organization administrator.");
  }
}

export async function updateOrganizationRolePermissions(organizationId: string, workspaceUserId: string, role: string, permissions: string[]) {
  const membership = await requireOrganizationPermission(workspaceUserId, organizationId, "MANAGE_ROLES");
  const roleDefinition = await prisma.organizationRoleDefinition.findUnique({ where: { organization_id_role_key: { organization_id: membership.organization_id, role_key: role } } });
  if (!roleDefinition) throw new Error("The selected organization role was not found.");
  const validPermissions = validateOrganizationPermissions(permissions);
  if (role === "OWNER") throw new Error("Owner permissions cannot be changed.");
  await prisma.$transaction(async (transaction) => {
    await ensureOrganizationRoleAdminRecovery(transaction, membership.organization_id, role, validPermissions);
    const previous = await transaction.organizationRolePermission.findMany({
      where: { organization_id: membership.organization_id, role },
      select: { permission: true },
    });
    const previousPermissions = previous
      .map((item) => item.permission)
      .filter((permission) => !permission.startsWith(ORGANIZATION_PERMISSION_DENY_PREFIX));
    await replaceOrganizationRolePermissions(transaction, membership.organization_id, role, validPermissions);
    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: workspaceUserId,
        module: "ORGANIZATION_ACCESS",
        action: "ROLE_PERMISSIONS_UPDATED",
        entity_type: "OrganizationRoleDefinition",
        entity_id: roleDefinition.id,
        details: { role_key: role, previous_permissions: previousPermissions, permissions: validPermissions },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { role, permissions: validPermissions };
}

export async function requireOrganizationPermission(workspaceUserId: string, organizationId: string, permission: OrganizationPermission) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);
  if (membership.role === "OWNER") return membership;
  const stored = await prisma.organizationRolePermission.findMany({
    where: { organization_id: membership.organization_id, role: membership.role },
    select: { permission: true },
  });
  const evaluation = evaluateOrganizationPermission({
    role: membership.role,
    permission,
    storedPermissions: stored.map((item) => item.permission),
    defaultPermissions: DEFAULT_ROLE_PERMISSIONS[membership.role] || [],
  });
  if (!evaluation.allowed) throw new Error("Access denied: This role does not have the required permission.");
  return membership;
}

export async function requireOrganizationOrderManagementPermission(
  workspaceUserId: string,
  organizationId: string,
  resource: OrganizationOrderManagementResource,
  action: OrganizationOrderManagementAction,
) {
  const permission = getOrganizationOrderManagementPermission(resource, action);
  const legacyPermission = getOrganizationOrderManagementLegacyPermission(resource, action);
  if (!permission || !legacyPermission) {
    throw new Error("Access denied: This Order Management action is not available for the selected module.");
  }

  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);
  if (membership.role === "OWNER") return membership;
  const stored = await prisma.organizationRolePermission.findMany({
    where: { organization_id: membership.organization_id, role: membership.role },
    select: { permission: true },
  });
  const storedPermissions = stored.map((item) => item.permission);
  const scopedEvaluation = evaluateOrganizationPermission({
    role: membership.role,
    permission,
    storedPermissions,
    defaultPermissions: DEFAULT_ROLE_PERMISSIONS[membership.role] || [],
  });
  if (scopedEvaluation.allowed) return membership;
  if (scopedEvaluation.reason === "explicit-denial") {
    throw new Error("Access denied: This role does not have the required Order Management permission.");
  }

  const legacyEvaluation = evaluateOrganizationPermission({
    role: membership.role,
    permission: legacyPermission,
    storedPermissions,
    defaultPermissions: DEFAULT_ROLE_PERMISSIONS[membership.role] || [],
  });
  if (!legacyEvaluation.allowed) {
    throw new Error("Access denied: This role does not have the required Order Management permission.");
  }
  return membership;
}

export async function getOrganizationEffectivePermissions(workspaceUserId: string, organizationId: string) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);
  if (membership.role === "OWNER") return [...ORGANIZATION_PERMISSIONS];
  const stored = await prisma.organizationRolePermission.findMany({
    where: { organization_id: membership.organization_id, role: membership.role },
    select: { permission: true },
  });
  return resolveOrganizationRolePermissions(
    membership.role,
    stored.map((item) => item.permission),
    DEFAULT_ROLE_PERMISSIONS[membership.role] || [],
  );
}

export async function updateOrganizationRole(organizationId: string, workspaceUserId: string, roleKey: string, label: string, permissions: string[]) {
  const membership = await requireOrganizationPermission(workspaceUserId, organizationId, "MANAGE_ROLES");
  const role = await prisma.organizationRoleDefinition.findUnique({ where: { organization_id_role_key: { organization_id: membership.organization_id, role_key: roleKey } } });
  if (!role) throw new Error("The selected organization role was not found.");
  if (role.is_system) throw new Error("Built-in roles cannot be renamed.");
  const cleanLabel = normalizeUppercase(label.trim());
  if (cleanLabel.length < 2) throw new Error("Enter a valid role name.");
  const validPermissions = validateOrganizationPermissions(permissions);
  await prisma.$transaction(async (transaction) => {
    await ensureOrganizationRoleAdminRecovery(transaction, membership.organization_id, roleKey, validPermissions);
    const previous = await transaction.organizationRolePermission.findMany({
      where: { organization_id: membership.organization_id, role: roleKey },
      select: { permission: true },
    });
    const previousPermissions = previous
      .map((item) => item.permission)
      .filter((permission) => !permission.startsWith(ORGANIZATION_PERMISSION_DENY_PREFIX));
    await transaction.organizationRoleDefinition.update({ where: { id: role.id }, data: { label: cleanLabel } });
    await replaceOrganizationRolePermissions(transaction, membership.organization_id, roleKey, validPermissions);
    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: workspaceUserId,
        module: "ORGANIZATION_ACCESS",
        action: "ROLE_UPDATED",
        entity_type: "OrganizationRoleDefinition",
        entity_id: role.id,
        details: {
          role_key: roleKey,
          previous_label: role.label,
          label: cleanLabel,
          previous_permissions: previousPermissions,
          permissions: validPermissions,
        },
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { role: roleKey, label: cleanLabel, isSystem: role.is_system, permissions: validPermissions };
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
  await prisma.$transaction(async (transaction) => {
    await transaction.organizationRolePermission.deleteMany({
      where: { organization_id: membership.organization_id, role: roleKey },
    });
    await transaction.organizationRoleDefinition.delete({ where: { id: role.id } });
    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: workspaceUserId,
        module: "ORGANIZATION_ACCESS",
        action: "ROLE_DELETED",
        entity_type: "OrganizationRoleDefinition",
        entity_id: role.id,
        details: { role_key: roleKey, label: role.label },
      },
    });
  });
  return { deleted: true, role: roleKey };
}

import { normalizeSystemStatusKey } from "@/lib/auth/validation-rules";

export async function updateOrganizationApprovalStatus(organizationId: string, approvalStatus: string) {
  const result = await updateOrganizationApprovalStatusWithTransition(organizationId, approvalStatus);
  return result.organization;
}

export async function updateOrganizationApprovalStatusWithTransition(organizationId: string, approvalStatus: string) {
  const normalizedStatus = normalizeSystemStatusKey(approvalStatus);
  if (!["PENDING_APPROVAL", "APPROVED", "REJECTED"].includes(normalizedStatus)) {
    throw new Error("Select a valid organization approval status.");
  }
  const platformAdmin = await requirePlatformSessionAdmin();
  const existingOrganization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { approval_status: true },
  });
  if (!existingOrganization) throw new Error("Organization not found.");

  const organization = await prisma.$transaction(async (transaction) => {
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
  return {
    organization,
    approvedNow: normalizedStatus === "APPROVED" && existingOrganization.approval_status !== "APPROVED",
  };
}

export const ORGANIZATION_DELETE_RETENTION_DAYS = 90;

export function getOrganizationDeletionEligibility(archivedAt: Date | null, now = new Date()) {
  const eligibleAt = archivedAt
    ? new Date(archivedAt.getTime() + ORGANIZATION_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
    : null;

  return { eligibleAt, isEligible: eligibleAt !== null && now >= eligibleAt };
}

export async function deleteOrganizationFromPlatform(organizationId: string) {
  await requirePlatformSessionSuperAdmin();

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
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 20000,
    timeout: 150000,
  });
}

export async function forceDeleteOrganizationFromPlatform(organizationId: string, confirmationName: string) {
  const platformAdmin = await requirePlatformSessionSuperAdmin();

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
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 20000,
    timeout: 150000,
  });
}