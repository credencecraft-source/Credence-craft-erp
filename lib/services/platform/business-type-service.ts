import { prisma } from "@/lib/database/prisma-client";

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

export async function createBusinessType(input: {
  name: string;
  description?: string;
}) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Business type name is required.");
  }

  const existing = await prisma.businessType.findUnique({
    where: { name },
  });

  if (existing) {
    throw new Error("A business type with this name already exists.");
  }

  return prisma.businessType.create({
    data: {
      name,
      description: input.description,
    },
  });
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