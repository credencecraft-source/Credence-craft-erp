import { prisma } from "@/lib/database/prisma-client";
import { listOrganizationsForUser } from "@/lib/services/organizations/organization-service";
import {
  organizationTableLabels,
  organizationUsageCountSelect,
  type OrganizationUsageStatistic,
} from "@/lib/services/organizations/organization-usage-statistics-service";

export type WorkspaceUsageStatistics = {
  organizationCount: number;
  statistics: OrganizationUsageStatistic[];
  totalRecords: number;
};

export async function getWorkspaceUsageStatistics(
  workspaceUserId: string,
): Promise<WorkspaceUsageStatistics> {
  const organizations = await listOrganizationsForUser(workspaceUserId);
  const organizationIds = organizations.map((organization) => organization.id);

  if (organizationIds.length === 0) {
    return {
      organizationCount: 0,
      statistics: Object.values(organizationTableLabels).map((tableName) => ({
        tableName,
        recordCount: 0,
      })),
      totalRecords: 0,
    };
  }

  const organizationsWithCounts = await prisma.organization.findMany({
    where: { id: { in: organizationIds }, is_active: true },
    select: { _count: { select: organizationUsageCountSelect } },
  });

  const statistics = Object.entries(organizationTableLabels).map(([key, tableName]) => ({
    tableName,
    recordCount: organizationsWithCounts.reduce(
      (total, organization) =>
        total + organization._count[key as keyof typeof organization._count],
      0,
    ),
  }));

  return {
    organizationCount: organizations.length,
    statistics,
    totalRecords: statistics.reduce((total, statistic) => total + statistic.recordCount, 0),
  };
}