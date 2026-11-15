import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assetOptionsFindMany: vi.fn(),
  locationsFindMany: vi.fn(),
  assetsFindMany: vi.fn(),
  plansFindMany: vi.fn(),
  workOrdersFindMany: vi.fn(),
  transaction: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createAuditEvent: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    masterRawMaterial: { findMany: mocks.assetOptionsFindMany },
    masterLocation: { findMany: mocks.locationsFindMany },
    preventiveMaintenanceAsset: { findMany: mocks.assetsFindMany },
    preventiveMaintenancePlan: { findMany: mocks.plansFindMany },
    preventiveMaintenanceWorkOrder: { findMany: mocks.workOrdersFindMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: mocks.createAuditEvent,
}));

import {
  completeMaintenanceWorkOrder,
  createPreventiveMaintenancePlan,
  generateDueMaintenanceWorkOrders,
  getPreventiveMaintenanceDashboard,
  PreventiveMaintenanceError,
} from "./preventive-maintenance-service";

describe("Preventive Maintenance service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assetOptionsFindMany.mockResolvedValue([]);
    mocks.locationsFindMany.mockResolvedValue([]);
    mocks.assetsFindMany.mockResolvedValue([]);
    mocks.plansFindMany.mockResolvedValue([]);
    mocks.workOrdersFindMany.mockResolvedValue([]);
    mocks.requireOrganizationPermission.mockResolvedValue({ organization_id: "internal-org-1", role: "OWNER" });
  });

  it("scopes every dashboard collection to the authorized organization", async () => {
    await getPreventiveMaintenanceDashboard("internal-org-1", "user-1");

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "MANAGE_MASTER_DATA",
    );

    for (const findMany of [
      mocks.assetOptionsFindMany,
      mocks.locationsFindMany,
      mocks.assetsFindMany,
      mocks.plansFindMany,
      mocks.workOrdersFindMany,
    ]) {
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ organization_id: "internal-org-1" }),
      }));
    }
  });

  it("rejects invalid repeat intervals before opening a database transaction", async () => {
    await expect(createPreventiveMaintenancePlan("internal-org-1", "user-1", {
      assetId: "asset-1",
      name: "Monthly inspection",
      intervalDays: 0,
      nextDueDate: "2026-11-01",
      checklist: ["VISUALLY CHECK GUARDS"],
    })).rejects.toBeInstanceOf(PreventiveMaintenanceError);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("denies equipment changes when the member lacks master-data permission", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    await expect(createPreventiveMaintenancePlan("internal-org-1", "user-1", {
      assetId: "asset-1",
      name: "Monthly inspection",
      intervalDays: 30,
      nextDueDate: "2026-11-01",
      checklist: ["VISUALLY CHECK GUARDS"],
    })).rejects.toThrow("Access denied");

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects more checklist steps than the bounded plan allows", async () => {
    await expect(createPreventiveMaintenancePlan("internal-org-1", "user-1", {
      assetId: "asset-1",
      name: "Inspection",
      intervalDays: 30,
      nextDueDate: "2026-11-01",
      checklist: Array.from({ length: 21 }, (_, index) => `STEP ${index + 1}`),
    })).rejects.toThrow("Add between 1 and 20 checklist steps.");

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates plan checklist steps with the authorized tenant inside the transaction", async () => {
    const createPlan = vi.fn().mockResolvedValue({
      id: "plan-1",
      plan_name: "MONTHLY INSPECTION",
      interval_days: 30,
    });
    const createChecklistItems = vi.fn().mockResolvedValue({ count: 2 });
    mocks.transaction.mockImplementation(async (callback) => callback({
      preventiveMaintenanceAsset: {
        findFirst: vi.fn().mockResolvedValue({ id: "asset-1", asset_tag: "PRESS-01" }),
      },
      preventiveMaintenancePlan: { create: createPlan },
      preventiveMaintenancePlanChecklist: { createMany: createChecklistItems },
    }));

    await createPreventiveMaintenancePlan("internal-org-1", "user-1", {
      assetId: "asset-1",
      name: "Monthly inspection",
      intervalDays: 30,
      nextDueDate: "2026-11-01",
      checklist: ["Check guards", "Record vibration"],
    });

    expect(createChecklistItems).toHaveBeenCalledWith({
      data: [
        {
          organization_id: "internal-org-1",
          plan_id: "plan-1",
          instruction: "CHECK GUARDS",
          sort_order: 0,
        },
        {
          organization_id: "internal-org-1",
          plan_id: "plan-1",
          instruction: "RECORD VIBRATION",
          sort_order: 1,
        },
      ],
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-1",
      entityId: "plan-1",
    }), expect.anything());
  });

  it("does not duplicate a due work order when one already exists for the plan date", async () => {
    const dueDate = new Date("2026-10-01T00:00:00.000Z");
    const existingWorkOrderLookup = vi.fn().mockResolvedValue({ id: "work-order-1" });
    const createWorkOrder = vi.fn();
    const findDuePlans = vi.fn().mockResolvedValue([{
      id: "plan-1",
      next_due_date: dueDate,
      asset: { id: "asset-1", asset_tag: "PRESS-01" },
      checklist: [],
    }]);
    mocks.transaction.mockImplementation(async (callback) => callback({
      preventiveMaintenancePlan: { findMany: findDuePlans },
      preventiveMaintenanceWorkOrder: {
        findFirst: existingWorkOrderLookup,
        create: createWorkOrder,
      },
    }));

    const result = await generateDueMaintenanceWorkOrders("internal-org-1", "user-1");

    expect(result).toEqual({ createdCount: 0, workOrders: [] });
    expect(existingWorkOrderLookup).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        organization_id: "internal-org-1",
        plan_id: "plan-1",
        scheduled_for: dueDate,
      }),
    }));
    expect(createWorkOrder).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });

  it("creates due work-order checklist rows with the authorized tenant", async () => {
    const dueDate = new Date("2026-10-01T00:00:00.000Z");
    const plan = {
      id: "plan-1",
      next_due_date: dueDate,
      asset: { id: "asset-1", asset_tag: "PRESS-01" },
      checklist: [
        { sort_order: 0, instruction: "CHECK GUARDS" },
        { sort_order: 1, instruction: "RECORD VIBRATION" },
      ],
    };
    const findDuePlans = vi.fn().mockResolvedValue([plan]);
    const findExistingWorkOrder = vi.fn().mockResolvedValue(null);
    const createWorkOrder = vi.fn().mockResolvedValue({
      id: "work-order-1",
      asset_id: "asset-1",
      plan_id: "plan-1",
      scheduled_for: dueDate,
    });
    const createChecklistItems = vi.fn().mockResolvedValue({ count: 2 });
    mocks.transaction.mockImplementation(async (callback) => callback({
      preventiveMaintenancePlan: { findMany: findDuePlans },
      preventiveMaintenanceWorkOrder: {
        findFirst: findExistingWorkOrder,
        create: createWorkOrder,
      },
      preventiveMaintenanceWorkOrderChecklist: { createMany: createChecklistItems },
    }));

    const result = await generateDueMaintenanceWorkOrders("internal-org-1", "user-1");

    expect(result.createdCount).toBe(1);
    expect(createChecklistItems).toHaveBeenCalledWith({
      data: [
        {
          organization_id: "internal-org-1",
          work_order_id: "work-order-1",
          sort_order: 0,
          instruction: "CHECK GUARDS",
        },
        {
          organization_id: "internal-org-1",
          work_order_id: "work-order-1",
          sort_order: 1,
          instruction: "RECORD VIBRATION",
        },
      ],
    });
  });

  it("blocks work-order completion until every checklist item is complete", async () => {
    const updateWorkOrder = vi.fn();
    const findWorkOrder = vi.fn().mockResolvedValue({
      id: "work-order-1",
      status: "IN_PROGRESS",
      checklist: [{ id: "check-1", is_completed: false }],
      plan: { id: "plan-1", interval_days: 30, next_due_date: new Date("2026-10-01T00:00:00.000Z"), is_active: true },
      asset: { asset_tag: "PRESS-01" },
    });
    mocks.transaction.mockImplementation(async (callback) => callback({
      preventiveMaintenanceWorkOrder: {
        findFirst: findWorkOrder,
        updateMany: updateWorkOrder,
      },
    }));

    await expect(completeMaintenanceWorkOrder(
      "internal-org-1",
      "user-1",
      "Operator",
      { workOrderId: "work-order-1", downtimeMinutes: 0 },
    )).rejects.toThrow("Complete every checklist step");

    expect(updateWorkOrder).not.toHaveBeenCalled();
    expect(mocks.createAuditEvent).not.toHaveBeenCalled();
  });
});
