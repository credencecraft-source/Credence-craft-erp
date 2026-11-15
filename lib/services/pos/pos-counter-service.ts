import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

import {
  PosStockLocationError,
  resolveActivePosStockLocationByLeaf,
} from "./pos-stock-location-service";

const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 100;

const POS_COUNTER_INCLUDE = {
  subSubLocation: {
    select: {
      id: true,
      node_name: true,
      parent: {
        select: {
          node_name: true,
          parent: {
            select: { node_name: true },
          },
        },
      },
    },
  },
} satisfies Prisma.PosCounterInclude;

type PosCounterRecord = Prisma.PosCounterGetPayload<{ include: typeof POS_COUNTER_INCLUDE }>;
type PosCounterCursor = { id: string; createdAt: Date };
type PosCounterLocationCursor = { id: string; nodeName: string };

export class PosCounterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCounterValidationError";
  }
}

export class PosCounterConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCounterConflictError";
  }
}

function parsePageSize(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new PosCounterValidationError(`Page size must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  return limit;
}

function normalizeSearch(value: string | undefined) {
  const search = normalizeUppercase(value?.trim() ?? "");
  if (search.length > MAX_SEARCH_LENGTH) {
    throw new PosCounterValidationError(`Search must be ${MAX_SEARCH_LENGTH} characters or fewer.`);
  }
  return search;
}

function normalizeCounterName(value: unknown) {
  if (typeof value !== "string") {
    throw new PosCounterValidationError("Counter name is required.");
  }
  const name = normalizeUppercase(value.trim());
  if (!name) throw new PosCounterValidationError("Counter name is required.");
  if (name.length > 150) {
    throw new PosCounterValidationError("Counter name must be 150 characters or fewer.");
  }
  return name;
}

function normalizeIdentifier(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new PosCounterValidationError(`${label} is required.`);
  }
  const id = value.trim();
  if (!id || id.length > 100) {
    throw new PosCounterValidationError(`${label} is invalid.`);
  }
  return id;
}

function formatLocationPath(location: PosCounterRecord["subSubLocation"]) {
  return [
    location.parent?.parent?.node_name,
    location.parent?.node_name,
    location.node_name,
  ].filter((part): part is string => Boolean(part)).join(" / ");
}

function serializeCounter(counter: PosCounterRecord) {
  return {
    id: counter.id,
    counterName: counter.counter_name,
    subSubLocationId: counter.sub_sub_location_id,
    subSubLocationPath: formatLocationPath(counter.subSubLocation),
    createdAt: counter.created_at.toISOString(),
  };
}

export async function createPosCounter(input: {
  organizationId: string;
  actorId: string;
  counterName: unknown;
  subSubLocationId: unknown;
}) {
  const organizationId = normalizeIdentifier(input.organizationId, "Organization");
  const actorId = normalizeIdentifier(input.actorId, "Actor");
  const counterName = normalizeCounterName(input.counterName);
  const subSubLocationId = normalizeIdentifier(input.subSubLocationId, "Sub-sub-location");

  try {
    const savedCounter = await prisma.$transaction(async (transaction) => {
      const location = await resolveActivePosStockLocationByLeaf(
          transaction,
          organizationId,
          subSubLocationId,
        ).catch((error: unknown) => {
          if (error instanceof PosStockLocationError) {
            throw new PosCounterValidationError(error.message);
          }
          throw error;
        });
      const counter = await transaction.posCounter.create({
        data: {
          organization_id: organizationId,
          counter_name: counterName,
          sub_sub_location_id: location.subSubLocationId,
          created_by: actorId,
        },
        include: POS_COUNTER_INCLUDE,
      });
      await createAuditEvent({
        organizationId,
        userId: actorId,
        module: "POS",
        action: "CREATE_POS_COUNTER",
        entityType: "pos_counter",
        entityId: counter.id,
        details: {
          counterName: counter.counter_name,
          subSubLocationId: counter.sub_sub_location_id,
        },
      }, transaction);
      return counter;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
    return serializeCounter(savedCounter);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new PosCounterConflictError("A counter with this name already exists in the organization.");
      }
      if (error.code === "P2003") {
        throw new PosCounterValidationError("The selected Sub-sub-location is no longer available.");
      }
      if (error.code === "P2034") {
        throw new PosCounterConflictError("Counter data changed while saving. Please retry.");
      }
    }
    throw error;
  }
}

export async function listPosCounters(input: {
  organizationId: string;
  search?: string;
  cursor?: PosCounterCursor | null;
  limit: number;
}) {
  const organizationId = normalizeIdentifier(input.organizationId, "Organization");
  const limit = parsePageSize(input.limit);
  const search = normalizeSearch(input.search);
  const filters: Prisma.PosCounterWhereInput[] = [];

  if (search) {
    filters.push({
      OR: [
        { counter_name: { contains: search, mode: "insensitive" } },
        { subSubLocation: { is: { node_name: { contains: search, mode: "insensitive" } } } },
        {
          subSubLocation: {
            is: {
              parent: {
                is: { node_name: { contains: search, mode: "insensitive" } },
              },
            },
          },
        },
        {
          subSubLocation: {
            is: {
              parent: {
                is: {
                  parent: {
                    is: { node_name: { contains: search, mode: "insensitive" } },
                  },
                },
              },
            },
          },
        },
      ],
    });
  }
  if (input.cursor) {
    filters.push({
      OR: [
        { created_at: { lt: input.cursor.createdAt } },
        { created_at: input.cursor.createdAt, id: { lt: input.cursor.id } },
      ],
    });
  }

  const counters = await prisma.posCounter.findMany({
    where: {
      organization_id: organizationId,
      ...(filters.length ? { AND: filters } : {}),
    },
    include: POS_COUNTER_INCLUDE,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const hasMore = counters.length > limit;
  const pageCounters = counters.slice(0, limit);
  return {
    counters: pageCounters.map(serializeCounter),
    nextCursor: hasMore
      ? {
          id: pageCounters[pageCounters.length - 1].id,
          createdAt: pageCounters[pageCounters.length - 1].created_at.toISOString(),
        }
      : null,
  };
}

export async function listPosCounterLocations(input: {
  organizationId: string;
  search?: string;
  cursor?: PosCounterLocationCursor | null;
  limit: number;
}) {
  const organizationId = normalizeIdentifier(input.organizationId, "Organization");
  const limit = parsePageSize(input.limit);
  const search = normalizeSearch(input.search);
  const matches: Prisma.StorageNodeWhereInput[] = [];
  if (search) {
    matches.push({
      OR: [
        { node_name: { contains: search, mode: "insensitive" } },
        { node_code: { contains: search, mode: "insensitive" } },
        { parent: { is: { node_name: { contains: search, mode: "insensitive" } } } },
        {
          parent: {
            is: {
              parent: {
                is: { node_name: { contains: search, mode: "insensitive" } },
              },
            },
          },
        },
      ],
    });
  }
  if (input.cursor) {
    matches.push({
      OR: [
        { node_name: { gt: input.cursor.nodeName } },
        { node_name: input.cursor.nodeName, id: { gt: input.cursor.id } },
      ],
    });
  }

  const locations = await prisma.storageNode.findMany({
    where: {
      organization_id: organizationId,
      node_type: "SUB_STORE",
      is_active: true,
      parent_node_type: "WAREHOUSE",
      parent: {
        is: {
          organization_id: organizationId,
          node_type: "WAREHOUSE",
          is_active: true,
          parent_node_type: "LOCATION_SITE",
          parent: {
            is: {
              organization_id: organizationId,
              node_type: "LOCATION_SITE",
              is_active: true,
              parent_node_id: null,
              parent_node_type: null,
              masterLocation: {
                is: {
                  organization_id: organizationId,
                  is_active: true,
                  entity: { is: { is_active: true } },
                  division: { is: { is_active: true } },
                },
              },
            },
          },
        },
      },
      ...(matches.length ? { AND: matches } : {}),
    },
    select: {
      id: true,
      node_name: true,
      parent: {
        select: {
          node_name: true,
          parent: {
            select: { node_name: true },
          },
        },
      },
    },
    orderBy: [{ node_name: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const hasMore = locations.length > limit;
  const pageLocations = locations.slice(0, limit);
  return {
    locations: pageLocations.map((location) => ({
      id: location.id,
      label: [
        location.parent?.parent?.node_name,
        location.parent?.node_name,
        location.node_name,
      ].filter((part): part is string => Boolean(part)).join(" / "),
    })),
    nextCursor: hasMore
      ? {
          id: pageLocations[pageLocations.length - 1].id,
          nodeName: pageLocations[pageLocations.length - 1].node_name,
        }
      : null,
  };
}
