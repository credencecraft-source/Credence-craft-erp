import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, PosCounterShiftStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  posCounterFindFirst: vi.fn(),
  posCounterShiftDelegateAvailable: vi.fn(() => true),
  posCounterShiftFindFirst: vi.fn(),
  posCounterShiftFindMany: vi.fn(),
  posCounterShiftCreate: vi.fn(),
  posCounterShiftUpdateMany: vi.fn(),
  posSalesInvoiceAggregate: vi.fn(),
  queryRaw: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
    $queryRaw: mocks.queryRaw,
    posCounter: { findFirst: mocks.posCounterFindFirst },
    posCounterShift: {
      get findFirst() {
        return mocks.posCounterShiftDelegateAvailable()
          ? mocks.posCounterShiftFindFirst
          : undefined;
      },
      findMany: mocks.posCounterShiftFindMany,
      create: mocks.posCounterShiftCreate,
      updateMany: mocks.posCounterShiftUpdateMany,
    },
    posSalesInvoice: { aggregate: mocks.posSalesInvoiceAggregate },
  },
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import {
  closePosCounterShift,
  getActivePosCounterShift,
  listPosCounterShifts,
  openPosCounterShift,
  PosCounterShiftConflictError,
  PosCounterShiftNotFoundError,
  PosCounterShiftReadinessError,
  getPosCounterShiftReadinessMessage,
} from "./pos-counter-shift-service";

const openedAt = new Date("2026-11-11T09:30:00.000Z");
const openShift = {
  id: "shift-1",
  counter_id: "counter-1",
  salesperson_user_id: "user-1",
  salesperson_name_snapshot: "RAVI",
  status: PosCounterShiftStatus.OPEN,
  opening_balance: new Prisma.Decimal("5000.00"),
  closing_balance: null,
  opened_at: openedAt,
  closed_at: null,
};

