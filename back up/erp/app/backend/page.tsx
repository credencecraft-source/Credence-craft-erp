import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { parseSessionToken } from "../lib/auth";
import { prisma } from "../lib/bootstrap/prisma";
import { BackendDashboardClient } from "./BackendDashboardClient";

export const dynamic = "force-dynamic";

async function getBackendUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("erp_backend_session")?.value;
  const session = parseSessionToken(token);

  if (!session) {
    return null;
  }

  const user = await prisma.backendAdmin.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return user;
}

export default async function BackendDashboardPage() {
  const user = await getBackendUser();

  if (!user) {
    redirect("/backend/login");
  }

  const [backendAdmins, organizations, tenants, organizationMemberships, allUsers] = await Promise.all([
    prisma.backendAdmin.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        shortCode: true,
        status: true,
        createdAt: true,
        workspace: { select: { id: true, name: true, slug: true } },
        creator: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.tenant.findMany({
      include: {
        organization: {
          select: { id: true, name: true, shortCode: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organizationUser.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            profileName: true,
            isPlatformAdmin: true,
          },
        },
        organization: {
          select: { id: true, name: true },
        },
        role: {
          select: { id: true, name: true, isSuperAdmin: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        profileName: true,
        isPlatformAdmin: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const organizationCountByUser = organizationMemberships.reduce<Record<string, number>>((totals, membership) => {
    totals[membership.userId] = (totals[membership.userId] ?? 0) + 1;
    return totals;
  }, {});

  const workspaceUsers = allUsers.map((userItem) => ({
    ...userItem,
    profileName: userItem.profileName ?? userItem.name,
    isPlatformAdmin: Boolean(userItem.isPlatformAdmin),
    roleLabel: "Workspace user",
    organizationCount: organizationCountByUser[userItem.id] ?? 0,
  }));

  const normalizedBackendAdmins = backendAdmins.map((admin) => ({
    ...admin,
    profileName: admin.name,
    isPlatformAdmin: true,
  }));

  const tableStatDefinitions: Array<{ name: string; description: string; model: any }> = [
    { name: "User", description: "Workspace users with login and profile information.", model: prisma.user },
    { name: "BackendAdmin", description: "Dedicated backend admin credentials and access records.", model: prisma.backendAdmin },
    { name: "Workspace", description: "Workspace-level containers owned by users.", model: prisma.workspace },
    { name: "Role", description: "Organization roles and permission definitions.", model: prisma.role },
    { name: "Organization", description: "Business organizations registered in the platform.", model: prisma.organization },
    { name: "OrganizationUser", description: "Membership records linking users to organizations.", model: prisma.organizationUser },
    { name: "Subscription", description: "Organization module subscription and pricing data.", model: prisma.subscription },
    { name: "BackupRecord", description: "Organization backup metadata and restore references.", model: prisma.backupRecord },
    { name: "OtpRequest", description: "OTP request records used during user verification.", model: prisma.otpRequest },
    { name: "Tenant", description: "Tenant records associated with an organization.", model: prisma.tenant },
    { name: "Vendor", description: "Vendor records linked to tenants and organizations.", model: prisma.vendor },
    { name: "GstState", description: "GST state master data used by tenants and vendors.", model: prisma.gstState },
    { name: "GstFetchUsage", description: "GST fetch usage tracking for tenant records.", model: prisma.gstFetchUsage },
    { name: "Order", description: "Purchase and order master records for organizations.", model: prisma.order },
    { name: "OrderItem", description: "Line items belonging to an order.", model: prisma.orderItem },
    { name: "ModuleDefinition", description: "Module metadata and hierarchy for organization features.", model: prisma.moduleDefinition },
    { name: "ModuleAccess", description: "Per-user module access permissions for organization modules.", model: prisma.moduleAccess },
    { name: "AuditLog", description: "Audit trail of actions performed across the platform.", model: prisma.auditLog },
  ];

  const tableStats = await Promise.all(
    tableStatDefinitions.map(async (table) => ({
      name: table.name,
      description: table.description,
      recordCount: await (table.model as any).count(),
    }))
  );

  return (
    <BackendDashboardClient
      user={{
        ...user,
        profileName: user.name,
        isPlatformAdmin: true,
      }}
      users={normalizedBackendAdmins}
      workspaceUsers={workspaceUsers}
      organizations={organizations}
      tenants={tenants}
      tableStats={tableStats}
    />
  );
}
