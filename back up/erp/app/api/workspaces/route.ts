import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../lib/bootstrap/prisma";
import { getCurrentUser, seedOrganizationModuleAccess, withUniqueProfileName } from "../../lib/auth";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ data: [], ownedOrganizations: [], sharedOrganizations: [], workspace: null, error: "Unauthorized." }, { status: 401 });
    }

    const organizations = await prisma.organization.findMany({
      where: { createdBy: currentUser.id },
      select: {
        id: true,
        name: true,
        status: true,
        createdBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      data: organizations,
      ownedOrganizations: organizations,
      sharedOrganizations: [],
      workspace: null,
    });
  } catch (error) {
    return NextResponse.json({
      data: [],
      ownedOrganizations: [],
      sharedOrganizations: [],
      workspace: null,
      error: error instanceof Error ? error.message : "Database unavailable.",
    }, { status: 500 });
  }
}

const buildDefaultModulePermissions = () => ({
  "order-management": { read: true, write: true, delete: true },
  merchandising: { read: true, write: true, delete: true },
  purchase: { read: true, write: true, delete: true },
  "factory-management": { read: true, write: true, delete: true },
  "finance-management": { read: true, write: true, delete: true },
  retail: { read: true, write: true, delete: true },
  distribution: { read: true, write: true, delete: true },
  "settings-and-control": { read: true, write: true, delete: true },
  masters: { read: true, write: true, delete: true },
  permission: { read: true, write: true, delete: true },
  subscription: { read: true, write: true, delete: true },
  entities: { read: true, write: true, delete: true },
  vendors: { read: true, write: true, delete: true },
  settings: { read: true, write: true, delete: true },
});

const buildDefaultTablePermissions = () => ({
  users: { read: true, write: true, delete: true },
  vendors: { read: true, write: true, delete: true },
  tenants: { read: true, write: true, delete: true },
  orders: { read: true, write: true, delete: true },
  subscriptions: { read: true, write: true, delete: true },
  backups: { read: true, write: true, delete: true },
  audit: { read: true, write: true, delete: true },
  permissions: { read: true, write: true, delete: true },
});

async function resolveUniqueShortCode(candidate: string) {
  const normalized = candidate.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);

  if (!normalized) {
    return null;
  }

  let nextCode = normalized;
  let suffix = 2;

  while (true) {
    const existing = await prisma.organization.findFirst({
      where: { shortCode: nextCode },
      select: { id: true },
    });

    if (!existing) {
      return nextCode;
    }

    nextCode = `${normalized}${suffix}`;
    suffix += 1;
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Missing DATABASE_URL in environment." }, { status: 500 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const shortCode = typeof body.shortCode === "string" ? body.shortCode.trim() : "";
    const resolvedShortCode = shortCode ? await resolveUniqueShortCode(shortCode) : null;
    const primaryContactName = typeof body.primaryContactName === "string" ? body.primaryContactName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : currentUser.email;

    if (!name) {
      return NextResponse.json({ error: "Organization name is required." }, { status: 400 });
    }

    const normalizedName = name.trim();
    const existingOrganization = await prisma.organization.findFirst({
      where: {
        createdBy: currentUser.id,
        name: { equals: normalizedName, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });

    if (existingOrganization) {
      return NextResponse.json({ error: "You already have an organization with this name." }, { status: 409 });
    }

    const fallbackUserName = primaryContactName || currentUser.name || "Workspace Admin";
    const ownerUserId = currentUser.id;

    const workspaceName = (currentUser.profileName || currentUser.name || fallbackUserName || "Workspace Admin").trim() || "Workspace Admin";
    const workspaceSlug = workspaceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace";

    const workspace = await prisma.workspace.upsert({
      where: { slug: workspaceSlug },
      update: {
        name: workspaceName,
      },
      create: {
        name: workspaceName,
        slug: workspaceSlug,
        ownerId: ownerUserId,
      },
    });

    const organization = await prisma.organization.create({
      data: {
        workspaceId: workspace.id,
        name,
        shortCode: resolvedShortCode ?? undefined,
        businessType: typeof body.businessType === "string" ? body.businessType : null,
        location: typeof body.location === "string" ? body.location : null,
        createdBy: ownerUserId,
      },
    });

    const roles = await prisma.role.createManyAndReturn({
      data: [
        {
          organizationId: organization.id,
          name: "Super Admin",
          isSuperAdmin: true,
          canManageUsers: true,
          canManageSubscriptions: true,
          canManageBackups: true,
          modulePermissions: buildDefaultModulePermissions(),
          tablePermissions: buildDefaultTablePermissions(),
        },
        {
          organizationId: organization.id,
          name: "Admin",
          isSuperAdmin: false,
          canManageUsers: true,
          canManageSubscriptions: true,
          canManageBackups: true,
          modulePermissions: buildDefaultModulePermissions(),
          tablePermissions: buildDefaultTablePermissions(),
        },
      ],
    });

    const superAdminRole = roles.find((role) => role.name === "Super Admin");

    await prisma.organizationUser.create({
      data: {
        userId: ownerUserId,
        organizationId: organization.id,
        roleId: superAdminRole?.id ?? null,
        isOwner: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        userId: ownerUserId,
        action: "organization_created",
        entityType: "Organization",
        entityId: organization.id,
        details: { name: organization.name },
      },
    });

    await seedOrganizationModuleAccess(organization.id, ownerUserId);

    await prisma.subscription.createMany({
      data: [
        {
          organizationId: organization.id,
          moduleName: "Order Management",
          yearlyAmount: 6000,
          usersIncluded: 5,
          extraUserPrice: 1000,
        },
        {
          organizationId: organization.id,
          moduleName: "Factory Management",
          yearlyAmount: 10000,
          usersIncluded: 5,
          extraUserPrice: 1000,
        },
      ],
    });

    return NextResponse.json({
      message: "Organization created successfully.",
      organization,
    }, { status: 201 });
  } catch (error) {
    console.error("Create organization failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create organization.",
      },
      { status: 500 }
    );
  }
}
