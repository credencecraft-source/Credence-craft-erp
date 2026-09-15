import { prisma } from "@/lib/database/prisma-client";

export async function listPlatformVersions() {
  return prisma.platformVersion.findMany({
    where: { is_active: true },
    orderBy: [{ created_at: "desc" }, { version_name: "desc" }],
    select: { id: true, version_name: true, description: true },
  });
}

export async function assignOrganizationPlatformVersion(organizationId: string, platformVersionId: string) {
  const version = await prisma.platformVersion.findFirst({
    where: { id: platformVersionId, is_active: true },
    select: { id: true },
  });
  if (!version) throw new Error("Select a valid active version.");

  return prisma.organization.update({
    where: { id: organizationId },
    data: { platform_version_id: version.id },
    include: { platformVersion: true },
  });
}

// "Clients" = organizations (each org carries its own plan + database assignment).
export async function listOrganizationClients(limit = 100) {
  const page = await listOrganizationClientsPage({ limit });
  return page.clients;
}

export async function listOrganizationClientsPage(options: { cursor?: string; limit?: number } = {}) {
  const take = Math.min(Math.max(options.limit ?? 100, 1), 100);
  const [clients, total] = await Promise.all([prisma.organization.findMany({
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    orderBy: { created_at: "desc" },
    include: {
      _count: {
        select: {
          merchandisingOrders: true,
          masterEntities: true,
          subscriptions: true,
          supportTickets: true,
        },
      },
      memberships: {
        where: {
          role: "OWNER",
          is_active: true,
        },
        take: 1,
        include: {
          workspaceUser: {
            select: {
              id: true,
              profile_name: true,
              full_name: true,
              email: true,
            },
          },
        },
      },
      plan: true,
      platformVersion: true,
      databaseConnection: {
        select: {
          id: true,
          connection_id: true,
          provider: true,
          connection_name: true,
          host: true,
          port: true,
          database_name: true,
          status: true,
          is_default: true,
        },
      },
    },
    take: take + 1,
  }), prisma.organization.count()]);

  const hasNextPage = clients.length > take;
  return {
    clients: hasNextPage ? clients.slice(0, take) : clients,
    total,
    nextCursor: hasNextPage ? clients[take - 1]?.id ?? null : null,
  };
}

export async function getOrganizationClient(organizationId: string) {
  return prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      _count: {
        select: {
          merchandisingOrders: true,
          masterEntities: true,
          subscriptions: true,
          supportTickets: true,
        },
      },
      memberships: {
        orderBy: [{ is_active: "desc" }, { created_at: "asc" }],
        include: {
          workspaceUser: {
            select: {
              full_name: true,
              email: true,
            },
          },
        },
      },
      plan: true,
      platformVersion: true,
      databaseConnection: {
        select: {
          provider: true,
          connection_name: true,
          host: true,
          port: true,
          database_name: true,
          status: true,
          is_default: true,
        },
      },
    },
  });
}
