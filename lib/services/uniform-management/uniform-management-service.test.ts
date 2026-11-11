import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, UniformOrderStatus } from "@prisma/client";

const { prismaMock, transactionMock, requireOrganizationPermissionMock, createAuditEventMock } = vi.hoisted(() => {
  const transactionMock = {
    uniformOrder: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    uniformOrderAssignment: {
      count: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    uniformParticipant: { findFirst: vi.fn() },
    masterArticle: { findFirst: vi.fn() },
    masterCategory: { findFirst: vi.fn() },
    masterSubCategory: { findFirst: vi.fn() },
    masterMeasurementChart: { findFirst: vi.fn() },
    masterMeasurementChartDetail: { findMany: vi.fn() },
    masterArticleVariant: { findFirst: vi.fn() },
    masterArticleSize: { findFirst: vi.fn() },
    uniformStyleMeasurementField: { findMany: vi.fn() },
    uniformAssignmentMeasurement: { deleteMany: vi.fn(), createMany: vi.fn() },
    uniformEmployeeMeasurementCounter: { upsert: vi.fn() },
    uniformEmployeeMeasurement: { create: vi.fn() },
    uniformEmployeeMeasurementDetail: { createMany: vi.fn() },
  };
  const prismaMock = {
    $transaction: vi.fn(),
    uniformOrder: { findFirst: vi.fn(), findMany: vi.fn() },
    uniformOrderAssignment: { groupBy: vi.fn() },
    masterArticle: { findMany: vi.fn() },
    masterArticleVariant: { findMany: vi.fn() },
    masterSize: { findMany: vi.fn() },
    masterCategory: { findMany: vi.fn() },
    masterSubCategory: { findMany: vi.fn() },
    masterMeasurementChart: { findMany: vi.fn() },
    masterMeasurementChartDetail: { findMany: vi.fn() },
    uniformParticipant: { findMany: vi.fn() },
  };
  const requireOrganizationPermissionMock = vi.fn();
  const createAuditEventMock = vi.fn();
  return { prismaMock, transactionMock, requireOrganizationPermissionMock, createAuditEventMock };
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
  getUniformMeasurementSetup,
  getUniformOrderConsolidation,
  saveUniformOrderAssignment,
  transitionUniformOrder,
} from "./uniform-management-service";

beforeEach(() => {
  vi.clearAllMocks();
  requireOrganizationPermissionMock.mockResolvedValue({ organization_id: "internal-org-id" });
  prismaMock.$transaction.mockImplementation(
    (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock),
  );
  transactionMock.uniformOrder.findFirst.mockResolvedValue({
    id: "order-id",
    order_no: "UO-2026-000001",
    status: UniformOrderStatus.DRAFT,
  });
  transactionMock.uniformOrderAssignment.count.mockResolvedValue(1);
  transactionMock.uniformOrderAssignment.findFirst.mockResolvedValue(null);
  transactionMock.uniformParticipant.findFirst.mockResolvedValue({ id: "participant-id", participant_code: "P-001" });
  transactionMock.masterArticle.findFirst.mockResolvedValue({ id: "style-id", article: "Oxford Shirt" });
  transactionMock.masterCategory.findFirst.mockResolvedValue({ id: "category-id" });
  transactionMock.masterSubCategory.findFirst.mockResolvedValue({ id: "subcategory-id", category_id: "category-id" });
  transactionMock.masterMeasurementChart.findFirst.mockResolvedValue({ id: "chart-id" });
  transactionMock.masterMeasurementChartDetail.findMany.mockResolvedValue([]);
  transactionMock.masterArticleVariant.findFirst.mockResolvedValue({ id: "variant-id" });
  transactionMock.masterArticleSize.findFirst.mockResolvedValue({ id: "size-link-id" });
  transactionMock.uniformStyleMeasurementField.findMany.mockResolvedValue([]);
  transactionMock.uniformEmployeeMeasurementCounter.upsert.mockResolvedValue({ current_value: 1 });
  transactionMock.uniformEmployeeMeasurement.create.mockResolvedValue({
    id: "measurement-id",
    measurement_no: "EM-2026-000001",
  });
  transactionMock.uniformEmployeeMeasurementDetail.createMany.mockResolvedValue({ count: 2 });
  transactionMock.uniformOrder.update.mockResolvedValue({
    id: "order-id",
    order_no: "UO-2026-000001",
    status: UniformOrderStatus.OPEN,
  });
  prismaMock.uniformOrder.findFirst.mockResolvedValue({
    id: "order-id",
    order_no: "UO-2026-000001",
    title: "Winter uniforms",
    status: UniformOrderStatus.OPEN,
  });
  prismaMock.uniformOrderAssignment.groupBy.mockResolvedValue([{
    style_id: "style-id",
    variant_id: "variant-id",
    size_id: "size-id",
    _count: { _all: 3 },
  }]);
  prismaMock.masterArticle.findMany.mockResolvedValue([{ id: "style-id", article: "Oxford Shirt", article_code: "OX-1" }]);
  prismaMock.masterArticleVariant.findMany.mockResolvedValue([{
    id: "variant-id",
    variant: "Blue",
    sku: "OX-1-BL",
    color: { colors: "Navy" },
  }]);
  prismaMock.masterSize.findMany.mockResolvedValue([{ id: "size-id", size: "M" }]);
  prismaMock.masterArticle.findMany.mockResolvedValue([{
    id: "style-id",
    article: "Oxford Shirt",
    article_code: "OX-1",
  }]);
  prismaMock.masterCategory.findMany.mockResolvedValue([]);
  prismaMock.masterSubCategory.findMany.mockResolvedValue([]);
  prismaMock.masterMeasurementChart.findMany.mockResolvedValue([]);
  prismaMock.masterMeasurementChartDetail.findMany.mockResolvedValue([]);
  prismaMock.uniformParticipant.findMany.mockResolvedValue([]);
  prismaMock.uniformOrder.findMany.mockResolvedValue([]);
  createAuditEventMock.mockResolvedValue(undefined);
});

describe("getUniformMeasurementSetup", () => {
  it("loads tenant-scoped category, subcategory, style, participant and open-order options", async () => {
    prismaMock.masterArticle.findMany.mockResolvedValue([{
      id: "style-id",
      article: "Oxford Shirt",
      article_code: "OX-1",
      category_id: "category-id",
      sub_category_id: "subcategory-id",
      variants: [],
      sizes: [],
      uniformMeasurementFields: [],
    }]);
    prismaMock.masterCategory.findMany.mockResolvedValue([{ id: "category-id", category_name: "Shirts" }]);
    prismaMock.masterSubCategory.findMany.mockResolvedValue([{
      id: "subcategory-id",
      category_id: "category-id",
      sub_category: "Formal",
    }]);
    prismaMock.uniformParticipant.findMany.mockResolvedValue([{
      id: "participant-id",
      participant_code: "P-001",
      full_name: "A Person",
    }]);
    prismaMock.uniformOrder.findMany.mockResolvedValue([{
      id: "order-id",
      order_no: "UO-2026-000001",
      title: "Winter uniforms",
    }]);

    await expect(getUniformMeasurementSetup("user-id", "public-org-id")).resolves.toMatchObject({
      categories: [{ id: "category-id", category_name: "Shirts" }],
      subcategories: [{ id: "subcategory-id", category_id: "category-id", sub_category: "Formal" }],
      styles: [{ id: "style-id", category_id: "category-id", sub_category_id: "subcategory-id" }],
      participants: [{ id: "participant-id" }],
      orders: [{ id: "order-id" }],
    });

    expect(requireOrganizationPermissionMock).toHaveBeenCalledWith(
      "user-id",
      "public-org-id",
      "CREATE_ORDERS",
    );
    expect(prismaMock.masterArticle.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id", is_active: true },
      take: 200,
    }));
    expect(prismaMock.masterCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id", id: { in: ["category-id"] }, is_active: true },
    }));
    expect(prismaMock.masterSubCategory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id", id: { in: ["subcategory-id"] }, is_active: true },
    }));
    expect(prismaMock.uniformParticipant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id", is_active: true },
    }));
    expect(prismaMock.uniformOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id", status: { in: ["DRAFT", "OPEN"] } },
    }));
  });
});

