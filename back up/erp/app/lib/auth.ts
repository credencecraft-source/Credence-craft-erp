import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "./bootstrap/prisma";

export const AUTH_COOKIE_NAME = "erp_session";

export type SessionPayload = {
  userId: string;
  email: string;
  profileName?: string | null;
  exp: number;
};

export function createSessionToken(userId: string, email: string, profileName?: string | null) {
  const payload: SessionPayload = {
    userId,
    email,
    profileName: profileName?.trim() || null,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export async function resolveUniqueProfileName(candidate: string | null | undefined, ignoreUserId?: string) {
  const baseName = candidate?.trim();

  if (!baseName) {
    return null;
  }

  let nextProfileName = baseName;
  let suffix = 2;

  while (true) {
    const existingUser = await prisma.user.findFirst({
      where: {
        profileName: nextProfileName,
        ...(ignoreUserId ? { NOT: { id: ignoreUserId } } : {}),
      },
      select: { id: true },
    });

    if (!existingUser) {
      return nextProfileName;
    }

    nextProfileName = `${baseName}-${suffix}`;
    suffix += 1;
  }
}

export async function withUniqueProfileName<T>(
  candidate: string | null | undefined,
  ignoreUserId: string | undefined,
  operation: (resolvedProfileName: string | null) => Promise<T>
): Promise<T> {
  const baseName = candidate?.trim();
  let currentCandidate = baseName ?? null;
  let suffix = 2;

  while (true) {
    const resolvedProfileName = currentCandidate ? await resolveUniqueProfileName(currentCandidate, ignoreUserId) : null;

    try {
      return await operation(resolvedProfileName);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }

      const targetFields = Array.isArray(error.meta?.target) ? error.meta.target : [];
      if (!targetFields.includes("profileName")) {
        throw error;
      }

      if (!baseName) {
        throw new Error("Profile name is unavailable after retry.");
      }

      currentCandidate = `${baseName}-${suffix}`;
      suffix += 1;
    }
  }
}

export function parseSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as SessionPayload;

    if (!payload.userId || !payload.email || !payload.exp || payload.exp <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const session = parseSessionToken(token);

  if (!session) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      profileName: true,
      isActive: true,
      isPlatformAdmin: true,
      createdAt: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export async function getBackendAdminUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("erp_backend_session")?.value;
  const session = parseSessionToken(token);

  if (!session) {
    return null;
  }

  const user = await prisma.backendAdmin.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export async function requireOrganizationAccess(userId: string, organizationId: string) {
  if (!organizationId) {
    throw new Error("Organization scope is required.");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (currentUser?.isPlatformAdmin) {
    return { id: userId, organizationId, userId };
  }

  const membership = await prisma.organizationUser.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    include: {
      role: true,
    },
  });

  if (!membership) {
    throw new Error("You do not have access to this organization.");
  }

  if (membership.isOwner || membership.role?.isSuperAdmin) {
    return membership;
  }

  return membership;
}

export async function requireTableAccess(userId: string, organizationId: string, tableName: string, action: "read" | "write" | "delete" = "read") {
  await requireOrganizationAccess(userId, organizationId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (user?.isPlatformAdmin) {
    return true;
  }

  const membership = await prisma.organizationUser.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    include: { role: true },
  });

  if (!membership) {
    throw new Error("You do not have access to this organization.");
  }

  const permissionSet = getEffectiveRolePermissions(membership);
  const tablePermission = (permissionSet.tablePermissions[tableName] as Record<string, boolean> | undefined) ?? {};

  if (action === "delete") {
    if (tablePermission.delete) return true;
    throw new Error(`You do not have delete access to table: ${tableName}.`);
  }

  if (action === "write") {
    if (tablePermission.write) return true;
    throw new Error(`You do not have write access to table: ${tableName}.`);
  }

  if (tablePermission.read) return true;
  throw new Error(`You do not have read access to table: ${tableName}.`);
}

export async function requireOrganizationAdmin(userId: string, organizationId: string) {
  await requireOrganizationAccess(userId, organizationId);

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (currentUser?.isPlatformAdmin) {
    return true;
  }

  const membership = await prisma.organizationUser.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    include: {
      role: true,
    },
  });

  if (!membership) {
    throw new Error("You do not have access to this organization.");
  }

  if (membership.isOwner || membership.role?.isSuperAdmin || membership.role?.canManageUsers) {
    return true;
  }

  throw new Error("You do not have permission to manage users in this organization.");
}

