import { randomUUID } from "node:crypto";
import { getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";
import { prisma } from "@/lib/database/prisma-client";
import { ensureStandardPlansForBusinessTypes } from "@/lib/services/platform/subscription-service";

export async function listBusinessTypes() {
  return prisma.businessType.findMany({
    orderBy: { name: "asc" },
  });
}

export async function listActiveBusinessTypes() {
  return prisma.businessType.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function getBusinessType(id: string) {
  return prisma.businessType.findUnique({ where: { id } });
}

export async function createBusinessType(input: {
  name: string;
  description?: string;
}) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Business type name is required.");
  }
  if (!getErpModuleForBusinessTypeName(name)) {
    throw new Error("Use one of the configured ERP Business Type names.");
  }

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.businessType.findUnique({
      where: { name },
    });

    if (existing) {
      throw new Error("A business type with this name already exists.");
    }

    const businessType = await transaction.businessType.create({
      data: {
        name,
        description: input.description?.trim() || null,
      },
    });

    await ensureStandardPlansForBusinessTypes(transaction);

    return businessType;
  }, { timeout: 15000 });
}

export async function updateBusinessTypeStatus(id: string, isActive: boolean) {
  return prisma.businessType.update({
    where: { id },
    data: { isActive },
  });
}

export async function deleteBusinessType(id: string) {
  return prisma.businessType.delete({
    where: { id },
  });
}

export async function createBusinessTypeSidebarModule(id: string) {
  const businessType = await prisma.businessType.findUnique({ where: { id } });
  const erpModule = businessType
    ? getErpModuleForBusinessTypeName(businessType.name)
    : null;

  if (!businessType || !erpModule) {
    throw new Error("This Business Type does not have a configured ERP sidebar module.");
  }

  return prisma.$transaction(async (transaction) => {
    const softwareRecords = await transaction.eRPSoftware.findMany({
      select: { id: true },
    });

    await Promise.all(
      softwareRecords.map((software) =>
        transaction.eRPModule.upsert({
          where: {
            software_id_module_key: {
              software_id: software.id,
              module_key: erpModule.key,
            },
          },
          create: {
            module_id: randomUUID(),
            software_id: software.id,
            module_key: erpModule.key,
            module_name: erpModule.label,
            status: "enabled",
          },
          update: {
            module_name: erpModule.label,
            status: "enabled",
          },
        }),
      ),
    );

    return businessType;
  });
}