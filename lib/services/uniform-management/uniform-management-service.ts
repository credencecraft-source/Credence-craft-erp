import { randomUUID } from "node:crypto";
import { Prisma, UniformOrderStatus } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  normalizeOptionalUniformText,
  normalizeUniformText,
  parseUniformDate,
  parseUniformMeasurementValue,
  UniformManagementError,
} from "./uniform-management-contract";

const LIST_LIMIT = 200;

async function requireUniformPermission(
  userId: string,
  organizationPublicId: string,
  permission: "VIEW_ORDERS" | "CREATE_ORDERS" | "MANAGE_MASTER_DATA",
) {
  return requireOrganizationPermission(userId, organizationPublicId, permission);
}

export async function getUniformManagementDashboard(userId: string, organizationPublicId: string) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  const organizationId = membership.organization_id;
  const [participants, styles] = await Promise.all([
    prisma.uniformParticipant.count({ where: { organization_id: organizationId, is_active: true } }),
    prisma.masterArticle.count({ where: { organization_id: organizationId, is_active: true } }),
  ]);
  return { participants, styles };
}

export async function listUniformStyles(userId: string, organizationPublicId: string) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  return prisma.masterArticle.findMany({
    where: { organization_id: membership.organization_id, is_active: true },
    orderBy: [{ article: "asc" }, { id: "asc" }],
    take: LIST_LIMIT,
    select: {
      id: true,
      value_id: true,
      article: true,
      article_code: true,
      category_id: true,
      sub_category_id: true,
      size_group_id: true,
      variants: {
        where: { organization_id: membership.organization_id, is_active: true },
        orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        select: {
          id: true,
          variant: true,
          variant_code: true,
          sku: true,
          color: { select: { colors: true } },
        },
      },
      sizes: {
        where: { organization_id: membership.organization_id },
        orderBy: [{ size: { sort_order: "asc" } }, { id: "asc" }],
        select: { size: { select: { id: true, size: true, is_active: true } } },
      },
    },
  });
}

export async function getUniformMeasurementSetup(userId: string, organizationPublicId: string) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "CREATE_ORDERS");
  const organizationId = membership.organization_id;
  const [styles, participants, orders] = await Promise.all([
    prisma.masterArticle.findMany({
      where: { organization_id: organizationId, is_active: true },
      orderBy: [{ article: "asc" }, { id: "asc" }],
      take: LIST_LIMIT,
      select: {
        id: true,
        article: true,
        article_code: true,
        category_id: true,
        sub_category_id: true,
        variants: {
          where: { organization_id: organizationId, is_active: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          select: {
            id: true,
            sku: true,
            color: { select: { colors: true } },
          },
        },
        sizes: {
          where: { organization_id: organizationId, size: { is_active: true } },
          orderBy: [{ size: { sort_order: "asc" } }, { id: "asc" }],
          select: { size: { select: { id: true, size: true } } },
        },
        uniformMeasurementFields: {
          where: { organization_id: organizationId, is_active: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          select: { field_key: true, label: true, unit: true, is_required: true },
        },
      },
    }),
    prisma.uniformParticipant.findMany({
      where: { organization_id: organizationId, is_active: true },
      orderBy: [{ full_name: "asc" }, { id: "asc" }],
      take: LIST_LIMIT,
      select: { id: true, participant_code: true, full_name: true },
    }),
    prisma.uniformOrder.findMany({
      where: { organization_id: organizationId, status: { in: ["DRAFT", "OPEN"] } },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: LIST_LIMIT,
      select: { id: true, order_no: true, title: true },
    }),
  ]);
  const categoryIds = [...new Set(styles.flatMap((style) => style.category_id ? [style.category_id] : []))];
  const subcategoryIds = [...new Set(styles.flatMap((style) => style.sub_category_id ? [style.sub_category_id] : []))];
  const [categories, subcategories] = await Promise.all([
    categoryIds.length
      ? prisma.masterCategory.findMany({
          where: { organization_id: organizationId, id: { in: categoryIds }, is_active: true },
          orderBy: [{ sort_order: "asc" }, { category_name: "asc" }, { id: "asc" }],
          select: { id: true, category_name: true },
        })
      : Promise.resolve([]),
    subcategoryIds.length
      ? prisma.masterSubCategory.findMany({
          where: { organization_id: organizationId, id: { in: subcategoryIds }, is_active: true },
          orderBy: [{ sort_order: "asc" }, { sub_category: "asc" }, { id: "asc" }],
          select: { id: true, category_id: true, sub_category: true },
        })
      : Promise.resolve([]),
  ]);
  return {
    categories,
    subcategories,
    styles,
    participants,
    orders,
  };
}

export async function getUniformEmployeeMeasurementSetup(userId: string, organizationPublicId: string) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "CREATE_ORDERS");
  const organizationId = membership.organization_id;
  const [participants, categories, subcategories, styles, charts] = await Promise.all([
    prisma.uniformParticipant.findMany({ where: { organization_id: organizationId, is_active: true }, orderBy: [{ full_name: "asc" }, { id: "asc" }], take: LIST_LIMIT, select: { id: true, participant_code: true, full_name: true } }),
    prisma.masterCategory.findMany({ where: { organization_id: organizationId, is_active: true }, orderBy: [{ category_name: "asc" }, { id: "asc" }], take: LIST_LIMIT, select: { id: true, category_name: true } }),
    prisma.masterSubCategory.findMany({ where: { organization_id: organizationId, is_active: true }, orderBy: [{ sub_category: "asc" }, { id: "asc" }], take: LIST_LIMIT, select: { id: true, category_id: true, sub_category: true } }),
    prisma.masterArticle.findMany({ where: { organization_id: organizationId, is_active: true }, orderBy: [{ article: "asc" }, { id: "asc" }], take: LIST_LIMIT, select: { id: true, article: true, category_id: true, sub_category_id: true } }),
    prisma.masterMeasurementChart.findMany({ where: { organization_id: organizationId, is_active: true }, orderBy: [{ measurement_chart: "asc" }, { id: "asc" }], take: LIST_LIMIT, select: { id: true, measurement_chart: true } }),
  ]);
  return {
    participants,
    categories,
    subcategories,
    styles,
    charts,
  };
}

