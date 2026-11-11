import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock, requireOrganizationPermissionMock, createAuditEventMock } = vi.hoisted(() => {
  const transactionMock = {
    masterMeasurementGroup: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    uniformEmployeeMeasurement: { updateMany: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(),
    masterMeasurementGroup: { findMany: vi.fn(), findFirst: vi.fn() },
    uniformEmployeeMeasurement: { findMany: vi.fn() },
  };
  return {
    prismaMock,
    transactionMock,
    requireOrganizationPermissionMock: vi.fn(),
    createAuditEventMock: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: requireOrganizationPermissionMock,
}));
vi.mock("@/lib/services/organizations/audit-event-service", () => ({
  createAuditEvent: createAuditEventMock,
}));

import {
  assignUniformMeasurementsToGroup,
  createUniformMeasurementGroupAndAssign,
  deleteUniformMeasurementGroup,
  getUniformMeasurementGroup,
  listUniformEmployeeMeasurements,
  listUniformMeasurementGroups,
} from "./uniform-management-service";

beforeEach(() => {
  vi.clearAllMocks();
  requireOrganizationPermissionMock.mockResolvedValue({ organization_id: "authorized-internal-org" });
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  transactionMock.masterMeasurementGroup.create.mockResolvedValue({ id: "group-id", group_name: "WINTER" });
  transactionMock.masterMeasurementGroup.findFirst.mockResolvedValue({ id: "group-id", group_name: "WINTER" });
  transactionMock.masterMeasurementGroup.deleteMany.mockResolvedValue({ count: 1 });
  transactionMock.uniformEmployeeMeasurement.updateMany.mockResolvedValue({ count: 2 });
  prismaMock.masterMeasurementGroup.findMany.mockResolvedValue([]);
  prismaMock.masterMeasurementGroup.findFirst.mockResolvedValue({
    id: "group-id",
    group_name: "WINTER",
    created_at: new Date("2026-01-01T00:00:00.000Z"),
  });
  prismaMock.uniformEmployeeMeasurement.findMany.mockResolvedValue([]);
  createAuditEventMock.mockResolvedValue(undefined);
});

describe("Uniform employee measurement groups", () => {
  it("keeps grouped measurements out of the root Employee Measurements report", async () => {
    await listUniformEmployeeMeasurements("user-id", "public-org-id");

    expect(prismaMock.uniformEmployeeMeasurement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "authorized-internal-org", group_id: null },
    }));
  });

  it("lists groups only for the authorized internal organization", async () => {
    await listUniformMeasurementGroups("user-id", "public-org-id");

    expect(requireOrganizationPermissionMock).toHaveBeenCalledWith(
      "user-id",
      "public-org-id",
      "VIEW_ORDERS",
    );
    expect(prismaMock.masterMeasurementGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "authorized-internal-org", is_active: true },
    }));
  });

  it("creates and assigns a named group in one tenant-scoped audited transaction", async () => {
    await expect(createUniformMeasurementGroupAndAssign(
      "user-id",
      "public-org-id",
      ["measurement-a", "measurement-b"],
      "Winter",
    )).resolves.toEqual({ id: "group-id", group_name: "WINTER" });

    expect(transactionMock.masterMeasurementGroup.create).toHaveBeenCalledWith({
      data: { organization_id: "authorized-internal-org", group_name: "WINTER" },
      select: { id: true, group_name: true },
    });
    expect(transactionMock.uniformEmployeeMeasurement.updateMany).toHaveBeenCalledWith({
      where: { organization_id: "authorized-internal-org", id: { in: ["measurement-a", "measurement-b"] }, group_id: null },
      data: { group_id: "group-id" },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "authorized-internal-org",
      action: "employee-measurement-group.created-and-assigned",
      entityId: "group-id",
      details: { groupName: "WINTER", measurementCount: 2 },
    }), transactionMock);
  });

  it("rejects foreign measurement IDs when the tenant-scoped update does not match the selection", async () => {
    transactionMock.uniformEmployeeMeasurement.updateMany.mockResolvedValue({ count: 1 });

    await expect(createUniformMeasurementGroupAndAssign(
      "user-id",
      "public-org-id",
      ["local-measurement", "foreign-measurement"],
      "Winter",
    )).rejects.toThrow("unavailable in this organization");
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });

  it("assigns selected measurements to an existing organization-scoped group", async () => {
    await expect(assignUniformMeasurementsToGroup(
      "user-id",
      "public-org-id",
      ["measurement-a", "measurement-b"],
      "group-id",
    )).resolves.toEqual({ id: "group-id", group_name: "WINTER" });

    expect(transactionMock.uniformEmployeeMeasurement.updateMany).toHaveBeenCalledWith({
      where: { organization_id: "authorized-internal-org", id: { in: ["measurement-a", "measurement-b"] }, group_id: null },
      data: { group_id: "group-id" },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "authorized-internal-org",
      action: "employee-measurements.group-assigned",
      entityId: "group-id",
      details: { groupName: "WINTER", measurementCount: 2 },
    }), transactionMock);
  });

  it("does not allow assigning to a group outside the authorized organization", async () => {
    transactionMock.masterMeasurementGroup.findFirst.mockResolvedValue(null);

    await expect(assignUniformMeasurementsToGroup(
      "user-id",
      "public-org-id",
      ["measurement-a"],
      "foreign-group",
    )).rejects.toThrow("active measurement group in this organization");
    expect(transactionMock.masterMeasurementGroup.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "authorized-internal-org", id: "foreign-group", is_active: true },
      select: { id: true, group_name: true },
    });
    expect(transactionMock.uniformEmployeeMeasurement.updateMany).not.toHaveBeenCalled();
  });

  it("loads every member and detail row under the authorized organization", async () => {
    await getUniformMeasurementGroup("user-id", "public-org-id", "group-id");

    expect(prismaMock.masterMeasurementGroup.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "authorized-internal-org", id: "group-id", is_active: true },
      select: { id: true, group_name: true, created_at: true },
    });
    expect(prismaMock.uniformEmployeeMeasurement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "authorized-internal-org", group_id: "group-id" },
      select: expect.objectContaining({
        details: expect.objectContaining({
          where: { organization_id: "authorized-internal-org" },
        }),
      }),
    }));
    expect(prismaMock.uniformEmployeeMeasurement.findMany.mock.calls[0][0]).not.toHaveProperty("take");
  });

  it("ungroups tenant members before deleting only the group and audits within the transaction", async () => {
    await expect(deleteUniformMeasurementGroup("user-id", "public-org-id", "group-id"))
      .resolves.toEqual({ id: "group-id", ungroupedCount: 2 });

    expect(transactionMock.uniformEmployeeMeasurement.updateMany).toHaveBeenCalledWith({
      where: { organization_id: "authorized-internal-org", group_id: "group-id" },
      data: { group_id: null },
    });
    expect(transactionMock.masterMeasurementGroup.deleteMany).toHaveBeenCalledWith({
      where: { organization_id: "authorized-internal-org", id: "group-id" },
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "authorized-internal-org",
      action: "employee-measurement-group.deleted-and-ungrouped",
      entityId: "group-id",
      details: { groupName: "WINTER", measurementCount: 2 },
    }), transactionMock);
  });
});
