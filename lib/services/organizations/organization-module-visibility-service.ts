import { Prisma } from "@prisma/client";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

const ORGANIZATION_VISIBLE_SETTING = "organization_visible";

export class OrganizationModuleVisibilityError extends Error {}

export function isOrganizationModuleVisible(settings: Prisma.JsonValue | null) {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    return true;
  }
  return settings[ORGANIZATION_VISIBLE_SETTING] !== false;
}

export function isOrganizationModuleAvailable(status: string, isVisible: boolean) {
  return status.trim().toLowerCase() === "enabled" && isVisible;
}

export function getFirstAvailableOrganizationModulePath(
  moduleStatuses: Array<{ moduleKey: string; status: string; isVisible: boolean }>,
) {
  const availableModule = ERP_MODULES.find(({ key }) => {
    const moduleStatus = moduleStatuses.find(({ moduleKey }) => moduleKey === key);
    return moduleStatus
      ? isOrganizationModuleAvailable(moduleStatus.status, moduleStatus.isVisible)
      : false;
  });
  if (!availableModule) return null;

  const firstNavigationPath = (
    children: typeof availableModule.children,
    parentPath: string,
  ): string | null => {
    for (const child of children) {
      const childPath = child.href ?? `${parentPath}/${child.pathSegment || child.key}`;
      if (child.children?.length) {
        const nestedPath = firstNavigationPath(child.children, childPath);
        if (nestedPath) return nestedPath;
      } else {
        return childPath;
      }
    }
    return null;
  };

  return firstNavigationPath(availableModule.children, `/${availableModule.pathSegment}`)
    ?? `/${availableModule.pathSegment}`;
}

export async function setOrganizationModuleVisibility(
  workspaceUserId: string,
  routeOrganizationId: string,
  moduleKey: string,
  isVisible: boolean,
) {
  if (typeof moduleKey !== "string" || !ERP_MODULES.some(({ key }) => key === moduleKey)) {
    throw new OrganizationModuleVisibilityError("Select a valid ERP module.");
  }
  if (typeof isVisible !== "boolean") {
    throw new OrganizationModuleVisibilityError("Choose whether the module should be visible.");
  }

  const membership = await requireOrganizationPermission(
    workspaceUserId,
    routeOrganizationId,
    "ORGANIZATION_SETTINGS",
  );

  return prisma.$transaction(async (transaction) => {
    const moduleRecord = await transaction.eRPModule.findFirst({
      where: {
        module_key: moduleKey,
        software: { is: { organization_id: membership.organization_id } },
      },
      select: { id: true, module_key: true, module_name: true, status: true, settings: true },
    });

    if (!moduleRecord) {
      throw new OrganizationModuleVisibilityError("This module is not available for the organization.");
    }
    if (moduleRecord.status.trim().toLowerCase() !== "enabled") {
      throw new OrganizationModuleVisibilityError("Only platform-enabled modules can be shown to organization users.");
    }

    const previousVisibility = isOrganizationModuleVisible(moduleRecord.settings);
    if (previousVisibility === isVisible) {
      return { changed: false, isVisible };
    }

    const existingSettings = typeof moduleRecord.settings === "object"
      && moduleRecord.settings !== null
      && !Array.isArray(moduleRecord.settings)
      ? moduleRecord.settings as Prisma.InputJsonObject
      : {};

    await transaction.eRPModule.update({
      where: { id: moduleRecord.id },
      data: {
        settings: {
          ...existingSettings,
          [ORGANIZATION_VISIBLE_SETTING]: isVisible,
        },
      },
    });

    await transaction.auditEvent.create({
      data: {
        organization_id: membership.organization_id,
        user_id: workspaceUserId,
        module: "organization-settings",
        action: "ORGANIZATION_MODULE_VISIBILITY_UPDATED",
        entity_type: "ERPModule",
        entity_id: moduleRecord.id,
        details: {
          moduleKey: moduleRecord.module_key,
          moduleName: moduleRecord.module_name,
          previousVisibility,
          newVisibility: isVisible,
        },
      },
    });

    return { changed: true, isVisible };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