describe("createUniformEmployeeMeasurement", () => {
  it("creates tenant-scoped measurement rows separately from the parent record", async () => {
    transactionMock.masterArticle.findFirst.mockResolvedValue({
      id: "style-id",
      category_id: "category-id",
      sub_category_id: "subcategory-id",
    });
    transactionMock.masterMeasurementChartDetail.findMany.mockResolvedValue([
      {
        id: "template-detail-1",
        measurement_area_name: "CHEST",
        minimum_value: new Prisma.Decimal(88),
        maximum_value: new Prisma.Decimal(94),
        size_id: "size-id",
        size: { id: "size-id", is_active: true },
      },
      {
        id: "template-detail-2",
        measurement_area_name: "SLEEVE",
        minimum_value: new Prisma.Decimal(56),
        maximum_value: new Prisma.Decimal(60),
        size_id: "size-id",
        size: { id: "size-id", is_active: true },
      },
    ]);

    await expect(createUniformEmployeeMeasurement("user-id", "public-org-id", {
      participantId: "participant-id",
      categoryId: "category-id",
      subCategoryId: "subcategory-id",
      styleId: "style-id",
      measurementChartId: "chart-id",
      details: [
        { templateDetailId: "template-detail-1", inputValue: "95" },
        { templateDetailId: "template-detail-2", inputValue: "58" },
      ],
    })).resolves.toEqual({ id: "measurement-id", measurement_no: "EM-2026-000001" });

    expect(transactionMock.uniformEmployeeMeasurement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        organization_id: "internal-org-id",
        fit_status: "Mismatch",
      }),
    }));
    expect(transactionMock.uniformEmployeeMeasurement.create.mock.calls[0][0].data).not.toHaveProperty("details");
    expect(transactionMock.uniformEmployeeMeasurementDetail.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          organization_id: "internal-org-id",
          employee_measurement_id: "measurement-id",
          measurement_area_name: "CHEST",
          predicted_size_id: null,
        }),
        expect.objectContaining({
          organization_id: "internal-org-id",
          employee_measurement_id: "measurement-id",
          measurement_area_name: "SLEEVE",
          predicted_size_id: "size-id",
        }),
      ],
    });
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-id",
      entityId: "measurement-id",
      action: "employee-measurement.created",
    }), transactionMock);
  });
});

