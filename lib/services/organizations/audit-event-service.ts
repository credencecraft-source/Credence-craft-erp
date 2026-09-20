import { prisma } from "@/lib/database/prisma-client";
import type { Prisma } from "@prisma/client";

export type AuditEventInput = {
  organizationId: string;
  userId?: string | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
};

export async function createAuditEvent(input: AuditEventInput) {
  return prisma.auditEvent.create({
    data: {
      organization_id: input.organizationId,
      user_id: input.userId ?? null,
      module: input.module.trim().slice(0, 100),
      action: input.action.trim().slice(0, 100),
      entity_type: input.entityType?.trim().slice(0, 150) ?? null,
      entity_id: input.entityId?.trim().slice(0, 255) ?? null,
      details: input.details ? (input.details as Prisma.InputJsonValue) : undefined,
    },
  });
}

export async function listAuditEvents(organizationId: string) {
  return prisma.auditEvent.findMany({
    where: { organization_id: organizationId },
    orderBy: { created_at: "desc" },
    take: 500,
    include: {
      user: {
        select: { id: true, full_name: true, email: true },
      },
    },
  });
}
