import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { getMasterDefinition } from "@/lib/master-data/master-data-registry";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export class PriceListContactError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409) {
    super(message);
    this.name = "PriceListContactError";
  }
}

const MAX_PAGE_SIZE = 200;

function normalizePagination(pagination: { skip?: number; take?: number }) {
  const skip = pagination.skip ?? 0;
  const take = pagination.take ?? 50;
  if (!Number.isSafeInteger(skip) || skip < 0
    || !Number.isSafeInteger(take) || take < 1 || take > MAX_PAGE_SIZE) {
    throw new PriceListContactError("Contact report pagination is invalid.", 400);
  }
  return { skip, take };
}

export async function getPriceListRecord(organizationId: string, priceListId: string) {
  const channel = await prisma.masterModuleValue.findFirst({
    where: {
      id: priceListId,
      module: { organization_id: organizationId, module_key: "price-list" },
    },
    select: { id: true, label: true, metadata: true },
  });
  if (!channel) throw new PriceListContactError("Price List record was not found.", 404);
  return channel;
}

export async function listPriceListContactAssignments(
  organizationId: string,
  priceListId: string,
  pagination: { skip?: number; take?: number } = {},
) {
  const { skip, take } = normalizePagination(pagination);
  await getPriceListRecord(organizationId, priceListId);
  const assignments = await prisma.priceListContactAssignment.findMany({
    where: { organization_id: organizationId, price_list_value_id: priceListId },
    select: {
      id: true,
      created_at: true,
      contact: {
        select: {
          id: true,
          code: true,
          legal_name: true,
          display_name: true,
          is_active: true,
        },
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "asc" }],
    skip,
    take,
  });
  return assignments.map(({ id, created_at, contact }) => ({
    id,
    createdAt: created_at.toISOString(),
    contactId: contact.id,
    code: contact.code,
    name: contact.display_name || contact.legal_name,
    isActive: contact.is_active,
  }));
}

export async function listAvailablePriceListContacts(
  organizationId: string,
  priceListId: string,
  search: string | undefined,
  pagination: { skip?: number; take?: number } = {},
) {
  const { skip, take } = normalizePagination(pagination);
  await getPriceListRecord(organizationId, priceListId);
  const cleanSearch = search?.trim().slice(0, 100);
  const contacts = await prisma.contact.findMany({
    where: {
      organization_id: organizationId,
      is_active: true,
      price_list_assignments: {
        none: { organization_id: organizationId, price_list_value_id: priceListId },
      },
      ...(cleanSearch ? {
        OR: [
          { code: { contains: cleanSearch, mode: "insensitive" } },
          { legal_name: { contains: cleanSearch, mode: "insensitive" } },
          { display_name: { contains: cleanSearch, mode: "insensitive" } },
        ],
      } : {}),
    },
    select: { id: true, code: true, legal_name: true, display_name: true },
    orderBy: [{ legal_name: "asc" }, { id: "asc" }],
    skip,
    take,
  });
  return contacts.map((contact) => ({
    id: contact.id,
    code: contact.code,
    name: contact.display_name || contact.legal_name,
  }));
}