export async function getUniformMeasurementChartDetails(
  userId: string,
  organizationPublicId: string,
  chartId: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "CREATE_ORDERS");
  if (!chartId.trim()) throw new UniformManagementError("Choose a measurement template.");

  const chart = await prisma.masterMeasurementChart.findFirst({
    where: { organization_id: membership.organization_id, id: chartId, is_active: true },
    select: {
      id: true,
      measurement_details: {
        where: { organization_id: membership.organization_id, is_active: true },
        orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        take: LIST_LIMIT + 1,
        select: {
          id: true,
          measurement_area_name: true,
          minimum_value: true,
          maximum_value: true,
          size_id: true,
          size: { select: { size: true, is_active: true } },
        },
      },
    },
  });
  if (!chart) throw new UniformManagementError("Choose an active measurement template in this organization.");
  if (chart.measurement_details.length > LIST_LIMIT) {
    throw new UniformManagementError(`A measurement template cannot contain more than ${LIST_LIMIT} active areas.`);
  }
  return chart.measurement_details.map((detail) => ({
    id: detail.id,
    measurement_area_name: detail.measurement_area_name,
    minimum_value: detail.minimum_value?.toString() ?? null,
    maximum_value: detail.maximum_value?.toString() ?? null,
    size_id: detail.size_id,
    size_name: detail.size?.is_active ? detail.size.size : null,
  }));
}

type UniformEmployeeMeasurementDetailInput = {
  templateDetailId: string;
  inputValue: string;
};

type UniformEmployeeMeasurementInput = {
  participantId: string;
  categoryId: string;
  subCategoryId: string;
  styleId: string;
  measurementChartId: string;
  details: UniformEmployeeMeasurementDetailInput[];
};

function parseEmployeeMeasurementDecimal(value: string, label: string, optional = false) {
  const normalized = value.trim();
  if (!normalized && optional) return null;
  if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(normalized)) {
    throw new UniformManagementError(`${label} must be a number with up to two decimal places.`);
  }
  const result = new Prisma.Decimal(normalized);
  if (!result.isFinite() || result.isNegative() || result.greaterThan("9999.99")) {
    throw new UniformManagementError(`${label} must be between 0 and 9999.99.`);
  }
  return result;
}

export async function listUniformEmployeeMeasurements(userId: string, organizationPublicId: string) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  return prisma.uniformEmployeeMeasurement.findMany({
    where: { organization_id: membership.organization_id, group_id: null },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: LIST_LIMIT,
    select: {
      id: true, measurement_no: true, status: true, fit_status: true, created_at: true,
      participant: { select: { participant_code: true, full_name: true } },
      category: { select: { category_name: true } },
      sub_category: { select: { sub_category: true } },
      style: { select: { article: true } },
      measurement_chart: { select: { measurement_chart: true } },
      size: { select: { size: true } },
      _count: { select: { details: true } },
    },
  });
}

