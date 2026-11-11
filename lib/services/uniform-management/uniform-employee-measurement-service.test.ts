import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const {
  prismaMock,
  transactionMock,
  requireOrganizationPermissionMock,
  createAuditEventMock,
} = vi.hoisted(() => {
  const transactionMock = {
    uniformParticipant: { findFirst: vi.fn() },
    masterCategory: { findFirst: vi.fn() },
    masterSubCategory: { findFirst: vi.fn() },
    masterArticle: { findFirst: vi.fn() },
    masterMeasurementChart: { findFirst: vi.fn() },
    masterMeasurementChartDetail: { findMany: vi.fn() },
    uniformEmployeeMeasurementCounter: { upsert: vi.fn() },
    uniformEmployeeMeasurement: { create: vi.fn() },
    uniformEmployeeMeasurementDetail: { createMany: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(),
    masterMeasurementChart: { findFirst: vi.fn() },
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
  createUniformEmployeeMeasurement,
  getUniformMeasurementChartDetails,
} from "./uniform-management-service";

const validInput = {
  participantId: "person-id",
  categoryId: "category-id",
  subCategoryId: "subcategory-id",
  styleId: "style-id",
  measurementChartId: "chart-id",
  details: [{
    templateDetailId: "chart-detail-id",
    inputValue: "35.25",
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  requireOrganizationPermissionMock.mockResolvedValue({ organization_id: "internal-org-id" });
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  transactionMock.uniformParticipant.findFirst.mockResolvedValue({ id: "person-id" });
  transactionMock.masterCategory.findFirst.mockResolvedValue({ id: "category-id" });
  transactionMock.masterSubCategory.findFirst.mockResolvedValue({ id: "subcategory-id", category_id: "category-id" });
  transactionMock.masterArticle.findFirst.mockResolvedValue({
    id: "style-id",
    category_id: "category-id",
    sub_category_id: "subcategory-id",
  });
  transactionMock.masterMeasurementChart.findFirst.mockResolvedValue({ id: "chart-id" });
  transactionMock.masterMeasurementChartDetail.findMany.mockResolvedValue([{
    id: "chart-detail-id",
    measurement_area_name: "CHEST",
    minimum_value: new Prisma.Decimal("34"),
    maximum_value: new Prisma.Decimal("36"),
    size_id: "predicted-size-id",
    size: { id: "predicted-size-id", is_active: true },
  }]);
  transactionMock.uniformEmployeeMeasurementCounter.upsert.mockResolvedValue({ current_value: 1 });
  transactionMock.uniformEmployeeMeasurement.create.mockResolvedValue({
    id: "measurement-id",
    measurement_no: "EM-2026-000001",
  });
  transactionMock.uniformEmployeeMeasurementDetail.createMany.mockResolvedValue({ count: 1 });
  createAuditEventMock.mockResolvedValue(undefined);
});

describe("createUniformEmployeeMeasurement", () => {
  it("creates an audited record with tenant-scoped master lookups and an atomic number", async () => {
    await expect(createUniformEmployeeMeasurement("user-id", "public-org-id", validInput))
      .resolves.toEqual({ id: "measurement-id", measurement_no: "EM-2026-000001" });

    expect(requireOrganizationPermissionMock).toHaveBeenCalledWith(
      "user-id",
      "public-org-id",
      "CREATE_ORDERS",
    );
    expect(transactionMock.masterMeasurementChartDetail.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "internal-org-id",
        measurement_chart_id: "chart-id",
        is_active: true,
      },
    }));
    expect(transactionMock.uniformEmployeeMeasurementCounter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id" },
      update: { current_value: { increment: 1 } },
    }));
    expect(transactionMock.uniformEmployeeMeasurement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-id",
        measurement_no: "EM-2026-000001",
        status: "Recorded",
        size_id: null,
        fit_status: "Perfect Fit",
      }),
    }));
    expect(transactionMock.uniformEmployeeMeasurement.create.mock.calls[0][0].data).not.toHaveProperty("details");
    expect(transactionMock.uniformEmployeeMeasurementDetail.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        organization_id: "internal-org-id",
        employee_measurement_id: "measurement-id",
        measurement_area_id: null,
        measurement_area_name: "CHEST",
        input_value: new Prisma.Decimal("35.25"),
        minimum_value: new Prisma.Decimal("34"),
        maximum_value: new Prisma.Decimal("36"),
        predicted_size_id: "predicted-size-id",
      })],
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-id",
      userId: "user-id",
      action: "employee-measurement.created",
      entityId: "measurement-id",
    }), transactionMock);
  });

  it("rejects template areas that do not belong to the selected chart", async () => {
    transactionMock.masterMeasurementChartDetail.findMany.mockResolvedValue([]);

    await expect(createUniformEmployeeMeasurement("user-id", "public-org-id", validInput))
      .rejects.toThrow("Submit every active area");

    expect(transactionMock.uniformEmployeeMeasurementCounter.upsert).not.toHaveBeenCalled();
    expect(transactionMock.uniformEmployeeMeasurement.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate areas before opening a transaction", async () => {
    await expect(createUniformEmployeeMeasurement("user-id", "public-org-id", {
      ...validInput,
      details: [validInput.details[0], validInput.details[0]],
    })).rejects.toThrow("use each template area once");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("uses the mapped size only when the measurement is within the configured range", async () => {
    await createUniformEmployeeMeasurement("user-id", "public-org-id", {
      ...validInput,
      details: [{ templateDetailId: "chart-detail-id", inputValue: "36.01" }],
    });

    expect(transactionMock.uniformEmployeeMeasurement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fit_status: "Mismatch",
      }),
    }));
    expect(transactionMock.uniformEmployeeMeasurementDetail.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ predicted_size_id: null })],
    });
  });

  describe("getUniformMeasurementChartDetails", () => {
    it("loads bounded chart detail rows through a tenant-authorized active template", async () => {
      prismaMock.masterMeasurementChart.findFirst.mockResolvedValue({
        id: "chart-id",
        measurement_details: [{
          id: "chart-detail-id",
          measurement_area_name: "CHEST",
          minimum_value: new Prisma.Decimal("34.00"),
          maximum_value: new Prisma.Decimal("36.00"),
          size_id: "size-id",
          size: { size: "M", is_active: true },
        }],
      });

      await expect(getUniformMeasurementChartDetails("user-id", "public-org-id", "chart-id"))
        .resolves.toEqual([{
          id: "chart-detail-id",
          measurement_area_name: "CHEST",
          minimum_value: "34",
          maximum_value: "36",
          size_id: "size-id",
          size_name: "M",
        }]);

      expect(requireOrganizationPermissionMock).toHaveBeenCalledWith(
        "user-id",
        "public-org-id",
        "CREATE_ORDERS",
      );
      expect(prismaMock.masterMeasurementChart.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { organization_id: "internal-org-id", id: "chart-id", is_active: true },
        select: expect.objectContaining({
          measurement_details: expect.objectContaining({
            where: { organization_id: "internal-org-id", is_active: true },
            take: 201,
          }),
        }),
      }));
    });

    it("rejects templates that exceed the supported form limit", async () => {
      prismaMock.masterMeasurementChart.findFirst.mockResolvedValue({
        id: "chart-id",
        measurement_details: Array.from({ length: 201 }, (_, index) => ({
          id: `detail-${index}`,
          measurement_area_name: `AREA ${index}`,
          minimum_value: new Prisma.Decimal("1"),
          maximum_value: new Prisma.Decimal("2"),
          size_id: "size-id",
          size: { size: "M", is_active: true },
        })),
      });

      await expect(getUniformMeasurementChartDetails("user-id", "public-org-id", "chart-id"))
        .rejects.toThrow("cannot contain more than 200 active areas");
    });

    it("does not return a template outside the authorized organization", async () => {
      prismaMock.masterMeasurementChart.findFirst.mockResolvedValue(null);

      await expect(getUniformMeasurementChartDetails("user-id", "public-org-id", "foreign-chart"))
        .rejects.toThrow("active measurement template in this organization");
    });
  });

  it.each(["34", "36"])("matches the mapped size at the inclusive range boundary %s", async (inputValue) => {
    await createUniformEmployeeMeasurement("user-id", "public-org-id", {
      ...validInput,
      details: [{ templateDetailId: "chart-detail-id", inputValue }],
    });

    expect(transactionMock.uniformEmployeeMeasurementDetail.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ predicted_size_id: "predicted-size-id" })],
    });
  });

  it("requires every active row in the selected template", async () => {
    transactionMock.masterMeasurementChartDetail.findMany.mockResolvedValue([
      {
        id: "chart-detail-id",
        measurement_area_name: "CHEST",
        minimum_value: new Prisma.Decimal("34"),
        maximum_value: new Prisma.Decimal("36"),
        size_id: "predicted-size-id",
        size: { id: "predicted-size-id", is_active: true },
      },
      {
        id: "second-chart-detail-id",
        measurement_area_name: "SLEEVE",
        minimum_value: new Prisma.Decimal("20"),
        maximum_value: new Prisma.Decimal("22"),
        size_id: "predicted-size-id",
        size: { id: "predicted-size-id", is_active: true },
      },
    ]);

    await expect(createUniformEmployeeMeasurement("user-id", "public-org-id", validInput))
      .rejects.toThrow("Submit every active area");
    expect(transactionMock.uniformEmployeeMeasurement.create).not.toHaveBeenCalled();
  });

  it("rejects template areas without a configured range and active mapped size", async () => {
    transactionMock.masterMeasurementChartDetail.findMany.mockResolvedValue([{
      id: "chart-detail-id",
      measurement_area_name: "CHEST",
      minimum_value: null,
      maximum_value: null,
      size_id: null,
      size: null,
    }]);

    await expect(createUniformEmployeeMeasurement("user-id", "public-org-id", validInput))
      .rejects.toThrow("Configure a valid Min, Max, and active Size");
    expect(transactionMock.uniformEmployeeMeasurement.create).not.toHaveBeenCalled();
  });

  it("rejects values exceeding decimal precision or limits", async () => {
    await expect(createUniformEmployeeMeasurement("user-id", "public-org-id", {
      ...validInput,
      details: [{ ...validInput.details[0], inputValue: "10000" }],
    })).rejects.toThrow("Input must be a number");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
