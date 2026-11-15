import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

export async function requireActiveOrganizationEntity(
  organizationId: string,
  entityReference: string | null | undefined,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const reference = String(entityReference ?? "").trim();
  if (!reference) throw new Error("Entity is required to create an order.");

  const entity = await database.masterEntity.findFirst({
    where: {
      organization_id: organizationId,
      is_active: true,
      OR: [{ id: reference }, { value_id: reference }, { entity_name: reference }],
    },
    select: { id: true, entity_name: true },
  });

  if (!entity) throw new Error("Select an active Entity belonging to this organization.");
  return entity;
}

export function requireSameOrganizationEntity(
  entityIds: Array<string | null | undefined>,
  message: string,
) {
  const entityId = entityIds[0];
  if (!entityId || entityIds.some((candidate) => candidate !== entityId)) {
    throw new Error(message);
  }
  return entityId;
}