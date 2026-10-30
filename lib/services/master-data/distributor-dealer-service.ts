import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";

export type DistributorDealerRow = {
  id: string;
  code: string;
  legalName: string;
  displayName: string | null;
  isActive: boolean;
  commissionPercentage?: string | null;
};

export async function listDistributorDealers(
  organizationId: string,
  distributorId: string,
) {
  const mappings = await prisma.contactDistributorDealerAssignment.findMany({
    where: { organization_id: organizationId, distributor_id: distributorId },
    select: {
      id: true,
      dealer: {
        select: {
          id: true,
          code: true,
          legal_name: true,
          display_name: true,
          is_active: true,
        },
      },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });

  return mappings.map((mapping) => ({
    id: mapping.dealer.id,
    mappingId: mapping.id,
    code: mapping.dealer.code,
    legalName: mapping.dealer.legal_name,
    displayName: mapping.dealer.display_name,
    isActive: mapping.dealer.is_active,
  }));
}

export async function listAssignedDealerIds(
  organizationId: string,
  excludedDistributorId: string,
) {
  const [mappings, distributorAssignments] = await Promise.all([
    prisma.contactDistributorDealerAssignment.findMany({
    where: {
      organization_id: organizationId,
      distributor_id: { not: excludedDistributorId },
    },
    select: { dealer_id: true },
    distinct: ["dealer_id"],
    }),
    prisma.contactRoleAssignment.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        role_code: "DISTRIBUTOR",
      },
      select: { contact_id: true },
      distinct: ["contact_id"],
    }),
  ]);
  return [...new Set([
    ...mappings.map((mapping) => mapping.dealer_id),
    ...distributorAssignments.map((assignment) => assignment.contact_id),
  ])];
}

export async function replaceDistributorDealers(
  organizationId: string,
  actorUserId: string,
  distributorId: string,
  dealerIds: string[],
) {
  const uniqueDealerIds = [...new Set(dealerIds)].filter((id) => id && id !== distributorId).slice(0, 200);

  await prisma.$transaction(async (tx) => {
    const distributor = await tx.contact.findFirst({
      where: { organization_id: organizationId, id: distributorId, is_active: true },
      select: { id: true },
    });
    if (!distributor) throw new Error("Distributor contact not found.");

    const parentDealerAssignment = await tx.contactRoleAssignment.findFirst({
      where: {
        organization_id: organizationId,
        contact_id: distributorId,
        role_code: "DEALER",
        is_active: true,
      },
      select: { role_code: true },
    });
    if (parentDealerAssignment) {
      throw new Error("A Contact cannot be both Distributor and Dealer. Remove the Dealer role first.");
    }

    if (uniqueDealerIds.length) {
      const distributorAssignments = await tx.contactRoleAssignment.findMany({
        where: {
          organization_id: organizationId,
          contact_id: { in: uniqueDealerIds },
          role_code: "DISTRIBUTOR",
          is_active: true,
        },
        select: {
          contact: { select: { display_name: true, legal_name: true, code: true } },
        },
      });
      if (distributorAssignments.length) {
        const distributor = distributorAssignments[0].contact;
        const name = distributor.display_name || distributor.legal_name;
        throw new Error(`${name} (${distributor.code}) is already assigned the Distributor role and cannot be a Dealer.`);
      }

      const dealers = await tx.contact.findMany({
        where: { organization_id: organizationId, id: { in: uniqueDealerIds }, is_active: true },
        select: { id: true },
      });
      const foundIds = new Set(dealers.map((dealer) => dealer.id));
      if (foundIds.size !== uniqueDealerIds.length) {
        throw new Error("One or more selected Dealers are not available.");
      }

      const assignedElsewhere = await tx.contactDistributorDealerAssignment.findFirst({
        where: {
          organization_id: organizationId,
          dealer_id: { in: uniqueDealerIds },
          distributor_id: { not: distributorId },
        },
        select: {
          dealer: { select: { display_name: true, legal_name: true, code: true } },
        },
      });
      if (assignedElsewhere) {
        const dealerName = assignedElsewhere.dealer.display_name || assignedElsewhere.dealer.legal_name;
        throw new Error(`${dealerName} (${assignedElsewhere.dealer.code}) is already assigned to another Distributor.`);
      }
    }

    await tx.contactRoleAssignment.upsert({
      where: {
        organization_id_contact_id_role_code: {
          organization_id: organizationId,
          contact_id: distributorId,
          role_code: "DISTRIBUTOR",
        },
      },
      create: { organization_id: organizationId, contact_id: distributorId, role_code: "DISTRIBUTOR", is_active: true },
      update: { is_active: true },
    });

    if (uniqueDealerIds.length) {
      await tx.contactRoleAssignment.createMany({
        data: uniqueDealerIds.map((dealerId) => ({
          organization_id: organizationId,
          contact_id: dealerId,
          role_code: "DEALER",
          is_active: true,
        })),
        skipDuplicates: true,
      });
    }

    await tx.contactDistributorDealerAssignment.deleteMany({
      where: { organization_id: organizationId, distributor_id: distributorId },
    });
    if (uniqueDealerIds.length) {
      await tx.contactDistributorDealerAssignment.createMany({
        data: uniqueDealerIds.map((dealerId) => ({
          organization_id: organizationId,
          distributor_id: distributorId,
          dealer_id: dealerId,
        })),
      });
    }
  }, { maxWait: 10_000, timeout: 30_000 });

  await createAuditEvent({
    organizationId,
    userId: actorUserId,
    module: "MASTER_DATA",
    action: "DISTRIBUTOR_DEALERS_UPDATED",
    entityType: "Contact",
    entityId: distributorId,
    details: { dealerIds: uniqueDealerIds },
  });

  return listDistributorDealers(organizationId, distributorId);
}