export async function getUniformEmployeeMeasurement(userId: string, organizationPublicId: string, measurementId: string) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  const record = await prisma.uniformEmployeeMeasurement.findFirst({
    where: { organization_id: membership.organization_id, id: measurementId },
    select: {
      id: true, measurement_no: true, status: true, fit_status: true, created_at: true,
      participant: { select: { participant_code: true, full_name: true } },
      group: { select: { group_name: true } },
      category: { select: { category_name: true } },
      sub_category: { select: { sub_category: true } },
      style: { select: { article: true } },
      measurement_chart: { select: { measurement_chart: true } },
      size: { select: { size: true } },
      details: {
        where: { organization_id: membership.organization_id },
        orderBy: [{ measurement_area: { sort_order: "asc" } }, { id: "asc" }],
        select: {
          input_value: true, minimum_value: true, maximum_value: true, measurement_area_name: true,
          measurement_area: { select: { measurement_area_name: true } },
          predicted_size: { select: { size: true } },
        },
      },
    },
  });
  if (!record) throw new UniformManagementError("Employee measurement record was not found.");
  return record;
}

export async function listUniformMeasurementGroups(userId: string, organizationPublicId: string) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  return prisma.masterMeasurementGroup.findMany({
    where: { organization_id: membership.organization_id, is_active: true },
    orderBy: [{ group_name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      group_name: true,
      created_at: true,
      _count: { select: { measurements: true } },
    },
  });
}

export async function getUniformMeasurementGroup(
  userId: string,
  organizationPublicId: string,
  groupId: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  const organizationId = membership.organization_id;
  const group = await prisma.masterMeasurementGroup.findFirst({
    where: { organization_id: organizationId, id: groupId, is_active: true },
    select: { id: true, group_name: true, created_at: true },
  });
  if (!group) throw new UniformManagementError("Measurement group was not found.");

  const measurements = await prisma.uniformEmployeeMeasurement.findMany({
    where: { organization_id: organizationId, group_id: group.id },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      id: true,
      measurement_no: true,
      status: true,
      fit_status: true,
      created_at: true,
      participant: { select: { participant_code: true, full_name: true } },
      category: { select: { category_name: true } },
      sub_category: { select: { sub_category: true } },
      style: { select: { article: true } },
      measurement_chart: { select: { measurement_chart: true } },
      size: { select: { size: true } },
      details: {
        where: { organization_id: organizationId },
        orderBy: [{ measurement_area: { sort_order: "asc" } }, { id: "asc" }],
        select: {
          input_value: true,
          minimum_value: true,
          maximum_value: true,
          measurement_area_name: true,
          measurement_area: { select: { measurement_area_name: true } },
          predicted_size: { select: { size: true } },
        },
      },
    },
  });
  return { ...group, measurements };
}

function validateMeasurementGroupSelection(measurementIds: string[]) {
  if (
    !Array.isArray(measurementIds)
    || measurementIds.length < 1
    || measurementIds.length > LIST_LIMIT
    || measurementIds.some((id) => typeof id !== "string" || !id.trim())
    || new Set(measurementIds).size !== measurementIds.length
  ) {
    throw new UniformManagementError(`Select between 1 and ${LIST_LIMIT} unique employee measurements.`);
  }
}

export async function createUniformMeasurementGroupAndAssign(
  userId: string,
  organizationPublicId: string,
  measurementIds: string[],
  groupNameInput: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "MANAGE_MASTER_DATA");
  const organizationId = membership.organization_id;
  const groupName = normalizeUniformText(groupNameInput, "Group name", 255);
  validateMeasurementGroupSelection(measurementIds);

  return prisma.$transaction(async (transaction) => {
    const group = await transaction.masterMeasurementGroup.create({
      data: { organization_id: organizationId, group_name: groupName },
      select: { id: true, group_name: true },
    });
    const assignment = await transaction.uniformEmployeeMeasurement.updateMany({
      where: { organization_id: organizationId, id: { in: measurementIds }, group_id: null },
      data: { group_id: group.id },
    });
    if (assignment.count !== measurementIds.length) {
      throw new UniformManagementError("One or more selected measurements are unavailable in this organization.");
    }
    await createAuditEvent({
      organizationId,
      userId,
      module: "uniform-management",
      action: "employee-measurement-group.created-and-assigned",
      entityType: "MasterMeasurementGroup",
      entityId: group.id,
      details: { groupName, measurementCount: assignment.count },
    }, transaction);
    return group;
  });
}

