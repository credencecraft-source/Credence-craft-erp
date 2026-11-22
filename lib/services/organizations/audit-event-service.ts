import { prisma } from "@/lib/database/prisma-client";
import type { Prisma } from "@prisma/client";

export type AuditEventInput = {
  organizationId: string;
  userId?: string | null;
  actorId?: string | null;
  sourceContext?: string | null;
  requestId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  changedFields?: string[] | null;
  module: string;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
};

type AuditEventDatabase = Pick<Prisma.TransactionClient, "auditEvent">;

export async function createAuditEvent(input: AuditEventInput, database: AuditEventDatabase = prisma) {
  return database.auditEvent.create({
    data: {
      organization_id: input.organizationId,
      user_id: input.userId ?? null,
      actor_id: input.actorId ?? input.userId ?? null,
      source_context: input.sourceContext?.trim().slice(0, 100) ?? null,
      request_id: input.requestId?.trim().slice(0, 160) ?? null,
      before_data: input.beforeData ? (input.beforeData as Prisma.InputJsonValue) : undefined,
      after_data: input.afterData ? (input.afterData as Prisma.InputJsonValue) : undefined,
      changed_fields: input.changedFields ? (input.changedFields as Prisma.InputJsonValue) : undefined,
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