describe("POS counter shift service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.posCounterShiftDelegateAvailable.mockReturnValue(true);
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(
      async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          posCounter: { findFirst: mocks.posCounterFindFirst },
          posCounterShift: {
            findFirst: mocks.posCounterShiftFindFirst,
            create: mocks.posCounterShiftCreate,
            updateMany: mocks.posCounterShiftUpdateMany,
          },
          posSalesInvoice: { aggregate: mocks.posSalesInvoiceAggregate },
        }),
    );
    mocks.posCounterFindFirst.mockResolvedValue({ id: "counter-1", counter_name: "COUNTER 1" });
    mocks.posCounterShiftFindFirst.mockResolvedValue(null);
    mocks.posCounterShiftFindMany.mockResolvedValue([]);
    mocks.posCounterShiftCreate.mockResolvedValue(openShift);
    mocks.posCounterShiftUpdateMany.mockResolvedValue({ count: 1 });
    mocks.posSalesInvoiceAggregate.mockResolvedValue({
      _count: { _all: 2 },
      _sum: {
        total_amount: new Prisma.Decimal("53000.00"),
        store_credit_applied_amount: new Prisma.Decimal("0.00"),
      },
    });
    mocks.queryRaw.mockResolvedValue([]);
  });

  it("opens an audited tenant-scoped shift with normalized salesperson and exact opening balance", async () => {
    const result = await openPosCounterShift({
      organizationId: "internal-org-1",
      counterId: "counter-1",
      actorId: "user-1",
      actorName: "Ravi Kumar",
      openingBalance: "5000.00",
    });

    expect(mocks.posCounterFindFirst).toHaveBeenCalledWith({
      where: { id: "counter-1", organization_id: "internal-org-1" },
      select: { id: true, counter_name: true },
    });
    expect(mocks.posCounterShiftCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-1",
        counter_id: "counter-1",
        salesperson_user_id: "user-1",
        salesperson_name_snapshot: "RAVI KUMAR",
        active_counter_id: "counter-1",
        active_salesperson_id: "user-1",
        opening_balance: new Prisma.Decimal("5000.00"),
      }),
    }));
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      userId: "user-1",
      action: "OPEN_POS_COUNTER_SHIFT",
      entityId: "shift-1",
    }), expect.anything());
    expect(result.openingBalance).toBe("5000.00");
    expect(result).toMatchObject({
      counterId: "counter-1",
      counterName: "COUNTER 1",
    });
  });

  it("rejects opening another shift for a counter or salesperson already on shift", async () => {
    mocks.posCounterShiftFindFirst.mockResolvedValue({ id: "existing-shift" });

    await expect(openPosCounterShift({
      organizationId: "internal-org-1",
      counterId: "counter-1",
      actorId: "user-1",
      actorName: "Ravi Kumar",
      openingBalance: "5000",
    })).rejects.toBeInstanceOf(PosCounterShiftConflictError);

    expect(mocks.posCounterShiftCreate).not.toHaveBeenCalled();
  });

  it("closes only the actor's open tenant shift and reports posted counter sales", async () => {
    mocks.posCounterShiftFindFirst.mockResolvedValue(openShift);

    const result = await closePosCounterShift({
      organizationId: "internal-org-1",
      shiftId: "shift-1",
      actorId: "user-1",
      closingBalance: "55000.00",
    });

    expect(mocks.posCounterShiftFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "shift-1",
        organization_id: "internal-org-1",
        salesperson_user_id: "user-1",
        active_salesperson_id: "user-1",
        status: PosCounterShiftStatus.OPEN,
      },
    }));
    expect(mocks.posCounterShiftUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "shift-1",
        organization_id: "internal-org-1",
        active_salesperson_id: "user-1",
        status: PosCounterShiftStatus.OPEN,
      }),
      data: expect.objectContaining({
        status: PosCounterShiftStatus.CLOSED,
        closing_balance: new Prisma.Decimal("55000.00"),
        active_counter_id: null,
        active_salesperson_id: null,
      }),
    }));
    expect(mocks.posSalesInvoiceAggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        created_by: "user-1",
        sales_channel: "COUNTER",
        posted_at: { gte: openedAt, lt: expect.any(Date) },
      }),
    }));
    expect(result).toMatchObject({
      status: PosCounterShiftStatus.CLOSED,
      openingBalance: "5000.00",
      closingBalance: "55000.00",
      salesCount: 2,
      grossSalesAmount: "53000.00",
    });
  });

  it("does not close a shift owned by a different salesperson", async () => {
    mocks.posCounterShiftFindFirst.mockResolvedValue(null);

    await expect(closePosCounterShift({
      organizationId: "internal-org-1",
      shiftId: "shift-1",
      actorId: "other-user",
      closingBalance: "55000.00",
    })).rejects.toBeInstanceOf(PosCounterShiftNotFoundError);

    expect(mocks.posCounterShiftUpdateMany).not.toHaveBeenCalled();
  });

  it("scopes the bounded report query to the internal organization and requested counter", async () => {
    await listPosCounterShifts({
      organizationId: "internal-org-1",
      counterId: "counter-1",
      actorId: "user-1",
      limit: 50,
    });

    expect(mocks.posCounterFindFirst).toHaveBeenCalledWith({
      where: { id: "counter-1", organization_id: "internal-org-1" },
      select: { id: true },
    });
    expect(mocks.posCounterShiftFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", counter_id: "counter-1" },
      take: 51,
    }));
  });

  it("returns the previous salesperson and counted closing balance for shift handover", async () => {
    mocks.posCounterShiftFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        salesperson_name_snapshot: "KIRAN",
        closing_balance: new Prisma.Decimal("55000.00"),
        closed_at: new Date("2026-11-11T13:30:00.000Z"),
      });

    const result = await listPosCounterShifts({
      organizationId: "internal-org-1",
      counterId: "counter-1",
      actorId: "user-1",
      limit: 50,
    });

    expect(result).toMatchObject({
      suggestedOpeningBalance: "55000.00",
      lastClosedShift: {
        salespersonName: "KIRAN",
        closingBalance: "55000.00",
        closedAt: "2026-11-11T13:30:00.000Z",
      },
    });
  });

  it("rejects invalid monetary values before writes", async () => {
    await expect(openPosCounterShift({
      organizationId: "internal-org-1",
      counterId: "counter-1",
      actorId: "user-1",
      actorName: "Ravi Kumar",
      openingBalance: "-1",
    })).rejects.toThrow("Opening balance must be a non-negative amount");

    expect(mocks.posCounterShiftCreate).not.toHaveBeenCalled();
  });

  it("loads the current shift only for the authenticated organization and salesperson", async () => {
    mocks.posCounterShiftFindFirst.mockResolvedValue({
      ...openShift,
      counter: {
        counter_name: "COUNTER 1",
        subSubLocation: {
          id: "leaf-1",
          node_name: "RACK AREA",
          parent: {
            id: "sub-location-1",
            node_name: "WAREHOUSE",
            parent: {
              master_location_id: "location-1",
              masterLocation: {
                entity_id: "entity-1",
                division_id: "division-1",
                location_name: "BLR",
              },
            },
          },
        },
      },
    });

    const result = await getActivePosCounterShift({
      organizationId: "internal-org-1",
      salespersonId: "user-1",
    });

    expect(mocks.posCounterShiftFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-1",
        active_salesperson_id: "user-1",
        status: PosCounterShiftStatus.OPEN,
      },
    }));
    expect(result).toMatchObject({
      counterId: "counter-1",
      counterName: "COUNTER 1",
      openingBalance: "5000.00",
      salesCount: 2,
      grossSalesAmount: "53000.00",
      stockHierarchy: {
        entityId: "entity-1",
        divisionId: "division-1",
        locationId: "location-1",
        subLocationId: "sub-location-1",
        subSubLocationId: "leaf-1",
      },
      locationName: "BLR",
      subLocationName: "WAREHOUSE",
      subSubLocationName: "RACK AREA",
    });
  });

  it("reports a missing generated client delegate as a readiness error", async () => {
    mocks.posCounterShiftDelegateAvailable.mockReturnValue(false);

    await expect(getActivePosCounterShift({
      organizationId: "internal-org-1",
      salespersonId: "user-1",
    })).rejects.toBeInstanceOf(PosCounterShiftReadinessError);
    expect(mocks.posCounterShiftFindFirst).not.toHaveBeenCalled();
  });

  it("returns an actionable readiness message for Prisma schema drift", () => {
    expect(getPosCounterShiftReadinessMessage({ code: "P2021" })).toContain("schema is not ready (P2021)");
    expect(getPosCounterShiftReadinessMessage({ code: "P2022" })).toContain("schema is not ready (P2022)");
    expect(getPosCounterShiftReadinessMessage(new Error("unrelated"))).toBeNull();
  });
});