export async function assignUniformMeasurementsToGroup(
  userId: string,
  organizationPublicId: string,
  measurementIds: string[],
  groupId: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "MANAGE_MASTER_DATA");
  const organizationId = membership.organization_id;
  validateMeasurementGroupSelection(measurementIds);
  if (!groupId.trim()) throw new UniformManagementError("Choose a measurement group.");

  return prisma.$transaction(async (transaction) => {
    const group = await transaction.masterMeasurementGroup.findFirst({
      where: { organization_id: organizationId, id: groupId, is_active: true },
      select: { id: true, group_name: true },
    });
    if (!group) throw new UniformManagementError("Choose an active measurement group in this organization.");

    const assignment = await transaction.uniformEmployeeMeasurement.updateMany({
      where: { organization_id: organizationId, id: { in: measurementIds }, group_id: null },
      data: { group_id: group.id },
    });
    if (assignment.count !== measurementIds.length) {
      throw new UniformManagementError("One or more selected measurements are unavailable in this organization.");
    }
    await createAuditEvent({
      organizationId,
      userId,
      module: "uniform-management",
      action: "employee-measurements.group-assigned",
      entityType: "MasterMeasurementGroup",
      entityId: group.id,
      details: { groupName: group.group_name, measurementCount: assignment.count },
    }, transaction);
    return group;
  });
}

export async function deleteUniformMeasurementGroup(
  userId: string,
  organizationPublicId: string,
  groupId: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "MANAGE_MASTER_DATA");
  const organizationId = membership.organization_id;
  if (!groupId.trim()) throw new UniformManagementError("Choose a measurement group.");

  return prisma.$transaction(async (transaction) => {
    const group = await transaction.masterMeasurementGroup.findFirst({
      where: { organization_id: organizationId, id: groupId },
      select: { id: true, group_name: true },
    });
    if (!group) throw new UniformManagementError("Measurement group was not found.");

    const ungrouped = await transaction.uniformEmployeeMeasurement.updateMany({
      where: { organization_id: organizationId, group_id: group.id },
      data: { group_id: null },
    });
    const deleted = await transaction.masterMeasurementGroup.deleteMany({
      where: { organization_id: organizationId, id: group.id },
    });
    if (deleted.count !== 1) {
      throw new UniformManagementError("Measurement group could not be deleted. Refresh and try again.");
    }
    await createAuditEvent({
      organizationId,
      userId,
      module: "uniform-management",
      action: "employee-measurement-group.deleted-and-ungrouped",
      entityType: "MasterMeasurementGroup",
      entityId: group.id,
      details: { groupName: group.group_name, measurementCount: ungrouped.count },
    }, transaction);
    return { id: group.id, ungroupedCount: ungrouped.count };
  });
}