export async function assignContactToPriceList(
  organizationId: string,
  actorId: string,
  priceListId: string,
  contactId: string,
) {
  if (!contactId || contactId.length > 100) {
    throw new PriceListContactError("Select a valid Contact.", 400);
  }

  return prisma.$transaction(async (transaction) => {
    const channel = await transaction.masterModuleValue.findFirst({
      where: {
        id: priceListId,
        module: { organization_id: organizationId, module_key: "price-list" },
      },
      select: { id: true, label: true },
    });
    if (!channel) throw new PriceListContactError("Price List record was not found.", 404);

    const contact = await transaction.contact.findFirst({
      where: { id: contactId, organization_id: organizationId, is_active: true },
      select: { id: true, code: true },
    });
    if (!contact) throw new PriceListContactError("Select an active Contact from this organization.", 404);

    const assignment = await transaction.priceListContactAssignment.create({
      data: {
        organization_id: organizationId,
        price_list_value_id: channel.id,
        contact_id: contact.id,
      },
      select: { id: true },
    });
    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "master-data",
      action: "CREATE",
      entityType: "price-list-contact",
      entityId: assignment.id,
      details: {
        priceListId: channel.id,
        priceListName: channel.label,
        contactId: contact.id,
        contactCode: contact.code,
      },
    }, transaction);
    return { id: assignment.id, contactId: contact.id };
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function createPriceListForContact(
  organizationId: string,
  actorId: string,
  priceListType: string,
  contactId: string,
) {
  const priceListTypeField = getMasterDefinition("price-list")?.fields
    .find((field) => field.key === "Channel_Type");
  if (!priceListTypeField?.options?.includes(priceListType)) {
    throw new PriceListContactError("Select a valid Price List Type.", 400);
  }
  if (!contactId || contactId.length > 100) {
    throw new PriceListContactError("Select a valid Contact.", 400);
  }

  return prisma.$transaction(async (transaction) => {
    const priceListModule = await transaction.masterModule.upsert({
      where: {
        organization_id_module_key: {
          organization_id: organizationId,
          module_key: "price-list",
        },
      },
      create: {
        organization_id: organizationId,
        module_key: "price-list",
        module_name: "Price List",
        description: "Price list records used for sales pricing and Advance Booking fulfillment.",
      },
      update: {
        module_name: "Price List",
        status: "active",
        description: "Price list records used for sales pricing and Advance Booking fulfillment.",
      },
      select: { id: true },
    });
    const contact = await transaction.contact.findFirst({
      where: { id: contactId, organization_id: organizationId, is_active: true },
      select: { id: true, code: true, legal_name: true, display_name: true },
    });
    if (!contact) {
      throw new PriceListContactError("Select an active Contact from this organization.", 404);
    }

    const label = normalizeUppercase((contact.display_name || contact.legal_name).trim());
    const existing = await transaction.masterModuleValue.findFirst({
      where: { module_id: priceListModule.id, label: { equals: label, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      throw new PriceListContactError("A Price List record with this Contact name already exists.", 409);
    }

    const sortOrder = await transaction.masterModuleValue.count({
      where: { module_id: priceListModule.id },
    });
    const channel = await transaction.masterModuleValue.create({
      data: {
        module_id: priceListModule.id,
        label,
        code: normalizeUppercase(contact.code),
        metadata: { Channel_Type: priceListType },
        is_active: true,
        sort_order: sortOrder,
      },
      select: { id: true, value_id: true },
    });
    const assignment = await transaction.priceListContactAssignment.create({
      data: {
        organization_id: organizationId,
        price_list_value_id: channel.id,
        contact_id: contact.id,
      },
      select: { id: true },
    });
    await transaction.approvalRequest.create({
      data: {
        organization_id: organizationId,
        module_key: "price-list",
        module_name: "Price List",
        entity_type: "master",
        entity_key: "price-list",
        entity_label: label,
        entity_ref_id: channel.value_id,
        status: "pending",
        notes: "Master value pending approval for Price List.",
      },
    });
    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "master-data",
      action: "CREATE",
      entityType: "price-list",
      entityId: channel.value_id,
      details: { label, code: contact.code, priceListType, contactId: contact.id },
    }, transaction);
    await createAuditEvent({
      organizationId,
      userId: actorId,
      module: "master-data",
      action: "CREATE",
      entityType: "price-list-contact",
      entityId: assignment.id,
      details: {
        priceListId: channel.id,
        priceListName: label,
        contactId: contact.id,
        contactCode: contact.code,
      },
    }, transaction);
    return { id: channel.id, valueId: channel.value_id, label, code: contact.code, contactId: contact.id };
  }, { maxWait: 10_000, timeout: 30_000 });
}

export function getPriceListContactErrorResponse(error: unknown) {
  if (error instanceof PriceListContactError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { status: 409, message: "This Contact is already assigned to the Price List." };
    if (error.code === "P2021" || error.code === "P2022") {
      return { status: 503, message: "Price List contact migration is pending. Apply the approved migration before using this report." };
    }
  }
  return null;
}
