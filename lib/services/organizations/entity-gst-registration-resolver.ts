import type { Prisma } from "@prisma/client";

export async function getEntityGstRegistrationForDate(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  entityId: string,
  effectiveDate = new Date(),
) {
  const entity = await transaction.masterEntity.findFirst({
    where: { id: entityId, organization_id: organizationId },
    select: { gstin: true, registered_state: true },
  });
  if (entity?.gstin && entity.registered_state) {
    return {
      gstin: entity.gstin,
      registration_state: entity.registered_state,
    };
  }

  return transaction.entityGstRegistration.findFirst({
    where: {
      organization_id: organizationId,
      entity_id: entityId,
      is_active: true,
      effective_from: { lte: effectiveDate },
      OR: [{ effective_to: null }, { effective_to: { gte: effectiveDate } }],
    },
    orderBy: [{ effective_from: "desc" }, { created_at: "desc" }],
    select: {
      gstin: true,
      registration_state: true,
    },
  });
}