export async function createUniformEmployeeMeasurement(
  userId: string,
  organizationPublicId: string,
  input: UniformEmployeeMeasurementInput,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "CREATE_ORDERS");
  const organizationId = membership.organization_id;
  if (!input.participantId || !input.categoryId || !input.subCategoryId || !input.styleId || !input.measurementChartId) {
    throw new UniformManagementError("Person, category, subcategory, style, and measurement template are required.");
  }
  if (input.details.length < 1 || input.details.length > LIST_LIMIT) {
    throw new UniformManagementError(`Add between 1 and ${LIST_LIMIT} measurement rows.`);
  }
  const templateDetailIds = input.details.map((detail) => detail.templateDetailId);
  if (templateDetailIds.some((id) => !id) || new Set(templateDetailIds).size !== templateDetailIds.length) {
    throw new UniformManagementError("Choose a measurement chart template and use each template area once.");
  }
  const details = input.details.map((detail) => {
    const inputValue = parseEmployeeMeasurementDecimal(detail.inputValue, "Input");
    if (!inputValue || inputValue.isZero()) throw new UniformManagementError("Input must be greater than zero.");
    return { templateDetailId: detail.templateDetailId, inputValue };
  });

  return prisma.$transaction(async (transaction) => {
    const [participant, category, subCategory, style, chart, templateDetails] = await Promise.all([
      transaction.uniformParticipant.findFirst({ where: { organization_id: organizationId, id: input.participantId, is_active: true }, select: { id: true } }),
      transaction.masterCategory.findFirst({ where: { organization_id: organizationId, id: input.categoryId, is_active: true }, select: { id: true } }),
      transaction.masterSubCategory.findFirst({ where: { organization_id: organizationId, id: input.subCategoryId, is_active: true }, select: { id: true, category_id: true } }),
      transaction.masterArticle.findFirst({ where: { organization_id: organizationId, id: input.styleId, is_active: true }, select: { id: true, category_id: true, sub_category_id: true } }),
      transaction.masterMeasurementChart.findFirst({ where: { organization_id: organizationId, id: input.measurementChartId, is_active: true }, select: { id: true } }),
      transaction.masterMeasurementChartDetail.findMany({
        where: {
          organization_id: organizationId,
          measurement_chart_id: input.measurementChartId,
          is_active: true,
        },
        select: {
          id: true,
          measurement_area_name: true,
          minimum_value: true,
          maximum_value: true,
          size_id: true,
          size: { select: { id: true, is_active: true } },
        },
      }),
    ]);
    if (!participant) throw new UniformManagementError("Choose an active person in this organization.");
    if (!category || !subCategory || !style || !chart) throw new UniformManagementError("One or more selected master values are unavailable in this organization.");
    if (subCategory.category_id !== input.categoryId || style.category_id !== input.categoryId || style.sub_category_id !== input.subCategoryId) {
      throw new UniformManagementError("The selected style must belong to the selected category and subcategory.");
    }
    const submittedTemplateDetailIds = new Set(templateDetailIds);
    if (templateDetails.length !== templateDetailIds.length || templateDetails.some((detail) => !submittedTemplateDetailIds.has(detail.id))) {
      throw new UniformManagementError("Submit every active area from the selected measurement template.");
    }
    const templateDetailsById = new Map(templateDetails.map((templateDetail) => [templateDetail.id, templateDetail]));
    const resolvedDetails = details.map((detail) => {
      const templateDetail = templateDetailsById.get(detail.templateDetailId);
      if (!templateDetail?.minimum_value || !templateDetail.maximum_value || !templateDetail.size_id || !templateDetail.size?.is_active) {
        throw new UniformManagementError("Configure a valid Min, Max, and active Size for every selected measurement area in the template.");
      }
      if (templateDetail.minimum_value.greaterThan(templateDetail.maximum_value)) {
        throw new UniformManagementError("A measurement template minimum cannot be greater than its maximum.");
      }
      const matchesSize = detail.inputValue.greaterThanOrEqualTo(templateDetail.minimum_value)
        && detail.inputValue.lessThanOrEqualTo(templateDetail.maximum_value);
      return {
        ...detail,
        measurementAreaName: templateDetail.measurement_area_name,
        minimumValue: templateDetail.minimum_value,
        maximumValue: templateDetail.maximum_value,
        predictedSizeId: matchesSize ? templateDetail.size_id : null,
        matchesSize,
      };
    });

    const counter = await transaction.uniformEmployeeMeasurementCounter.upsert({
      where: { organization_id: organizationId },
      create: { organization_id: organizationId, current_value: 1 },
      update: { current_value: { increment: 1 } },
      select: { current_value: true },
    });
    const measurementNo = `EM-${new Date().getFullYear()}-${String(counter.current_value).padStart(6, "0")}`;
    const created = await transaction.uniformEmployeeMeasurement.create({
      data: {
        organization_id: organizationId,
        measurement_no: measurementNo,
        participant_id: participant.id,
        group_id: null,
        category_id: category.id,
        sub_category_id: subCategory.id,
        style_id: style.id,
        status: "Recorded",
        measurement_chart_id: chart.id,
        size_id: null,
        fit_status: resolvedDetails.every((detail) => detail.matchesSize) ? "Perfect Fit" : "Mismatch",
        created_by_user_id: userId,
      },
      select: { id: true, measurement_no: true },
    });
    await transaction.uniformEmployeeMeasurementDetail.createMany({
      data: resolvedDetails.map((detail) => ({
        organization_id: organizationId,
        employee_measurement_id: created.id,
        measurement_area_id: null,
        measurement_area_name: detail.measurementAreaName,
        input_value: detail.inputValue,
        minimum_value: detail.minimumValue,
        maximum_value: detail.maximumValue,
        predicted_size_id: detail.predictedSizeId,
      })),
    });
    await createAuditEvent({
      organizationId,
      userId,
      module: "uniform-management",
      action: "employee-measurement.created",
      entityType: "UniformEmployeeMeasurement",
      entityId: created.id,
      details: { measurementNo, detailCount: details.length },
    }, transaction);
    return created;
  });
}

export async function listUniformParticipants(
  userId: string,
  organizationPublicId: string,
  search = "",
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  const query = search.trim().slice(0, 100);
  return prisma.uniformParticipant.findMany({
    where: {
      organization_id: membership.organization_id,
      is_active: true,
      ...(query ? {
        OR: [
          { participant_code: { contains: query, mode: "insensitive" } },
          { full_name: { contains: query, mode: "insensitive" } },
          { group_label: { contains: query, mode: "insensitive" } },
        ],
      } : {}),
    },
    orderBy: [{ full_name: "asc" }, { id: "asc" }],
    take: LIST_LIMIT,
    select: {
      id: true,
      participant_code: true,
      full_name: true,
      group_label: true,
      created_at: true,
    },
  });
}

export async function getUniformParticipant(
  userId: string,
  organizationPublicId: string,
  participantId: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  const participant = await prisma.uniformParticipant.findFirst({
    where: { organization_id: membership.organization_id, id: participantId },
    select: {
      id: true,
      participant_code: true,
      full_name: true,
      group_label: true,
      is_active: true,
      created_at: true,
    },
  });
  if (!participant) throw new UniformManagementError("Uniform participant not found.");
  return participant;
}

