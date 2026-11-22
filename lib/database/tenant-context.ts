import { Prisma, PrismaClient } from "@prisma/client";

export async function withTenantContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  actorId: string | null,
  sourceContext: string,
  requestId: string | null,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (!organizationId.trim()) {
    throw new Error("Tenant context requires an organization ID.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${organizationId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${actorId ?? ""}, true)`;
    await tx.$executeRaw`SELECT set_config('app.actor_type', ${actorId ? "USER" : "SYSTEM_JOB"}, true)`;
    await tx.$executeRaw`SELECT set_config('app.source_context', ${sourceContext}, true)`;
    await tx.$executeRaw`SELECT set_config('app.request_id', ${requestId ?? ""}, true)`;
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'false', true)`;
    return fn(tx);
  });
}
