import { prisma } from "@/lib/database/prisma-client";

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
