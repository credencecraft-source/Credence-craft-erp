import { Prisma } from "@prisma/client";
import {
  ERP_MODULES,
  getErpBusinessTypeDisplayName,
  getErpModuleForBusinessTypeName,
} from "@/components/erp/erp-config-registry";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export class OrganizationModuleVisibilityError extends Error {}

type OrganizationModuleOption = {
  key: string;
  label: string;
};

async function getOrganizationModuleCatalog(): Promise<OrganizationModuleOption[]> {
  const businessTypes = await prisma.businessType.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  if (businessTypes.length === 0) {
    return ERP_MODULES.map(({ key, label }) => ({ key, label }));
  }

  const options = new Map<string, OrganizationModuleOption>();
  for (const businessType of businessTypes) {
    const displayName = businessType.name.trim().toLowerCase() === "settings"
      ? "Admin"
      : getErpBusinessTypeDisplayName(businessType.name);
    const erpModule = getErpModuleForBusinessTypeName(displayName);
    if (!erpModule || options.has(erpModule.key)) continue;
    options.set(erpModule.key, { key: erpModule.key, label: displayName });
  }

  if (options.has("order-management") && !options.has("asset-management")) {
    const assetManagement = ERP_MODULES.find(({ key }) => key === "asset-management");
    if (assetManagement) {
      options.set(assetManagement.key, {
        key: assetManagement.key,
        label: assetManagement.label,
      });
    }
  }

  return [...options.values()];
}

export async function getOrganizationModuleVisibility(organizationId: string) {
  await requirePlatformSessionAdmin();

  const [organization, catalog] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    }),
    getOrganizationModuleCatalog(),
  ]);
  if (!organization) {
    throw new OrganizationModuleVisibilityError("Organization not found.");
  }

  const software = await prisma.eRPSoftware.findFirst({
    where: { organization_id: organization.id },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });
  const storedModules = software
    ? await prisma.eRPModule.findMany({
        where: { software_id: software.id },
        select: { module_key: true, status: true },
      })
    : [];
  const statusByKey = new Map(storedModules.map(({ module_key, status }) => [module_key, status]));

  return catalog.map((moduleOption) => ({
    ...moduleOption,
    isEnabled: statusByKey.get(moduleOption.key)?.trim().toLowerCase() === "enabled",
  }));
}

export async function setOrganizationModuleVisibility(
  organizationId: string,
  moduleKey: string,
  isEnabled: boolean,
) {
  const admin = await requirePlatformSessionAdmin();
  if (typeof isEnabled !== "boolean") {
    throw new OrganizationModuleVisibilityError("Choose whether the module should be visible.");
  }

  const catalog = await getOrganizationModuleCatalog();
  const selectedModule = catalog.find((item) => item.key === moduleKey);
  if (!selectedModule) {
    throw new OrganizationModuleVisibilityError("Select an available organization module.");
  }

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) {
      throw new OrganizationModuleVisibilityError("Organization not found.");
    }

    let software = await transaction.eRPSoftware.findFirst({
      where: { organization_id: organization.id },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    const storedModules = software
      ? await transaction.eRPModule.findMany({
          where: { software_id: software.id },
          select: { id: true, module_key: true, status: true },
        })
      : [];
    const storedByKey = new Map(storedModules.map((storedModule) => [
      storedModule.module_key,
      storedModule,
    ]));
    const currentModule = storedByKey.get(selectedModule.key);
    const currentlyEnabled = currentModule
      ? currentModule.status.trim().toLowerCase() === "enabled"
      : false;

    if (currentlyEnabled === isEnabled) {
      return { changed: false, isEnabled };
    }

    if (!software) {
      software = await transaction.eRPSoftware.create({
        data: {
          organization_id: organization.id,
          software_name: "ERP Software",
          status: "active",
        },
        select: { id: true },
      });
    }

    const updatedModule = await transaction.eRPModule.upsert({
      where: {
        software_id_module_key: {
          software_id: software.id,
          module_key: selectedModule.key,
        },
      },
      create: {
        software_id: software.id,
        module_key: selectedModule.key,
        module_name: selectedModule.label,
        status: isEnabled ? "enabled" : "disabled",
      },
      update: {
        module_name: selectedModule.label,
        status: isEnabled ? "enabled" : "disabled",
      },
      select: { id: true },
    });

    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        module: "organization-settings",
        action: "MODULE_VISIBILITY_UPDATED",
        entity_type: "ERPModule",
        entity_id: updatedModule.id,
        details: {
          platformAdminId: admin.id,
          moduleKey: selectedModule.key,
          previousStatus: currentlyEnabled ? "enabled" : "disabled",
          newStatus: isEnabled ? "enabled" : "disabled",
        },
      },
    });

    return { changed: true, isEnabled };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