export async function requireBackupAccess(userId: string, organizationId: string, action: "view" | "create" | "restore" | "manage" = "manage") {
  await requireOrganizationAccess(userId, organizationId);

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (currentUser?.isPlatformAdmin) {
    return true;
  }

  const membership = await prisma.organizationUser.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId,
      },
    },
    include: {
      role: true,
    },
  });

  if (!membership) {
    throw new Error("You do not have access to this organization.");
  }

  const canManageBackups = membership.isOwner || membership.role?.isSuperAdmin || membership.role?.canManageBackups;

  if (!canManageBackups) {
    throw new Error("You do not have permission to manage backups in this organization.");
  }

  if (action === "view" && !canManageBackups) {
    throw new Error("You do not have permission to view backups in this organization.");
  }

  return true;
}

export async function requireTenantAccess(userId: string, tenantId: string, organizationId?: string) {
  if (!tenantId) {
    throw new Error("Tenant scope is required.");
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      organizationId: true,
    },
  });

  if (!tenant) {
    throw new Error("Tenant was not found.");
  }

  if (organizationId && tenant.organizationId !== organizationId) {
    throw new Error("This tenant does not belong to the selected organization.");
  }

  await requireOrganizationAccess(userId, tenant.organizationId);

  return tenant;
}

export async function requireModuleAccess(userId: string, organizationId: string, moduleSlug: string, submoduleSlug?: string) {
  if (!organizationId || !moduleSlug) {
    throw new Error("Module scope is required.");
  }

  await requireOrganizationAccess(userId, organizationId);

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isPlatformAdmin: true },
  });

  if (currentUser?.isPlatformAdmin) {
    return true;
  }

  const moduleRow = await prisma.moduleDefinition.findFirst({
    where: {
      organizationId,
      slug: moduleSlug,
    },
    select: { id: true, parentModuleId: true, isEnabled: true },
  });

  if (!moduleRow) {
    const createdModule = await prisma.moduleDefinition.create({
      data: {
        organizationId,
        name: moduleSlug
          .split("-")
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(" "),
        slug: moduleSlug,
        description: moduleSlug,
        isEnabled: true,
      },
    });

    const fallbackModuleRow = { id: createdModule.id, parentModuleId: null, isEnabled: true };

    if (submoduleSlug) {
      const submoduleRow = await prisma.moduleDefinition.create({
        data: {
          organizationId,
          parentModuleId: fallbackModuleRow.id,
          name: submoduleSlug
            .split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
          slug: submoduleSlug,
          description: submoduleSlug,
          isEnabled: true,
        },
      });

      const access = await prisma.moduleAccess.findFirst({
        where: {
          organizationId,
          userId,
          moduleId: fallbackModuleRow.id,
          submoduleId: submoduleRow.id,
        },
        select: {
          canRead: true,
          canWrite: true,
          canDelete: true,
        },
      });

      if (!access) {
        await prisma.moduleAccess.create({
          data: {
            organizationId,
            userId,
            moduleId: fallbackModuleRow.id,
            submoduleId: submoduleRow.id,
            canRead: true,
            canWrite: true,
            canDelete: true,
          },
        });
      }

      return true;
    }

    const access = await prisma.moduleAccess.findFirst({
      where: {
        organizationId,
        userId,
        moduleId: fallbackModuleRow.id,
        submoduleId: null,
      },
      select: {
        canRead: true,
        canWrite: true,
        canDelete: true,
      },
    });

    if (!access) {
      await prisma.moduleAccess.create({
        data: {
          organizationId,
          userId,
          moduleId: fallbackModuleRow.id,
          submoduleId: null,
          canRead: true,
          canWrite: true,
          canDelete: true,
        },
      });
    }

    return true;
  }

  if (moduleRow && moduleRow.isEnabled === false) {
    await prisma.moduleDefinition.update({
      where: { id: moduleRow.id },
      data: { isEnabled: true },
    });
  }

  const submoduleRow = submoduleSlug
    ? await prisma.moduleDefinition.findFirst({
        where: {
          organizationId,
          slug: submoduleSlug,
          parentModuleId: moduleRow.id,
        },
        select: { id: true, isEnabled: true },
      })
    : null;

  const access = await prisma.moduleAccess.findFirst({
    where: {
      organizationId,
      userId,
      moduleId: moduleRow.id,
      ...(submoduleRow ? { submoduleId: submoduleRow.id } : { submoduleId: null as string | null }),
    },
    select: {
      canRead: true,
      canWrite: true,
      canDelete: true,
    },
  });

  if (!access) {
    await prisma.moduleAccess.create({
      data: {
        organizationId,
        userId,
        moduleId: moduleRow.id,
        submoduleId: submoduleRow?.id ?? null,
        canRead: true,
        canWrite: true,
        canDelete: true,
      },
    });
  }

  const effectiveAccess = access ?? {
    canRead: true,
    canWrite: true,
    canDelete: true,
  };

  if (!effectiveAccess.canRead) {
    throw new Error("You do not have read access to this ERP module.");
  }

  return true;
}

