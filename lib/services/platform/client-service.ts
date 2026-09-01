import { prisma } from "@/lib/database/prisma-client";

// "Clients" = organizations (each org carries its own plan + database assignment).
export async function listOrganizationClients() {
  return prisma.organization.findMany({
    orderBy: { created_at: "desc" },
    include: {
      workspaceUser: true,
      plan: true,
      databaseConnection: true,
    },
  });
}
