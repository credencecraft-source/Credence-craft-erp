import { prisma } from "@/lib/database/prisma-client";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";

export async function listPlatformVersions() {
  return prisma.platformVersion.findMany({
    where: { is_active: true },
    orderBy: [{ created_at: "desc" }, { version_name: "desc" }],
    select: { id: true, version_name: true, description: true },
  });
}

export async function assignOrganizationPlatformVersion(organizationId: string, platformVersionId: string) {
  const admin = await requirePlatformSessionAdmin();

  return prisma.$transaction(async (transaction) => {
    const [organization, version] = await Promise.all([
      transaction.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, platform_version_id: true },
      }),
      transaction.platformVersion.findFirst({
        where: { id: platformVersionId, is_active: true },
        select: { id: true },
      }),
    ]);
    if (!organization) throw new Error("Organization not found.");
    if (!version) throw new Error("Select a valid active version.");

    const segmentAssignments = await transaction.versionBusinessTypeSegment.findMany({
      where: { versionBusinessType: { is: { version_id: version.id } } },
      select: { id: true, price: true },
    });

    await transaction.organizationSegmentPrice.deleteMany({ where: { organization_id: organization.id } });
    const updatedOrganization = await transaction.organization.update({
      where: { id: organization.id },
      data: { platform_version_id: version.id },
      include: { platformVersion: true },
    });

    if (segmentAssignments.length > 0) {
      await transaction.organizationSegmentPrice.createMany({
        data: segmentAssignments.map((assignment) => ({
          organization_id: organization.id,
          version_business_type_segment_id: assignment.id,
          snapshot_price: assignment.price,
          updated_by_platform_admin_id: admin.id,
        })),
      });
    }

    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        module: "pricing",
        action: "VERSION_PRICE_SNAPSHOT_RESET",
        entity_type: "Organization",
        entity_id: organization.id,
        details: {
          platformAdminId: admin.id,
          previousVersionId: organization.platform_version_id,
          assignedVersionId: version.id,
          segmentCount: segmentAssignments.length,
        },
      },
    });

    return updatedOrganization;
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
  const visibleClients = hasNextPage ? clients.slice(0, take) : clients;
  const customPriceRows = visibleClients.length > 0
    ? await prisma.organizationSegmentPrice.findMany({
        where: {
          organization_id: { in: visibleClients.map(({ id }) => id) },
          custom_price: { not: null },
        },
        select: {
          organization_id: true,
          versionBusinessTypeSegment: {
            select: { versionBusinessType: { select: { version_id: true } } },
          },
        },
      })
    : [];
  const versionByOrganization = new Map(visibleClients.map(({ id, platform_version_id }) => [id, platform_version_id]));
  const organizationsWithCustomPrice = new Set(
    customPriceRows
      .filter((row) => versionByOrganization.get(row.organization_id) === row.versionBusinessTypeSegment.versionBusinessType.version_id)
      .map((row) => row.organization_id),
  );

  return {
    clients: visibleClients.map((client) => ({
      ...client,
      hasCustomSegmentPricing: organizationsWithCustomPrice.has(client.id),
    })),
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