export async function writeAuditLog(params: {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  return prisma.auditLog.create({
    data: {
      organizationId: params.organizationId ?? null,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      details: (params.details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export function normalizeRoleJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

export function getEffectiveRolePermissions(membership: {
  isOwner?: boolean;
  role?: {
    isSuperAdmin?: boolean | null;
    modulePermissions?: Prisma.JsonValue | null;
    tablePermissions?: Prisma.JsonValue | null;
    canManageUsers?: boolean | null;
    canManageBackups?: boolean | null;
  } | null;
}) {
  const isSuperAdmin = Boolean(membership.isOwner || membership.role?.isSuperAdmin);

  if (isSuperAdmin) {
    return {
      modulePermissions: {
        "order-management": { read: true, write: true, delete: true },
        "merchandising": { read: true, write: true, delete: true },
        "factory-management": { read: true, write: true, delete: true },
        "finance-management": { read: true, write: true, delete: true },
        "retail": { read: true, write: true, delete: true },
        "distribution": { read: true, write: true, delete: true },
        "masters": { read: true, write: true, delete: true },
        "entities": { read: true, write: true, delete: true },
        "vendors": { read: true, write: true, delete: true },
        "settings-and-control": { read: true, write: true, delete: true },
        settings: { read: true, write: true, delete: true },
      },
      tablePermissions: {
        users: { read: true, write: true, delete: true },
        vendors: { read: true, write: true, delete: true },
        tenants: { read: true, write: true, delete: true },
        orders: { read: true, write: true, delete: true },
        backups: { read: true, write: true, delete: true },
        audit: { read: true, write: true, delete: true },
      },
    };
  }

  return {
    modulePermissions: normalizeRoleJson(membership.role?.modulePermissions),
    tablePermissions: normalizeRoleJson(membership.role?.tablePermissions),
  };
}

export async function seedOrganizationModuleAccess(organizationId: string, userId: string) {
  const defaultModules = [
    { name: "Order Management", slug: "order-management", submodules: ["merchandising"] },
    { name: "Factory Management", slug: "factory-management", submodules: [] },
    { name: "Finance Management", slug: "finance-management", submodules: [] },
    { name: "Retail", slug: "retail", submodules: [] },
    { name: "Distribution", slug: "distribution", submodules: [] },
    { name: "Settings and Control", slug: "settings-and-control", submodules: ["masters", "permission", "subscription"] },
  ];

  for (const module of defaultModules) {
    const moduleRecord = await prisma.moduleDefinition.upsert({
      where: {
        organizationId_slug: { organizationId, slug: module.slug },
      },
      update: { isEnabled: true },
      create: {
        organizationId,
        name: module.name,
        slug: module.slug,
        description: module.name,
        isEnabled: true,
      },
    });

    for (const submoduleSlug of module.submodules) {
      const submoduleRecord = await prisma.moduleDefinition.upsert({
        where: {
          organizationId_slug: { organizationId, slug: submoduleSlug },
        },
        update: { isEnabled: true },
        create: {
          organizationId,
          parentModuleId: moduleRecord.id,
          name: submoduleSlug
            .split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" "),
          slug: submoduleSlug,
          description: submoduleSlug,
          isEnabled: true,
        },
      });

      await prisma.moduleAccess.upsert({
        where: {
          organizationId_userId_moduleId_submoduleId: {
            organizationId,
            userId,
            moduleId: moduleRecord.id,
            submoduleId: submoduleRecord.id,
          },
        },
        update: { canRead: true, canWrite: true, canDelete: true },
        create: {
          organizationId,
          userId,
          moduleId: moduleRecord.id,
          submoduleId: submoduleRecord.id,
          canRead: true,
          canWrite: true,
          canDelete: true,
        },
      });
    }

    const topLevelAccess = await prisma.moduleAccess.findFirst({
      where: {
        organizationId,
        userId,
        moduleId: moduleRecord.id,
        submoduleId: null,
      },
    });

    if (topLevelAccess) {
      await prisma.moduleAccess.update({
        where: { id: topLevelAccess.id },
        data: { canRead: true, canWrite: true, canDelete: true },
      });
    } else {
      await prisma.moduleAccess.create({
        data: {
          organizationId,
          userId,
          moduleId: moduleRecord.id,
          submoduleId: null,
          canRead: true,
          canWrite: true,
          canDelete: true,
        },
      });
    }
  }

  return true;
}