export async function createUniformParticipant(
  userId: string,
  organizationPublicId: string,
  input: { participantCode: string; fullName: string; groupLabel?: string },
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "MANAGE_MASTER_DATA");
  const participantCode = normalizeUniformText(input.participantCode, "Participant code", 64);
  const fullName = normalizeUniformText(input.fullName, "Name", 255);
  const groupLabel = normalizeOptionalUniformText(input.groupLabel ?? "", 160);
  return prisma.$transaction(async (transaction) => {
    const participant = await transaction.uniformParticipant.create({
      data: {
        organization_id: membership.organization_id,
        participant_code: participantCode,
        full_name: fullName,
        group_label: groupLabel,
      },
      select: { id: true, participant_code: true, full_name: true },
    });
    await createAuditEvent({
      organizationId: membership.organization_id,
      userId,
      module: "uniform-management",
      action: "PARTICIPANT_CREATED",
      entityType: "UniformParticipant",
      entityId: participant.id,
      details: { participantCode },
    }, transaction);
    return participant;
  });
}

export async function listUniformOrders(userId: string, organizationPublicId: string) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  return prisma.uniformOrder.findMany({
    where: { organization_id: membership.organization_id },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: LIST_LIMIT,
    select: {
      id: true,
      order_no: true,
      title: true,
      status: true,
      due_date: true,
      created_at: true,
      _count: { select: { assignments: true } },
    },
  });
}

export async function createUniformOrder(
  userId: string,
  organizationPublicId: string,
  input: { title: string; dueDate?: string; notes?: string },
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "CREATE_ORDERS");
  const title = normalizeUniformText(input.title, "Order name", 255);
  const notes = normalizeOptionalUniformText(input.notes ?? "", 1000);
  const dueDate = parseUniformDate(input.dueDate ?? "");
  const year = new Date().getUTCFullYear();

  return prisma.$transaction(async (transaction) => {
    const counter = await transaction.uniformOrderCounter.upsert({
      where: { organization_id: membership.organization_id },
      create: { organization_id: membership.organization_id, current_value: 1 },
      update: { current_value: { increment: 1 } },
      select: { current_value: true },
    });
    const orderNo = `UO-${year}-${String(counter.current_value).padStart(6, "0")}`;
    const order = await transaction.uniformOrder.create({
      data: {
        organization_id: membership.organization_id,
        order_no: orderNo,
        title,
        due_date: dueDate,
        notes,
        created_by_user_id: userId,
      },
      select: { id: true, order_no: true, title: true, status: true },
    });
    await createAuditEvent({
      organizationId: membership.organization_id,
      userId,
      module: "uniform-management",
      action: "ORDER_CREATED",
      entityType: "UniformOrder",
      entityId: order.id,
      details: { orderNo },
    }, transaction);
    return order;
  });
}

export async function getUniformOrder(
  userId: string,
  organizationPublicId: string,
  orderId: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  const order = await prisma.uniformOrder.findFirst({
    where: { organization_id: membership.organization_id, id: orderId },
    select: {
      id: true,
      order_no: true,
      title: true,
      status: true,
      due_date: true,
      notes: true,
      created_at: true,
      assignments: {
        where: { organization_id: membership.organization_id },
        orderBy: [{ participant: { full_name: "asc" } }, { id: "asc" }],
        take: LIST_LIMIT,
        select: {
          id: true,
          participant: { select: { id: true, participant_code: true, full_name: true, group_label: true } },
          style: { select: { id: true, article: true, article_code: true } },
          variant: { select: { id: true, variant: true, sku: true, color: { select: { colors: true } } } },
          size: { select: { id: true, size: true } },
          measurements: {
            orderBy: { field_key: "asc" },
            select: { field_key: true, field_label: true, unit: true, value: true },
          },
        },
      },
    },
  });
  if (!order) throw new UniformManagementError("Uniform order not found.");
  return {
    ...order,
    assignments: order.assignments.map((assignment) => ({
      ...assignment,
      measurements: assignment.measurements.map((measurement) => ({
        ...measurement,
        value: measurement.value.toString(),
      })),
    })),
  };
}

export async function getUniformStyleForMeasurements(
  userId: string,
  organizationPublicId: string,
  styleId: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  const style = await prisma.masterArticle.findFirst({
    where: { organization_id: membership.organization_id, id: styleId, is_active: true },
    select: {
      id: true,
      value_id: true,
      article: true,
      article_code: true,
      variants: {
        where: { organization_id: membership.organization_id, is_active: true },
        orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        select: {
          id: true,
          variant: true,
          sku: true,
          color: { select: { colors: true } },
        },
      },
      sizes: {
        where: { organization_id: membership.organization_id, size: { is_active: true } },
        orderBy: [{ size: { sort_order: "asc" } }, { id: "asc" }],
        select: { size: { select: { id: true, size: true } } },
      },
    },
  });
  if (!style) throw new UniformManagementError("Uniform style not found.");
  return {
    ...style,
    sizes: style.sizes.map(({ size }) => size),
  };
}

