import { Prisma, PosCounterShiftStatus } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

import { getPosCounterRouteKey } from "./pos-counter-service";

const MAX_PAGE_SIZE = 100;
const MAX_MONEY = new Prisma.Decimal("999999999999.99");

export type PosCounterShiftCursor = {
  id: string;
  openedAt: Date;
};

export class PosCounterShiftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCounterShiftValidationError";
  }
}

export class PosCounterShiftConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCounterShiftConflictError";
  }
}

export class PosCounterShiftNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCounterShiftNotFoundError";
  }
}

export class PosCounterShiftRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCounterShiftRequiredError";
  }
}

export class PosCounterShiftReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCounterShiftReadinessError";
  }
}

export function getPosCounterShiftReadinessMessage(error: unknown) {
  if (error instanceof PosCounterShiftReadinessError) return error.message;
  const code = error && typeof error === "object" && "code" in error
    && typeof error.code === "string"
    ? error.code
    : null;
  if (code === "P2021" || code === "P2022") {
    return `POS counter-shift database schema is not ready (${code}). Verify the migration target and apply the reviewed migration before using counter shifts.`;
  }
  return null;
}

function assertPosCounterShiftClientReady() {
  if (!prisma.posCounterShift || typeof prisma.posCounterShift.findFirst !== "function") {
    throw new PosCounterShiftReadinessError(
      "The running Prisma Client does not include counter shifts. Stop the development server, run npx prisma generate, and restart it. The counter-shift migration is also required.",
    );
  }
}

function normalizeIdentifier(value: unknown, label: string) {
  if (typeof value !== "string") {
    throw new PosCounterShiftValidationError(`${label} is required.`);
  }
  const identifier = value.trim();
  if (!identifier || identifier.length > 100) {
    throw new PosCounterShiftValidationError(`${label} is invalid.`);
  }
  return identifier;
}

function parseMoney(value: unknown, label: string) {
  if (
    typeof value !== "string"
    || !/^\d{1,12}(?:\.\d{1,2})?$/.test(value.trim())
  ) {
    throw new PosCounterShiftValidationError(`${label} must be a non-negative amount with up to two decimals.`);
  }
  const amount = new Prisma.Decimal(value.trim());
  if (!amount.isFinite() || amount.gt(MAX_MONEY)) {
    throw new PosCounterShiftValidationError(`${label} exceeds the allowed amount.`);
  }
  return amount;
}

function parsePageSize(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new PosCounterShiftValidationError(`Page size must be between 1 and ${MAX_PAGE_SIZE}.`);
  }
  return limit;
}

function serializeShift(
  shift: {
    id: string;
    salesperson_user_id: string;
    salesperson_name_snapshot: string;
    status: PosCounterShiftStatus;
    opening_balance: Prisma.Decimal;
    closing_balance: Prisma.Decimal | null;
    opened_at: Date;
    closed_at: Date | null;
  },
  actorId: string,
  sales: { count: number; grossAmount: string; storeCreditAmount: string },
  counter?: { counterId: string; counterName: string },
) {
  return {
    id: shift.id,
    ...(counter ?? {}),
    salespersonName: shift.salesperson_name_snapshot,
    isMine: shift.salesperson_user_id === actorId,
    status: shift.status,
    openingBalance: shift.opening_balance.toFixed(2),
    closingBalance: shift.closing_balance?.toFixed(2) ?? null,
    openedAt: shift.opened_at.toISOString(),
    closedAt: shift.closed_at?.toISOString() ?? null,
    salesCount: sales.count,
    grossSalesAmount: sales.grossAmount,
    storeCreditAppliedAmount: sales.storeCreditAmount,
  };
}

