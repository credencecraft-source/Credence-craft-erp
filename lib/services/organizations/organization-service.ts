import { randomUUID } from "node:crypto";

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

function isMissingTableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message || "";
  return message.includes("does not exist") || message.includes("P2021") || message.includes("table") && message.includes("public");
}

export async function listOrganizationsForUser(workspaceUserId: string) {
  try {
    return await prisma.organization.findMany({
      where: {
        workspace_user_id: workspaceUserId,
        is_active: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });
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
          workspace_user_id: input.workspaceUserId,
          organization_name: validated.organizationName,
          gst_number: validated.gstNumber,
          address_line_1: validated.addressLine1 || null,
          address_line_2: validated.addressLine2 || null,
          city: validated.city || null,
          state: validated.state || null,
          country: validated.country || null,
          pin_code: validated.pinCode || null,
          is_active: true,
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
      workspace_user_id: workspaceUserId,
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

export async function deleteOrganization(organizationId: string, workspaceUserId: string) {
  const organization = await prisma.organization.findFirst({
    where: {
      id: organizationId,
      workspace_user_id: workspaceUserId,
    },
  });

  if (!organization) {
    throw new Error("Organization not found.");
  }

  await prisma.organization.delete({
    where: { id: organization.id },
  });

  return { deleted: true, organizationId: organization.organization_id };
}

export function normalizeOrganizationData(raw: OrganizationCreateInput) {
  return normalizeOrganizationInput(raw);
}