describe("saveUniformOrderAssignment", () => {
  it("does not overwrite an existing assignment from the new measurement entry flow", async () => {
    transactionMock.uniformOrderAssignment.findFirst.mockResolvedValue({ id: "assignment-id" });

    await expect(saveUniformOrderAssignment("user-id", "public-org-id", {
      orderId: "order-id",
      participantId: "participant-id",
      styleId: "style-id",
      variantId: "variant-id",
      sizeId: "size-id",
      measurements: {},
      rejectExisting: true,
    })).rejects.toThrow("already has this style in the selected order");

    expect(transactionMock.uniformOrderAssignment.update).not.toHaveBeenCalled();
    expect(transactionMock.uniformAssignmentMeasurement.deleteMany).not.toHaveBeenCalled();
  });
});

describe("getUniformOrderConsolidation", () => {
  it("groups assignments by organization, style, color and size", async () => {
    await expect(getUniformOrderConsolidation("user-id", "public-org-id", "order-id"))
      .resolves.toEqual({
        order: {
          id: "order-id",
          order_no: "UO-2026-000001",
          title: "Winter uniforms",
          status: UniformOrderStatus.OPEN,
        },
        rows: [{
          id: "style-id:variant-id:size-id",
          style: "Oxford Shirt",
          styleCode: "OX-1",
          color: "Navy",
          sku: "OX-1-BL",
          size: "M",
          quantity: 3,
        }],
      });

    expect(prismaMock.uniformOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id", id: "order-id" },
    }));
    expect(prismaMock.uniformOrderAssignment.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      by: ["style_id", "variant_id", "size_id"],
      where: { organization_id: "internal-org-id", order_id: "order-id" },
    }));
  });
});

describe("transitionUniformOrder", () => {
  it("scopes the order lookup and update to the authorized internal organization", async () => {
    await transitionUniformOrder("user-id", "public-org-id", "order-id", UniformOrderStatus.OPEN);

    expect(requireOrganizationPermissionMock).toHaveBeenCalledWith(
      "user-id",
      "public-org-id",
      "CREATE_ORDERS",
    );
    expect(transactionMock.uniformOrder.findFirst).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-id", id: "order-id" },
      select: { id: true, order_no: true, status: true },
    });
    expect(transactionMock.uniformOrder.update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id_id: {
          organization_id: "internal-org-id",
          id: "order-id",
        },
      },
      data: { status: UniformOrderStatus.OPEN },
    }));
    expect(createAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "internal-org-id",
      userId: "user-id",
      action: "ORDER_STATUS_CHANGED",
    }), transactionMock);
  });

  it("rejects opening an order with no assignments", async () => {
    transactionMock.uniformOrderAssignment.count.mockResolvedValue(0);

    await expect(transitionUniformOrder(
      "user-id",
      "public-org-id",
      "order-id",
      UniformOrderStatus.OPEN,
    )).rejects.toThrow("Add at least one participant and style");

    expect(transactionMock.uniformOrder.update).not.toHaveBeenCalled();
    expect(createAuditEventMock).not.toHaveBeenCalled();
  });

  it("rejects illegal lifecycle transitions before writing", async () => {
    await expect(transitionUniformOrder(
      "user-id",
      "public-org-id",
      "order-id",
      UniformOrderStatus.CLOSED,
    )).rejects.toThrow("cannot move from DRAFT to CLOSED");

    expect(transactionMock.uniformOrderAssignment.count).not.toHaveBeenCalled();
    expect(transactionMock.uniformOrder.update).not.toHaveBeenCalled();
  });

  it("does not resolve an order ID outside the authorized organization", async () => {
    transactionMock.uniformOrder.findFirst.mockResolvedValue(null);

    await expect(transitionUniformOrder(
      "user-id",
      "public-org-id",
      "foreign-order-id",
      UniformOrderStatus.OPEN,
    )).rejects.toThrow("Uniform order not found");

    expect(transactionMock.uniformOrder.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id", id: "foreign-order-id" },
    }));
    expect(transactionMock.uniformOrder.update).not.toHaveBeenCalled();
  });
});