async function getShiftSalesTotals(
  database: Pick<typeof prisma, "posSalesInvoice">,
  input: {
    organizationId: string;
    salespersonId: string;
    openedAt: Date;
    closedAt: Date;
  },
) {
  const totals = await database.posSalesInvoice.aggregate({
    where: {
      organization_id: input.organizationId,
      created_by: input.salespersonId,
      status: "POSTED",
      sales_channel: "COUNTER",
      posted_at: {
        gte: input.openedAt,
        lt: input.closedAt,
      },
    },
    _count: { _all: true },
    _sum: {
      total_amount: true,
      store_credit_applied_amount: true,
    },
  });
  return {
    count: totals._count._all,
    grossAmount: totals._sum.total_amount?.toFixed(2) ?? "0.00",
    storeCreditAmount: totals._sum.store_credit_applied_amount?.toFixed(2) ?? "0.00",
  };
}

export async function getActivePosCounterShift(input: {
  organizationId: string;
  salespersonId: string;
}) {
  const organizationId = normalizeIdentifier(input.organizationId, "Organization");
  const salespersonId = normalizeIdentifier(input.salespersonId, "Salesperson");
  assertPosCounterShiftClientReady();
  await requireOrganizationPermission(salespersonId, organizationId, "CREATE_POS_SALES");
  const shift = await prisma.posCounterShift.findFirst({
    where: {
      organization_id: organizationId,
      active_salesperson_id: salespersonId,
      status: PosCounterShiftStatus.OPEN,
    },
    select: {
      id: true,
      counter_id: true,
      salesperson_name_snapshot: true,
      opening_balance: true,
      opened_at: true,
      counter: {
        select: {
          counter_name: true,
          subSubLocation: {
            select: {
              id: true,
              node_name: true,
              parent: {
                select: {
                  id: true,
                  node_name: true,
                  parent: {
                    select: {
                      master_location_id: true,
                      masterLocation: {
                        select: {
                          entity_id: true,
                          division_id: true,
                          location_name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!shift) return null;
  const subSubLocation = shift.counter.subSubLocation;
  const subLocation = subSubLocation.parent;
  const site = subLocation?.parent;
  const masterLocation = site?.masterLocation;
  if (
    !subLocation
    || !site?.master_location_id
    || !masterLocation?.entity_id
    || !masterLocation.division_id
  ) {
    throw new PosCounterShiftNotFoundError(
      "The active counter's stock location hierarchy could not be resolved.",
    );
  }
  const sales = await getShiftSalesTotals(prisma, {
    organizationId,
    salespersonId,
    openedAt: shift.opened_at,
    closedAt: new Date(),
  });
  return {
    id: shift.id,
    counterId: shift.counter_id,
    counterName: shift.counter.counter_name,
    counterRouteKey: getPosCounterRouteKey(shift.counter.counter_name, shift.counter_id),
    salespersonName: shift.salesperson_name_snapshot,
    openingBalance: shift.opening_balance.toFixed(2),
    openedAt: shift.opened_at.toISOString(),
    salesCount: sales.count,
    grossSalesAmount: sales.grossAmount,
    storeCreditAppliedAmount: sales.storeCreditAmount,
    stockHierarchy: {
      entityId: masterLocation.entity_id,
      divisionId: masterLocation.division_id,
      locationId: site.master_location_id,
      subLocationId: subLocation.id,
      subSubLocationId: subSubLocation.id,
    },
    subLocationName: subLocation.node_name,
    subSubLocationName: subSubLocation.node_name,
    locationName: masterLocation.location_name,
  };
}

export async function listPosCounterShifts(input: {
  organizationId: string;
  counterId: string;
  actorId: string;
  cursor?: PosCounterShiftCursor | null;
  limit: number;
}) {
  const organizationId = normalizeIdentifier(input.organizationId, "Organization");
  const counterId = normalizeIdentifier(input.counterId, "Counter");
  const actorId = normalizeIdentifier(input.actorId, "Actor");
  const limit = parsePageSize(input.limit);
  assertPosCounterShiftClientReady();
  await requireOrganizationPermission(actorId, organizationId, "VIEW_POS_COUNTERS");
  await requireOrganizationPermission(actorId, organizationId, "VIEW_POS_SALES");
  const counter = await prisma.posCounter.findFirst({
    where: { id: counterId, organization_id: organizationId },
    select: { id: true },
  });
  if (!counter) throw new PosCounterShiftNotFoundError("POS counter was not found.");

  const where: Prisma.PosCounterShiftWhereInput = {
    organization_id: organizationId,
    counter_id: counterId,
    ...(input.cursor ? {
      OR: [
        { opened_at: { lt: input.cursor.openedAt } },
        { opened_at: input.cursor.openedAt, id: { lt: input.cursor.id } },
      ],
    } : {}),
  };
  const [shifts, activeCounterShift, activeSalespersonShift, lastClosedShift] = await Promise.all([
    prisma.posCounterShift.findMany({
      where,
      select: {
        id: true,
        salesperson_user_id: true,
        salesperson_name_snapshot: true,
        status: true,
        opening_balance: true,
        closing_balance: true,
        opened_at: true,
        closed_at: true,
      },
      orderBy: [{ opened_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    prisma.posCounterShift.findFirst({
      where: {
        organization_id: organizationId,
        active_counter_id: counterId,
        status: PosCounterShiftStatus.OPEN,
      },
      select: {
        id: true,
        counter_id: true,
        salesperson_name_snapshot: true,
        opened_at: true,
        counter: { select: { counter_name: true } },
      },
    }),
    prisma.posCounterShift.findFirst({
      where: {
        organization_id: organizationId,
        active_salesperson_id: actorId,
        status: PosCounterShiftStatus.OPEN,
      },
      select: {
        id: true,
        counter_id: true,
        salesperson_name_snapshot: true,
        opened_at: true,
        counter: { select: { counter_name: true } },
      },
    }),
    prisma.posCounterShift.findFirst({
      where: {
        organization_id: organizationId,
        counter_id: counterId,
        status: PosCounterShiftStatus.CLOSED,
      },
      select: {
        salesperson_name_snapshot: true,
        closing_balance: true,
        closed_at: true,
      },
      orderBy: [{ closed_at: "desc" }, { id: "desc" }],
    }),
  ]);

  const hasMore = shifts.length > limit;
  const pageShifts = shifts.slice(0, limit);
  const aggregates = pageShifts.length
    ? await prisma.$queryRaw<Array<{
        shift_id: string;
        sales_count: bigint;
        gross_sales_amount: Prisma.Decimal;
        store_credit_amount: Prisma.Decimal;
      }>>(Prisma.sql`
        SELECT shift."id" AS "shift_id",
          COUNT(invoice."id") AS "sales_count",
          COALESCE(SUM(invoice."total_amount"), 0)::numeric(14, 2) AS "gross_sales_amount",
          COALESCE(SUM(invoice."store_credit_applied_amount"), 0)::numeric(14, 2) AS "store_credit_amount"
        FROM "pos_counter_shifts" AS shift
        LEFT JOIN "pos_sales_invoices" AS invoice
          ON invoice."organization_id" = shift."organization_id"
          AND invoice."created_by" = shift."salesperson_user_id"
          AND invoice."status" = 'POSTED'
          AND invoice."sales_channel" = 'COUNTER'
          AND invoice."posted_at" >= shift."opened_at"
          AND invoice."posted_at" < COALESCE(shift."closed_at", CURRENT_TIMESTAMP)
        WHERE shift."organization_id" = ${organizationId}
          AND shift."id" IN (${Prisma.join(pageShifts.map(({ id }) => id))})
        GROUP BY shift."id"
      `)
    : [];
  const aggregateByShiftId = new Map(aggregates.map((item) => [item.shift_id, item]));

  return {
    counterId,
    shifts: pageShifts.map((shift) => {
      const aggregate = aggregateByShiftId.get(shift.id);
      return serializeShift(shift, actorId, {
        count: Number(aggregate?.sales_count ?? 0),
        grossAmount: aggregate?.gross_sales_amount.toFixed(2) ?? "0.00",
        storeCreditAmount: aggregate?.store_credit_amount.toFixed(2) ?? "0.00",
      });
    }),
    nextCursor: hasMore
      ? {
          id: pageShifts[pageShifts.length - 1].id,
          openedAt: pageShifts[pageShifts.length - 1].opened_at.toISOString(),
        }
      : null,
    activeCounterShift: activeCounterShift
      ? {
          id: activeCounterShift.id,
          counterId: activeCounterShift.counter_id,
          counterName: activeCounterShift.counter.counter_name,
          salespersonName: activeCounterShift.salesperson_name_snapshot,
          openedAt: activeCounterShift.opened_at.toISOString(),
        }
      : null,
    activeSalespersonShift: activeSalespersonShift
      ? {
          id: activeSalespersonShift.id,
          counterId: activeSalespersonShift.counter_id,
          counterName: activeSalespersonShift.counter.counter_name,
          salespersonName: activeSalespersonShift.salesperson_name_snapshot,
          openedAt: activeSalespersonShift.opened_at.toISOString(),
        }
      : null,
    suggestedOpeningBalance: lastClosedShift?.closing_balance?.toFixed(2) ?? "0.00",
    lastClosedShift: lastClosedShift
      ? {
          salespersonName: lastClosedShift.salesperson_name_snapshot,
          closingBalance: lastClosedShift.closing_balance?.toFixed(2) ?? "0.00",
          closedAt: lastClosedShift.closed_at?.toISOString() ?? null,
        }
      : null,
  };
}

export async function openPosCounterShift(input: {
  organizationId: string;
  counterId: string;
  actorId: string;
  actorName: string;
  openingBalance: unknown;
}) {
  const organizationId = normalizeIdentifier(input.organizationId, "Organization");
  const counterId = normalizeIdentifier(input.counterId, "Counter");
  const actorId = normalizeIdentifier(input.actorId, "Actor");
  const actorName = normalizeUppercase(input.actorName.trim());
  if (!actorName || actorName.length > 255) {
    throw new PosCounterShiftValidationError("Salesperson name is invalid.");
  }
  const openingBalance = parseMoney(input.openingBalance, "Opening balance");
  assertPosCounterShiftClientReady();
  await requireOrganizationPermission(actorId, organizationId, "CREATE_POS_SALES");

  try {
    return await prisma.$transaction(async (transaction) => {
      const counter = await transaction.posCounter.findFirst({
        where: { id: counterId, organization_id: organizationId },
        select: { id: true, counter_name: true },
      });
      if (!counter) throw new PosCounterShiftNotFoundError("POS counter was not found.");

      const activeShift = await transaction.posCounterShift.findFirst({
        where: {
          organization_id: organizationId,
          status: PosCounterShiftStatus.OPEN,
          OR: [
            { active_counter_id: counterId },
            { active_salesperson_id: actorId },
          ],
        },
        select: { id: true },
      });
      if (activeShift) {
        throw new PosCounterShiftConflictError(
          "This counter or salesperson already has an open shift. Close it before opening another.",
        );
      }

      const shift = await transaction.posCounterShift.create({
        data: {
          organization_id: organizationId,
          counter_id: counterId,
          salesperson_user_id: actorId,
          salesperson_name_snapshot: actorName,
          active_counter_id: counterId,
          active_salesperson_id: actorId,
          opening_balance: openingBalance,
          created_by: actorId,
        },
        select: {
          id: true,
          salesperson_user_id: true,
          salesperson_name_snapshot: true,
          status: true,
          opening_balance: true,
          closing_balance: true,
          opened_at: true,
          closed_at: true,
        },
      });
      await createAuditEvent({
        organizationId,
        userId: actorId,
        module: "POS",
        action: "OPEN_POS_COUNTER_SHIFT",
        entityType: "pos_counter_shift",
        entityId: shift.id,
        details: { counterId, openingBalance: openingBalance.toFixed(2) },
      }, transaction);
      return serializeShift(shift, actorId, {
        count: 0,
        grossAmount: "0.00",
        storeCreditAmount: "0.00",
      }, {
        counterId: counter.id,
        counterName: counter.counter_name,
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
  } catch (error) {
    if (error instanceof PosCounterShiftConflictError || error instanceof PosCounterShiftNotFoundError) {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002" || error.code === "P2034") {
        throw new PosCounterShiftConflictError(
          "The counter or salesperson started another shift. Refresh and retry.",
        );
      }
    }
    throw error;
  }
}

export async function closePosCounterShift(input: {
  organizationId: string;
  shiftId: string;
  actorId: string;
  closingBalance: unknown;
}) {
  const organizationId = normalizeIdentifier(input.organizationId, "Organization");
  const shiftId = normalizeIdentifier(input.shiftId, "Shift");
  const actorId = normalizeIdentifier(input.actorId, "Actor");
  const closingBalance = parseMoney(input.closingBalance, "Closing balance");
  assertPosCounterShiftClientReady();
  await requireOrganizationPermission(actorId, organizationId, "CREATE_POS_SALES");

  try {
    return await prisma.$transaction(async (transaction) => {
      const shift = await transaction.posCounterShift.findFirst({
        where: {
          id: shiftId,
          organization_id: organizationId,
          salesperson_user_id: actorId,
          active_salesperson_id: actorId,
          status: PosCounterShiftStatus.OPEN,
        },
        select: {
          id: true,
          counter_id: true,
          salesperson_user_id: true,
          salesperson_name_snapshot: true,
          status: true,
          opening_balance: true,
          closing_balance: true,
          opened_at: true,
          closed_at: true,
        },
      });
      if (!shift) {
        throw new PosCounterShiftNotFoundError("Your open counter shift was not found.");
      }

      const closedAt = new Date();
      const closed = await transaction.posCounterShift.updateMany({
        where: {
          id: shift.id,
          organization_id: organizationId,
          active_salesperson_id: actorId,
          status: PosCounterShiftStatus.OPEN,
        },
        data: {
          status: PosCounterShiftStatus.CLOSED,
          closing_balance: closingBalance,
          closed_at: closedAt,
          closed_by: actorId,
          active_counter_id: null,
          active_salesperson_id: null,
        },
      });
      if (closed.count !== 1) {
        throw new PosCounterShiftConflictError("This counter shift was closed by another request. Refresh the report.");
      }

      const sales = await getShiftSalesTotals(transaction, {
        organizationId,
        salespersonId: actorId,
        openedAt: shift.opened_at,
        closedAt,
      });
      await createAuditEvent({
        organizationId,
        userId: actorId,
        module: "POS",
        action: "CLOSE_POS_COUNTER_SHIFT",
        entityType: "pos_counter_shift",
        entityId: shift.id,
        details: {
          counterId: shift.counter_id,
          openingBalance: shift.opening_balance.toFixed(2),
          closingBalance: closingBalance.toFixed(2),
          salesCount: sales.count,
          grossSalesAmount: sales.grossAmount,
          storeCreditAppliedAmount: sales.storeCreditAmount,
        },
      }, transaction);
      return serializeShift({
        ...shift,
        status: PosCounterShiftStatus.CLOSED,
        closing_balance: closingBalance,
        closed_at: closedAt,
      }, actorId, sales);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    });
  } catch (error) {
    if (
      error instanceof PosCounterShiftConflictError
      || error instanceof PosCounterShiftNotFoundError
    ) {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new PosCounterShiftConflictError("Counter sales changed while closing the shift. Refresh and retry.");
    }
    throw error;
  }
}