export async function removeDistributorDealer(
  organizationId: string,
  actorUserId: string,
  distributorId: string,
  dealerId: string,
) {
  await prisma.contactDistributorDealerAssignment.deleteMany({
    where: { organization_id: organizationId, distributor_id: distributorId, dealer_id: dealerId },
  });
  await createAuditEvent({
    organizationId,
    userId: actorUserId,
    module: "MASTER_DATA",
    action: "DISTRIBUTOR_DEALER_REMOVED",
    entityType: "Contact",
    entityId: distributorId,
    details: { dealerId },
  });
  return listDistributorDealers(organizationId, distributorId);
}

export type RoleMappedContactRow = DistributorDealerRow;

export async function listRoleMappedContacts(
  organizationId: string,
  roleCode: string,
  parentContactId: string,
) {
  const mappings = await prisma.contactRoleMapping.findMany({
    where: { organization_id: organizationId, parent_role_code: roleCode, parent_contact_id: parentContactId },
    select: {
      id: true,
      commission_percentage: true,
      mapped_contact: {
        select: { id: true, code: true, legal_name: true, display_name: true, is_active: true },
      },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });
  return mappings.map((mapping) => ({
    id: mapping.mapped_contact.id,
    mappingId: mapping.id,
    code: mapping.mapped_contact.code,
    legalName: mapping.mapped_contact.legal_name,
    displayName: mapping.mapped_contact.display_name,
    isActive: mapping.mapped_contact.is_active,
    commissionPercentage: roleCode === "AGENT" ? mapping.commission_percentage.toString() : null,
  }));
}

export async function replaceRoleMappedContacts(
  organizationId: string,
  actorUserId: string,
  roleCode: "AGENT" | "DEALER",
  parentContactId: string,
  mappedContactIds: string[],
  commissionPercentage?: string | number | null,
) {
  if (roleCode !== "AGENT" && roleCode !== "DEALER") throw new Error("Unsupported role mapping.");
  const uniqueIds = [...new Set(mappedContactIds)].filter((id) => id && id !== parentContactId).slice(0, 200);
  let normalizedCommissionPercentage: string | undefined;
  if (roleCode === "AGENT" && commissionPercentage !== undefined && commissionPercentage !== null && commissionPercentage !== "") {
    const rawCommission = String(commissionPercentage).trim();
    if (!/^(?:100(?:\.0{1,2})?|(?:\d{1,2})(?:\.\d{1,2})?)$/.test(rawCommission)) {
      throw new Error("Commission percentage must be from 0 to 100 with at most two decimal places.");
    }
    normalizedCommissionPercentage = rawCommission;
  }

  await prisma.$transaction(async (tx) => {
    const parent = await tx.contact.findFirst({
      where: { organization_id: organizationId, id: parentContactId, is_active: true },
      select: { id: true },
    });
    if (!parent) throw new Error(`${roleCode === "AGENT" ? "Agent" : "Dealer"} contact not found.`);

    if (roleCode === "DEALER") {
      const parentDistributorAssignment = await tx.contactRoleAssignment.findFirst({
        where: {
          organization_id: organizationId,
          contact_id: parentContactId,
          role_code: "DISTRIBUTOR",
          is_active: true,
        },
        select: { role_code: true },
      });
      if (parentDistributorAssignment) {
        throw new Error("A Contact cannot be both Distributor and Dealer. Remove the Distributor role first.");
      }
    }

    if (uniqueIds.length) {
      const mappedContacts = await tx.contact.findMany({
        where: { organization_id: organizationId, id: { in: uniqueIds }, is_active: true },
        select: { id: true },
      });
      if (new Set(mappedContacts.map((contact) => contact.id)).size !== uniqueIds.length) {
        throw new Error("One or more selected Contacts are not available.");
      }
      if (roleCode === "DEALER") {
        const distributorAssignments = await tx.contactRoleAssignment.findMany({
          where: {
            organization_id: organizationId,
            contact_id: { in: uniqueIds },
            role_code: "DISTRIBUTOR",
            is_active: true,
          },
          select: { contact_id: true },
          take: 1,
        });
        if (distributorAssignments.length) {
          throw new Error("A Distributor Contact cannot be assigned as a Dealer.");
        }
      }
    }

    await tx.contactRoleAssignment.upsert({
      where: {
        organization_id_contact_id_role_code: {
          organization_id: organizationId,
          contact_id: parentContactId,
          role_code: roleCode,
        },
      },
      create: { organization_id: organizationId, contact_id: parentContactId, role_code: roleCode, is_active: true },
      update: { is_active: true },
    });

    const existingMappings = roleCode === "AGENT"
      ? await tx.contactRoleMapping.findMany({
          where: {
            organization_id: organizationId,
            parent_role_code: roleCode,
            parent_contact_id: parentContactId,
          },
          select: { mapped_contact_id: true, commission_percentage: true },
        })
      : [];
    const existingCommissionByContact = new Map(
      existingMappings.map((mapping) => [
        mapping.mapped_contact_id,
        mapping.commission_percentage.toString(),
      ]),
    );

    await tx.contactRoleMapping.deleteMany({
      where: { organization_id: organizationId, parent_role_code: roleCode, parent_contact_id: parentContactId },
    });
    if (uniqueIds.length) {
      await tx.contactRoleMapping.createMany({
        data: uniqueIds.map((mappedContactId) => ({
          organization_id: organizationId,
          parent_role_code: roleCode,
          parent_contact_id: parentContactId,
          mapped_contact_id: mappedContactId,
          ...(roleCode === "AGENT"
            ? { commission_percentage: existingCommissionByContact.get(mappedContactId) ?? normalizedCommissionPercentage ?? 0 }
            : {}),
        })),
      });
    }
  }, { maxWait: 10_000, timeout: 30_000 });

  await createAuditEvent({
    organizationId,
    userId: actorUserId,
    module: "MASTER_DATA",
    action: `${roleCode}_CONTACTS_UPDATED`,
    entityType: "Contact",
    entityId: parentContactId,
    details: { mappedContactIds: uniqueIds },
  });

  return listRoleMappedContacts(organizationId, roleCode, parentContactId);
}
