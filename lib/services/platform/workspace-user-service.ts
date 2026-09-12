import { prisma } from "@/lib/database/prisma-client";

export async function listWorkspaceUsers() {
  return prisma.workspaceUser.findMany({
    orderBy: [{ created_at: "desc" }],
    include: {
      _count: {
        select: {
          organizationMemberships: {
            where: { is_active: true },
          },
        },
      },
    },
  });
}

export async function deleteInactiveWorkspaceUser(userId: string) {
  const user = await prisma.workspaceUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      _count: {
        select: {
          organizationMemberships: {
            where: { is_active: true },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error("Workspace user not found.");
  }

  if (user._count.organizationMemberships > 0) {
    throw new Error("Active workspace users cannot be deleted.");
  }

  await prisma.workspaceUser.delete({ where: { id: user.id } });
}