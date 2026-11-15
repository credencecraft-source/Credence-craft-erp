import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { createStorageNode } from "@/lib/services/inventory/storage-node-service";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

const REGISTRATION_TYPES = [
  "REGULAR",
  "COMPOSITION",
  "SEZ",
  "CASUAL",
  "NON_RESIDENT",
  "TDS",
  "TCS",
  "ISD",
] as const;

export class EntityMasterArchitectureError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "EntityMasterArchitectureError";
  }
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new EntityMasterArchitectureError(`${label} is required.`);
  const text = normalizeUppercase(value.trim());
  if (!text) throw new EntityMasterArchitectureError(`${label} is required.`);
  if (text.length > maxLength) {
    throw new EntityMasterArchitectureError(`${label} must be ${maxLength} characters or fewer.`);
  }
  return text;
}

function parseDate(value: unknown, label: string, optional = false) {
  if (optional && (value === null || value === undefined || value === "")) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new EntityMasterArchitectureError(`${label} must be a valid calendar date.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new EntityMasterArchitectureError(`${label} must be a valid calendar date.`);
  }
  return parsed;
}

function validateGstin(value: unknown) {
  const gstin = requiredText(value, "GSTIN", 15);
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    throw new EntityMasterArchitectureError("Enter a valid GSTIN.");
  }
  return gstin;
}

function validateRegistrationType(value: unknown) {
  const registrationType = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!REGISTRATION_TYPES.includes(registrationType as (typeof REGISTRATION_TYPES)[number])) {
    throw new EntityMasterArchitectureError("Select a valid GST registration type.");
  }
  return registrationType;
}

async function findOrganizationEntity(organizationId: string, entityReference: string) {
  return prisma.masterEntity.findFirst({
    where: {
      organization_id: organizationId,
      OR: [{ id: entityReference }, { value_id: entityReference }],
    },
    select: { id: true, entity_name: true, is_active: true },
  });
}

export async function listEntityDivisions(workspaceUserId: string, publicOrganizationId: string) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  return prisma.division.findMany({
    where: { organization_id: organization.id },
    orderBy: [{ division_name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      organization_id: true,
      entity_id: true,
      division_name: true,
      division_code: true,
      description: true,
      is_active: true,
      created_at: true,
      updated_at: true,
      entity: { select: { entity_name: true } },
    },
  });
}

export async function listDivisionsForEntity(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  const entity = await findOrganizationEntity(organization.id, entityReference);
  if (!entity) throw new EntityMasterArchitectureError("Entity not found in this organization.", 404);
  return prisma.division.findMany({
    where: { organization_id: organization.id, entity_id: entity.id },
    orderBy: [{ division_name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      organization_id: true,
      entity_id: true,
      division_name: true,
      division_code: true,
      description: true,
      is_active: true,
    },
  });
}

async function findEntityDivision(
  organizationId: string,
  entityReference: string,
  divisionId: string,
) {
  const entity = await findOrganizationEntity(organizationId, entityReference);
  if (!entity) throw new EntityMasterArchitectureError("Entity not found in this organization.", 404);
  const division = await prisma.division.findFirst({
    where: { id: divisionId, organization_id: organizationId, entity_id: entity.id },
    select: { id: true, division_name: true, division_code: true, is_active: true, entity_id: true },
  });
  if (!division) throw new EntityMasterArchitectureError("Division not found under this Entity.", 404);
  return { entity, division };
}

export async function getEntityDivisionFolder(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  return findEntityDivision(organization.id, entityReference, divisionId);
}

export async function listDivisionLocations(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  const { entity } = await findEntityDivision(organization.id, entityReference, divisionId);
  return prisma.masterLocation.findMany({
    where: {
      organization_id: organization.id,
      entity_id: entity.id,
      division_id: divisionId,
    },
    orderBy: [{ sort_order: "asc" }, { location_name: "asc" }, { id: "asc" }],
    select: { id: true, value_id: true, location_name: true, is_active: true },
  });
}

export async function createDivisionLocation(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
  input: { locationName: unknown },
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  const { entity, division } = await findEntityDivision(membership.organization_id, entityReference, divisionId);
  if (!entity.is_active || !division.is_active) {
    throw new EntityMasterArchitectureError("Activate the Entity and Division before creating a Location.", 409);
  }
  const locationName = requiredText(input.locationName, "Location name", 255);

  return prisma.$transaction(async (transaction) => {
    const location = await transaction.masterLocation.create({
      data: {
        organization_id: membership.organization_id,
        entity_id: entity.id,
        division_id: division.id,
        location_name: locationName,
        is_active: true,
        sort_order: await transaction.masterLocation.count({
          where: { organization_id: membership.organization_id, division_id: division.id },
        }),
      },
      select: { id: true, value_id: true, location_name: true, is_active: true },
    });

    await createStorageNode(membership.organization_id, workspaceUserId, {
      nodeType: "LOCATION_SITE",
      code: `LOC-${location.id}`,
      name: location.location_name,
      entityId: entity.id,
      masterLocationId: location.id,
    }, transaction);

    await createAuditEvent({
      organizationId: membership.organization_id,
      userId: workspaceUserId,
      module: "master-data",
      action: "CREATE",
      entityType: "MasterLocation",
      entityId: location.id,
      details: { entityId: entity.id, divisionId: division.id, location_name: location.location_name },
    }, transaction);
    return location;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function findLocationAndSite(
  organizationId: string,
  entityReference: string,
  divisionId: string,
  locationId: string,
) {
  const { entity, division } = await findEntityDivision(organizationId, entityReference, divisionId);
  const location = await prisma.masterLocation.findFirst({
    where: {
      id: locationId,
      organization_id: organizationId,
      entity_id: entity.id,
      division_id: division.id,
    },
    select: { id: true, location_name: true, is_active: true },
  });
  if (!location) throw new EntityMasterArchitectureError("Location not found under this Division.", 404);
  const site = await prisma.storageNode.findFirst({
    where: {
      organization_id: organizationId,
      entity_id: entity.id,
      master_location_id: location.id,
      node_type: "LOCATION_SITE",
    },
    select: { id: true, node_name: true, is_active: true },
  });
  return { entity, division, location, site };
}

export async function getEntityLocationFolder(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
  locationId: string,
) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  const { entity, division, location } = await findLocationAndSite(
    organization.id,
    entityReference,
    divisionId,
    locationId,
  );
  return { entity, division, location };
}

async function ensureLocationSite(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  entityId: string,
  location: { id: string; location_name: string },
) {
  const existing = await transaction.storageNode.findFirst({
    where: {
      organization_id: organizationId,
      entity_id: entityId,
      master_location_id: location.id,
      node_type: "LOCATION_SITE",
    },
    select: { id: true, is_active: true },
  });
  if (existing) {
    if (!existing.is_active) {
      throw new EntityMasterArchitectureError("Activate the mapped storage Location/Site before adding sub-locations.", 409);
    }
    return existing.id;
  }
  const site = await createStorageNode(organizationId, userId, {
    nodeType: "LOCATION_SITE",
    code: `LOC-${location.id}`,
    name: location.location_name,
    entityId,
    masterLocationId: location.id,
  }, transaction);
  return site.id;
}

export async function listLocationSubLocations(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
  locationId: string,
) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  const { site } = await findLocationAndSite(
    organization.id,
    entityReference,
    divisionId,
    locationId,
  );
  if (!site) return [];
  return prisma.storageNode.findMany({
    where: {
      organization_id: organization.id,
      parent_node_id: site.id,
      node_type: "WAREHOUSE",
    },
    orderBy: [{ sort_order: "asc" }, { node_name: "asc" }, { id: "asc" }],
    select: { id: true, value_id: true, node_name: true, node_code: true, is_active: true },
  });
}

export async function createLocationSubLocation(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
  locationId: string,
  input: { name: unknown; code: unknown },
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  const { entity, division, location } = await findLocationAndSite(
    membership.organization_id,
    entityReference,
    divisionId,
    locationId,
  );
  if (!entity.is_active || !division.is_active || !location.is_active) {
    throw new EntityMasterArchitectureError("Activate the Entity, Division, and Location before creating a Sub-location.", 409);
  }
  const name = requiredText(input.name, "Sub-location name", 255);
  const code = requiredText(input.code, "Sub-location code", 100);
  return prisma.$transaction(async (transaction) => {
    const siteId = await ensureLocationSite(transaction, membership.organization_id, workspaceUserId, entity.id, location);
    return createStorageNode(membership.organization_id, workspaceUserId, {
      nodeType: "WAREHOUSE",
      code,
      name,
      parentId: siteId,
    }, transaction);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function findSubLocation(
  organizationId: string,
  entityReference: string,
  divisionId: string,
  locationId: string,
  subLocationId: string,
) {
  const { entity, division, location, site } = await findLocationAndSite(
    organizationId,
    entityReference,
    divisionId,
    locationId,
  );
  if (!site) throw new EntityMasterArchitectureError("The Location has no storage site.", 404);
  const subLocation = await prisma.storageNode.findFirst({
    where: {
      id: subLocationId,
      organization_id: organizationId,
      parent_node_id: site.id,
      node_type: "WAREHOUSE",
    },
    select: { id: true, node_name: true, node_code: true, is_active: true },
  });
  if (!subLocation) throw new EntityMasterArchitectureError("Sub-location not found under this Location.", 404);
  return { entity, division, location, subLocation };
}

export async function getEntitySubLocationFolder(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
  locationId: string,
  subLocationId: string,
) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  return findSubLocation(
    organization.id,
    entityReference,
    divisionId,
    locationId,
    subLocationId,
  );
}

export async function listSubSubLocations(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
  locationId: string,
  subLocationId: string,
) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  const { subLocation } = await findSubLocation(
    organization.id,
    entityReference,
    divisionId,
    locationId,
    subLocationId,
  );
  return prisma.storageNode.findMany({
    where: {
      organization_id: organization.id,
      parent_node_id: subLocation.id,
      node_type: "SUB_STORE",
    },
    orderBy: [{ sort_order: "asc" }, { node_name: "asc" }, { id: "asc" }],
    select: { id: true, value_id: true, node_name: true, node_code: true, is_active: true },
  });
}

export async function createSubSubLocation(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  divisionId: string,
  locationId: string,
  subLocationId: string,
  input: { name: unknown; code: unknown },
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  const { entity, division, location, subLocation } = await findSubLocation(
    membership.organization_id,
    entityReference,
    divisionId,
    locationId,
    subLocationId,
  );
  if (!entity.is_active || !division.is_active || !location.is_active || !subLocation.is_active) {
    throw new EntityMasterArchitectureError("Activate the parent hierarchy before creating a Sub-sub-location.", 409);
  }
  const name = requiredText(input.name, "Sub-sub-location name", 255);
  const code = requiredText(input.code, "Sub-sub-location code", 100);
  return createStorageNode(membership.organization_id, workspaceUserId, {
    nodeType: "SUB_STORE",
    code,
    name,
    parentId: subLocation.id,
  });
}

export async function createEntityDivision(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  input: { divisionName: unknown; divisionCode: unknown; description?: unknown },
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  const entity = await findOrganizationEntity(membership.organization_id, entityReference);
  if (!entity || !entity.is_active) {
    throw new EntityMasterArchitectureError("Select an active Entity belonging to this organization.", 404);
  }
  const divisionName = requiredText(input.divisionName, "Division name", 255);
  const divisionCode = requiredText(input.divisionCode, "Division code", 100);
  const description = input.description == null || input.description === ""
    ? null
    : requiredText(input.description, "Description", 1000);

  return prisma.$transaction(async (transaction) => {
    const division = await transaction.division.create({
      data: {
        id: randomUUID(),
        organization_id: membership.organization_id,
        entity_id: entity.id,
        division_name: divisionName,
        division_code: divisionCode,
        description,
        is_active: true,
      },
    });
    await createAuditEvent({
      organizationId: membership.organization_id,
      userId: workspaceUserId,
      module: "master-data",
      action: "CREATE",
      entityType: "Division",
      entityId: division.id,
      details: {
        entityId: entity.id,
        division_name: division.division_name,
        division_code: division.division_code,
      },
    }, transaction);
    return division;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateEntityDivision(
  workspaceUserId: string,
  publicOrganizationId: string,
  divisionId: string,
  input: { divisionName: unknown; divisionCode: unknown; description?: unknown; isActive?: unknown },
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  const division = await prisma.division.findFirst({
    where: { id: divisionId, organization_id: membership.organization_id },
    select: {
      id: true,
      entity_id: true,
      division_name: true,
      division_code: true,
      description: true,
      is_active: true,
    },
  });
  if (!division) throw new EntityMasterArchitectureError("Division not found in this organization.", 404);

  const divisionName = requiredText(input.divisionName, "Division name", 255);
  const divisionCode = requiredText(input.divisionCode, "Division code", 100);
  const description = input.description == null || input.description === ""
    ? null
    : requiredText(input.description, "Description", 1000);
  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    throw new EntityMasterArchitectureError("Division status is invalid.");
  }
  const isActive = typeof input.isActive === "boolean" ? input.isActive : undefined;

  return prisma.$transaction(async (transaction) => {
    if (isActive === false && division.is_active) {
      const activeLocationCount = await transaction.masterLocation.count({
        where: {
          organization_id: membership.organization_id,
          division_id: division.id,
          is_active: true,
        },
      });
      if (activeLocationCount > 0) {
        throw new EntityMasterArchitectureError("Deactivate or reassign active Locations before deactivating this Division.", 409);
      }
    }
    const updated = await transaction.division.update({
      where: { id: division.id },
      data: {
        division_name: divisionName,
        division_code: divisionCode,
        description,
        ...(isActive !== undefined ? { is_active: isActive } : {}),
      },
    });
    await createAuditEvent({
      organizationId: membership.organization_id,
      userId: workspaceUserId,
      module: "master-data",
      action: "UPDATE",
      entityType: "Division",
      entityId: updated.id,
      details: {
        before: {
          division_name: division.division_name,
          division_code: division.division_code,
          is_active: division.is_active,
        },
        after: {
          division_name: updated.division_name,
          division_code: updated.division_code,
          is_active: updated.is_active,
        },
      },
    }, transaction);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listEntityGstRegistrations(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
) {
  const organization = await requireOrganizationContext(workspaceUserId, publicOrganizationId);
  const entity = await findOrganizationEntity(organization.id, entityReference);
  if (!entity) throw new EntityMasterArchitectureError("Entity not found in this organization.", 404);

  return prisma.entityGstRegistration.findMany({
    where: { organization_id: organization.id, entity_id: entity.id },
    orderBy: [{ effective_from: "desc" }, { created_at: "desc" }],
    select: {
      id: true,
      entity_id: true,
      gstin: true,
      registration_state: true,
      registration_type: true,
      effective_from: true,
      effective_to: true,
      is_active: true,
      created_at: true,
      updated_at: true,
    },
  });
}

type EntityGstRegistrationInput = {
  gstin: unknown;
  registrationState: unknown;
  registrationType: unknown;
  effectiveFrom: unknown;
  effectiveTo?: unknown;
  isActive?: unknown;
};

function validateRegistrationInput(input: EntityGstRegistrationInput, defaultActive = true) {
  const gstin = validateGstin(input.gstin);
  const registrationState = requiredText(input.registrationState, "Registration state", 100);
  const registrationType = validateRegistrationType(input.registrationType);
  const effectiveFrom = parseDate(input.effectiveFrom, "Effective-from date");
  const effectiveTo = parseDate(input.effectiveTo, "Effective-to date", true);
  if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
    throw new EntityMasterArchitectureError("Effective-to date cannot be before effective-from date.");
  }
  if (input.isActive !== undefined && typeof input.isActive !== "boolean") {
    throw new EntityMasterArchitectureError("GST registration status is invalid.");
  }
  return {
    gstin,
    registration_state: registrationState,
    registration_type: registrationType,
    effective_from: effectiveFrom!,
    effective_to: effectiveTo,
    is_active: input.isActive ?? defaultActive,
  };
}

async function assertNoActiveOverlappingRegistration(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  entityId: string,
  data: ReturnType<typeof validateRegistrationInput>,
  excludeId?: string,
) {
  if (!data.is_active) return;
  const overlapping = await transaction.entityGstRegistration.findFirst({
    where: {
      organization_id: organizationId,
      entity_id: entityId,
      is_active: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [{ effective_to: null }, { effective_to: { gte: data.effective_from } }],
      ...(data.effective_to ? { effective_from: { lte: data.effective_to } } : {}),
    },
    select: { id: true },
  });
  if (overlapping) {
    throw new EntityMasterArchitectureError("This Entity already has an active GST registration for an overlapping effective period.", 409);
  }
}

export async function createEntityGstRegistration(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  input: EntityGstRegistrationInput,
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  const entity = await findOrganizationEntity(membership.organization_id, entityReference);
  if (!entity || !entity.is_active) {
    throw new EntityMasterArchitectureError("Select an active Entity belonging to this organization.", 404);
  }
  const data = validateRegistrationInput(input);

  return prisma.$transaction(async (transaction) => {
    await assertNoActiveOverlappingRegistration(transaction, membership.organization_id, entity.id, data);
    const registration = await transaction.entityGstRegistration.create({
      data: {
        id: randomUUID(),
        organization_id: membership.organization_id,
        entity_id: entity.id,
        ...data,
      },
    });
    await createAuditEvent({
      organizationId: membership.organization_id,
      userId: workspaceUserId,
      module: "master-data",
      action: "CREATE",
      entityType: "EntityGstRegistration",
      entityId: registration.id,
      details: {
        entityId: entity.id,
        gstinSuffix: registration.gstin.slice(-4),
        registrationState: registration.registration_state,
        registrationType: registration.registration_type,
        effectiveFrom: registration.effective_from.toISOString().slice(0, 10),
        effectiveTo: registration.effective_to?.toISOString().slice(0, 10) ?? null,
      },
    }, transaction);
    return registration;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateEntityGstRegistration(
  workspaceUserId: string,
  publicOrganizationId: string,
  entityReference: string,
  registrationId: string,
  input: EntityGstRegistrationInput,
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "MANAGE_MASTER_DATA",
  );
  const entity = await findOrganizationEntity(membership.organization_id, entityReference);
  if (!entity) throw new EntityMasterArchitectureError("Entity not found in this organization.", 404);
  const current = await prisma.entityGstRegistration.findFirst({
    where: {
      id: registrationId,
      organization_id: membership.organization_id,
      entity_id: entity.id,
    },
  });
  if (!current) {
    throw new EntityMasterArchitectureError("GST registration not found for this Entity.", 404);
  }
  const data = validateRegistrationInput(input, current.is_active);

  return prisma.$transaction(async (transaction) => {
    await assertNoActiveOverlappingRegistration(transaction, membership.organization_id, entity.id, data, current.id);
    const updated = await transaction.entityGstRegistration.update({
      where: { id: current.id },
      data,
    });
    await createAuditEvent({
      organizationId: membership.organization_id,
      userId: workspaceUserId,
      module: "master-data",
      action: "UPDATE",
      entityType: "EntityGstRegistration",
      entityId: updated.id,
      details: {
        before: {
          gstinSuffix: current.gstin.slice(-4),
          is_active: current.is_active,
          effective_from: current.effective_from.toISOString().slice(0, 10),
          effective_to: current.effective_to?.toISOString().slice(0, 10) ?? null,
        },
        after: {
          gstinSuffix: updated.gstin.slice(-4),
          is_active: updated.is_active,
          effective_from: updated.effective_from.toISOString().slice(0, 10),
          effective_to: updated.effective_to?.toISOString().slice(0, 10) ?? null,
        },
      },
    }, transaction);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