export async function saveUniformOrderAssignment(
  userId: string,
  organizationPublicId: string,
  input: {
    orderId: string;
    participantId: string;
    styleId: string;
    variantId: string;
    sizeId: string;
    measurements: Record<string, string>;
    rejectExisting?: boolean;
  },
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "CREATE_ORDERS");
  return prisma.$transaction(async (transaction) => {
    const organizationId = membership.organization_id;
    const [order, participant, style, variant, articleSize, fieldDefinitions] = await Promise.all([
      transaction.uniformOrder.findFirst({
        where: { organization_id: organizationId, id: input.orderId },
        select: { id: true, order_no: true, status: true },
      }),
      transaction.uniformParticipant.findFirst({
        where: { organization_id: organizationId, id: input.participantId, is_active: true },
        select: { id: true, participant_code: true },
      }),
      transaction.masterArticle.findFirst({
        where: { organization_id: organizationId, id: input.styleId, is_active: true },
        select: { id: true, article: true },
      }),
      transaction.masterArticleVariant.findFirst({
        where: {
          organization_id: organizationId,
          article_id: input.styleId,
          id: input.variantId,
          is_active: true,
        },
        select: { id: true },
      }),
      transaction.masterArticleSize.findFirst({
        where: {
          organization_id: organizationId,
          article_id: input.styleId,
          size_id: input.sizeId,
          size: { is_active: true },
        },
        select: { id: true },
      }),
      transaction.uniformStyleMeasurementField.findMany({
        where: { organization_id: organizationId, style_id: input.styleId, is_active: true },
        orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        select: { field_key: true, label: true, unit: true, is_required: true },
      }),
    ]);

    if (!order) throw new UniformManagementError("Uniform order not found.");
    if (order.status !== UniformOrderStatus.DRAFT && order.status !== UniformOrderStatus.OPEN) {
      throw new UniformManagementError("Measurements cannot be changed after an order is closed or cancelled.");
    }
    if (!participant) throw new UniformManagementError("Choose an active participant in this organization.");
    if (!style) throw new UniformManagementError("Choose an active style in this organization.");
    if (!variant) throw new UniformManagementError("Choose an active color variant belonging to this style.");
    if (!articleSize) throw new UniformManagementError("Choose a size belonging to this style.");

    const fieldsByKey = new Map(fieldDefinitions.map((field) => [field.field_key, field]));
    const inputKeys = Object.keys(input.measurements);
    if (inputKeys.some((key) => !fieldsByKey.has(key))) {
      throw new UniformManagementError("Measurements changed while this form was open. Reload the style and try again.");
    }

    const parsedMeasurements = fieldDefinitions.flatMap((field) => {
      const rawValue = input.measurements[field.field_key] ?? "";
      if (!rawValue.trim()) {
        if (field.is_required) throw new UniformManagementError(`${field.label} is required.`);
        return [];
      }
      const value = parseUniformMeasurementValue(rawValue, field.label);
      return [{
        organization_id: organizationId,
        field_key: field.field_key,
        field_label: field.label,
        unit: field.unit,
        value: new Prisma.Decimal(value),
      }];
    });

    const existing = await transaction.uniformOrderAssignment.findFirst({
      where: {
        organization_id: organizationId,
        order_id: order.id,
        participant_id: participant.id,
        style_id: style.id,
      },
      select: { id: true },
    });
    if (existing && input.rejectExisting) {
      throw new UniformManagementError(
        "This person already has this style in the selected order. Open the order and choose Edit measurements to update it.",
      );
    }
    const assignment = existing
      ? await transaction.uniformOrderAssignment.update({
          where: {
            organization_id_id: {
              organization_id: organizationId,
              id: existing.id,
            },
          },
          data: { variant_id: variant.id, size_id: input.sizeId },
          select: { id: true },
        })
      : await transaction.uniformOrderAssignment.create({
          data: {
            organization_id: organizationId,
            order_id: order.id,
            participant_id: participant.id,
            style_id: style.id,
            variant_id: variant.id,
            size_id: input.sizeId,
          },
          select: { id: true },
        });

    await transaction.uniformAssignmentMeasurement.deleteMany({
      where: { organization_id: organizationId, assignment_id: assignment.id },
    });
    if (parsedMeasurements.length > 0) {
      await transaction.uniformAssignmentMeasurement.createMany({
        data: parsedMeasurements.map((measurement) => ({
          ...measurement,
          id: randomUUID(),
          assignment_id: assignment.id,
        })),
      });
    }
    await createAuditEvent({
      organizationId,
      userId,
      module: "uniform-management",
      action: existing ? "ORDER_ASSIGNMENT_UPDATED" : "ORDER_ASSIGNMENT_CREATED",
      entityType: "UniformOrderAssignment",
      entityId: assignment.id,
      details: {
        orderNo: order.order_no,
        participantCode: participant.participant_code,
        styleId: style.id,
        measurementCount: parsedMeasurements.length,
      },
    }, transaction);
    return assignment;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const allowedTransitions: Record<UniformOrderStatus, UniformOrderStatus[]> = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: [],
  CANCELLED: [],
};

export async function transitionUniformOrder(
  userId: string,
  organizationPublicId: string,
  orderId: string,
  nextStatus: UniformOrderStatus,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "CREATE_ORDERS");
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.uniformOrder.findFirst({
      where: { organization_id: membership.organization_id, id: orderId },
      select: { id: true, order_no: true, status: true },
    });
    if (!order) throw new UniformManagementError("Uniform order not found.");
    if (!allowedTransitions[order.status].includes(nextStatus)) {
      throw new UniformManagementError(`Uniform order cannot move from ${order.status} to ${nextStatus}.`);
    }
    if (nextStatus === "OPEN" || nextStatus === "CLOSED") {
      const assignmentCount = await transaction.uniformOrderAssignment.count({
        where: { organization_id: membership.organization_id, order_id: order.id },
      });
      if (assignmentCount === 0) {
        throw new UniformManagementError("Add at least one participant and style before opening or closing this order.");
      }
    }
    const updated = await transaction.uniformOrder.update({
      where: {
        organization_id_id: {
          organization_id: membership.organization_id,
          id: order.id,
        },
      },
      data: { status: nextStatus },
      select: { id: true, order_no: true, status: true },
    });
    await createAuditEvent({
      organizationId: membership.organization_id,
      userId,
      module: "uniform-management",
      action: "ORDER_STATUS_CHANGED",
      entityType: "UniformOrder",
      entityId: order.id,
      details: { orderNo: order.order_no, from: order.status, to: nextStatus },
    }, transaction);
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getUniformOrderConsolidation(
  userId: string,
  organizationPublicId: string,
  orderId: string,
) {
  const membership = await requireUniformPermission(userId, organizationPublicId, "VIEW_ORDERS");
  const organizationId = membership.organization_id;
  const order = await prisma.uniformOrder.findFirst({
    where: { organization_id: organizationId, id: orderId },
    select: { id: true, order_no: true, title: true, status: true },
  });
  if (!order) throw new UniformManagementError("Uniform order not found.");
  const groupedAssignments = await prisma.uniformOrderAssignment.groupBy({
    by: ["style_id", "variant_id", "size_id"],
    where: { organization_id: organizationId, order_id: order.id },
    _count: { _all: true },
    orderBy: [{ style_id: "asc" }, { variant_id: "asc" }, { size_id: "asc" }],
  });
  const styleIds = [...new Set(groupedAssignments.map(({ style_id }) => style_id))];
  const variantIds = [...new Set(groupedAssignments.map(({ variant_id }) => variant_id))];
  const sizeIds = [...new Set(groupedAssignments.map(({ size_id }) => size_id))];
  const [styles, variants, sizes] = await Promise.all([
    styleIds.length > 0 ? prisma.masterArticle.findMany({
      where: { organization_id: organizationId, id: { in: styleIds } },
      select: { id: true, article: true, article_code: true },
    }) : [],
    variantIds.length > 0 ? prisma.masterArticleVariant.findMany({
      where: { organization_id: organizationId, id: { in: variantIds } },
      select: { id: true, variant: true, sku: true, color: { select: { colors: true } } },
    }) : [],
    sizeIds.length > 0 ? prisma.masterSize.findMany({
      where: { organization_id: organizationId, id: { in: sizeIds } },
      select: { id: true, size: true },
    }) : [],
  ]);
  const stylesById = new Map(styles.map((style) => [style.id, style]));
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));
  const sizesById = new Map(sizes.map((size) => [size.id, size]));
  return {
    order,
    rows: groupedAssignments.map((group) => {
      const style = stylesById.get(group.style_id);
      const variant = variantsById.get(group.variant_id);
      const size = sizesById.get(group.size_id);
      return {
        id: `${group.style_id}:${group.variant_id}:${group.size_id}`,
        style: style?.article ?? "Unavailable style",
        styleCode: style?.article_code ?? "",
        color: variant?.color.colors ?? variant?.variant ?? "Unavailable color",
        sku: variant?.sku ?? "",
        size: size?.size ?? "Unavailable size",
        quantity: group._count._all,
      };
    }),
  };
}
