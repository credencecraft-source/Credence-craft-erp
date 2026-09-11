import { randomUUID } from "node:crypto";
import { OrganizationRole as PrismaOrganizationRole } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

import { normalizeOrganizationInput, validateOrganizationInput } from "./organization-validators";

export type OrganizationCreateInput = {
  workspaceUserId: string;
  organizationName: string;
  gstNumber: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  pinCode?: string;
};

export type OrganizationContext = {
  id: string;
  organizationId: string;
  membershipId: string;
  role: OrganizationRole;
};

export const ORGANIZATION_ROLES = ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING", "APPROVER", "VIEWER"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

function isMissingTableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message || "";
  return message.includes("does not exist") || message.includes("P2021") || message.includes("table") && message.includes("public");
}

export async function listOrganizationsForUser(workspaceUserId: string) {
  try {
    const organizations = await prisma.organization.findMany({
      where: {
        is_active: true,
        memberships: {
          some: {
            workspace_user_id: workspaceUserId,
            is_active: true,
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
      include: {
        memberships: {
          where: { workspace_user_id: workspaceUserId, is_active: true },
          select: { role: true },
          take: 1,
        },
      },
    });

    return organizations.map(({ memberships, ...organization }) => ({
      ...organization,
      membership_role: memberships[0]?.role ?? "VIEWER",
    }));
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }
}

export async function createOrganization(input: OrganizationCreateInput) {
  try {
    const validated = validateOrganizationInput({
      organizationName: input.organizationName,
      gstNumber: input.gstNumber,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      city: input.city,
      state: input.state,
      country: input.country,
      pinCode: input.pinCode,
    });

    return await prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: {
          organization_id: randomUUID(),
          organization_name: validated.organizationName,
          gst_number: validated.gstNumber,
          address_line_1: validated.addressLine1 || null,
          address_line_2: validated.addressLine2 || null,
          city: validated.city || null,
          state: validated.state || null,
          country: validated.country || null,
          pin_code: validated.pinCode || null,
          is_active: true,
          memberships: {
            create: {
              id: randomUUID(),
              workspace_user_id: input.workspaceUserId,
              role: PrismaOrganizationRole.OWNER,
            },
          },
        },
      });

      await transaction.eRPSoftware.create({
        data: {
          software_id: randomUUID(),
          organization_id: organization.id,
          software_name: "ERP Software",
          status: "active",
        },
      });

      return organization;
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Organization database table is not available yet. Run the Prisma migration or sync the database schema before creating organizations.");
    }

    throw error;
  }
}

export async function getOrganizationForUser(workspaceUserId: string, organizationId: string) {
  return prisma.organization.findFirst({
    where: {
      organization_id: organizationId,
      memberships: {
        some: {
          workspace_user_id: workspaceUserId,
          is_active: true,
        },
      },
    },
    include: {
      erpSoftware: {
        include: {
          modules: true,
        },
      },
    },
  });
}

export async function getOrganizationByPublicId(organizationId: string) {
  return prisma.organization.findUnique({
    where: { organization_id: organizationId },
    include: {
      erpSoftware: {
        include: {
          modules: true,
        },
      },
    },
  });
}

export async function deleteOrganization(organizationId: string, workspaceUserId: string) {
  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      memberships: {
        some: {
          workspace_user_id: workspaceUserId,
          is_active: true,
        },
      },
    },
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  const membership = await requireOrganizationAccess(workspaceUserId, organizationId, ["OWNER"]);
  const orgToDelete = await prisma.organization.findUnique({
    where: { id: membership.organization_id },
  });

  if (!orgToDelete) {
    throw new Error("Organization not found.");
  }

  await prisma.organization.delete({
    where: { id: orgToDelete.id },
  });

  return { deleted: true, organizationId: organization.organization_id };
}

export async function listOrganizationMembers(organizationId: string, workspaceUserId: string) {
  const membership = await requireOrganizationAccess(workspaceUserId, organizationId);

  return prisma.organizationMembership.findMany({
    where: {
      organization_id: membership.organization_id,
      is_active: true,
    },
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
    orderBy: { created_at: "asc" },
  });
}

export async function addOrganizationMember(input: {
  organizationId: string;
  workspaceUserId: string;
  role: OrganizationRole;
  actorUserId: string;
}) {
  const actorMembership = await requireOrganizationAccess(input.actorUserId, input.organizationId, ["OWNER", "ADMIN"]);

  return prisma.organizationMembership.create({
    data: {
      id: randomUUID(),
      organization_id: actorMembership.organization_id,
      workspace_user_id: input.workspaceUserId,
      role: input.role as PrismaOrganizationRole,
      is_active: true,
    },
  });
}

export async function updateOrganizationMember(
  membershipId: string,
  organizationId: string,
  actorUserId: string,
  data: { role?: OrganizationRole; is_active?: boolean }
) {
  const actorMembership = await requireOrganizationAccess(actorUserId, organizationId, ["OWNER", "ADMIN"]);

  return prisma.organizationMembership.update({
    where: { id: membershipId, organization_id: actorMembership.organization_id },
    data: {
      ...data,
      role: data.role as PrismaOrganizationRole | undefined,
    },
  });
}

export async function requireOrganizationAccess(
  workspaceUserId: string,
  organizationId: string,
  allowedRoles?: string[]
) {
  const membership = await prisma.organizationMembership.findFirst({
    where: {
      OR: [
        { organization_id: organizationId },
        { organization: { organization_id: organizationId } },
      ],
      workspace_user_id: workspaceUserId,
      is_active: true,
    },
  });

  if (!membership) {
    throw new Error("Access denied: You are not a member of this organization.");
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new Error("Access denied: Insufficient permissions.");
  }

  return membership;
}

export function normalizeOrganizationData(raw: OrganizationCreateInput) {
  return normalizeOrganizationInput(raw);
}

export async function requireOrganizationContext(
  workspaceUserId: string,
  publicOrganizationId: string,
  allowedRoles?: OrganizationRole[],
): Promise<OrganizationContext> {
  const organization = await prisma.organization.findFirst({
    where: {
      organization_id: publicOrganizationId,
      memberships: {
        some: {
          workspace_user_id: workspaceUserId,
          is_active: true,
          ...(allowedRoles ? { role: { in: allowedRoles as PrismaOrganizationRole[] } } : {}),
        },
      },
    },
    select: {
      id: true,
      organization_id: true,
      memberships: {
        where: { workspace_user_id: workspaceUserId, is_active: true },
        select: { id: true, role: true },
        take: 1,
      },
    },
  });

  const membership = organization?.memberships[0];
  if (!organization || !membership) {
    throw new Error("Access denied: organization not found or membership is inactive.");
  }

  if (allowedRoles && !allowedRoles.includes(membership.role as OrganizationRole)) {
    throw new Error("Access denied: insufficient organization permissions.");
  }

  return {
    id: organization.id,
    organizationId: organization.organization_id,
    membershipId: membership.id,
    role: membership.role as OrganizationRole,
  };
}