import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

export class PreventiveMaintenanceError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "PreventiveMaintenanceError";
  }
}

const maximumChecklistItems = 20;
const maximumBatchSize = 100;
const dayMilliseconds = 24 * 60 * 60 * 1000;
const maintenancePermission = "MANAGE_MASTER_DATA";

function normalizedText(value: unknown, label: string, maximumLength: number, required = true) {
  const text = normalizeUppercase(String(value ?? "").trim());
  if ((required && !text) || text.length > maximumLength) {
    throw new PreventiveMaintenanceError(`${label} is required and must be no more than ${maximumLength} characters.`);
  }
  return text || null;
}

function parseDate(value: unknown) {
  const text = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new PreventiveMaintenanceError("Enter a valid due date.");
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new PreventiveMaintenanceError("Enter a valid due date.");
  }
  return date;
}

function parseChecklist(value: unknown) {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumChecklistItems) {
    throw new PreventiveMaintenanceError(`Add between 1 and ${maximumChecklistItems} checklist steps.`);
  }
  return value.map((item, index) => normalizedText(item, `Checklist step ${index + 1}`, 240)!);
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getPreventiveMaintenanceDashboard(organizationId: string, userId: string) {
  await requireOrganizationPermission(userId, organizationId, maintenancePermission);
  const [assetOptions, locations, assets, plans, workOrders] = await Promise.all([
    prisma.masterRawMaterial.findMany({
      where: { organization_id: organizationId, is_asset: true, is_active: true },
      select: { id: true, raw_material_name: true, manufacturer: true, model_number: true },
      orderBy: { raw_material_name: "asc" },
      take: maximumBatchSize,
    }),
    prisma.masterLocation.findMany({
      where: { organization_id: organizationId, is_active: true, entity: { is_active: true } },
      select: { id: true, location_name: true },
      orderBy: { location_name: "asc" },
      take: maximumBatchSize,
    }),
    prisma.preventiveMaintenanceAsset.findMany({
      where: { organization_id: organizationId },
      include: {
        rawMaterial: { select: { raw_material_name: true, manufacturer: true, model_number: true } },
        location: { select: { location_name: true } },
      },
      orderBy: [{ status: "asc" }, { asset_tag: "asc" }],
      take: maximumBatchSize,
    }),
    prisma.preventiveMaintenancePlan.findMany({
      where: { organization_id: organizationId },
      include: {
        asset: { select: { id: true, asset_tag: true, status: true, rawMaterial: { select: { raw_material_name: true } } } },
        checklist: { orderBy: { sort_order: "asc" } },
      },
      orderBy: [{ next_due_date: "asc" }, { plan_name: "asc" }],
      take: maximumBatchSize,
    }),
    prisma.preventiveMaintenanceWorkOrder.findMany({
      where: { organization_id: organizationId },
      include: {
        asset: { select: { id: true, asset_tag: true, rawMaterial: { select: { raw_material_name: true } }, location: { select: { location_name: true } } } },
        checklist: { orderBy: { sort_order: "asc" } },
      },
      orderBy: [{ created_at: "desc" }, { scheduled_for: "asc" }],
      take: maximumBatchSize,
    }),
  ]);
  return { assetOptions, locations, assets, plans, workOrders };
}

export async function registerMaintenanceAsset(
  organizationId: string,
  userId: string,
  input: { assetTag: unknown; masterRawMaterialId: unknown; locationId: unknown; serialNumber?: unknown; criticality: unknown },
) {
  await requireOrganizationPermission(userId, organizationId, maintenancePermission);
  const assetTag = normalizedText(input.assetTag, "Asset tag", 100)!;
  const masterRawMaterialId = String(input.masterRawMaterialId ?? "").trim();
  const locationId = String(input.locationId ?? "").trim();
  const serialNumber = normalizedText(input.serialNumber, "Serial number", 150, false);
  const criticality = String(input.criticality ?? "MEDIUM").toUpperCase();
  if (!masterRawMaterialId || !locationId) throw new PreventiveMaintenanceError("Select an asset type and active location.");
  if (!["LOW", "MEDIUM", "HIGH"].includes(criticality)) throw new PreventiveMaintenanceError("Choose a valid criticality.");

  return prisma.$transaction(async (transaction) => {
    const rawMaterial = await transaction.masterRawMaterial.findFirst({
      where: { id: masterRawMaterialId, organization_id: organizationId, is_asset: true, is_active: true },
      select: { id: true, raw_material_name: true },
    });
    if (!rawMaterial) throw new PreventiveMaintenanceError("Select an active asset type in this organization.", 404);
    const location = await transaction.masterLocation.findFirst({
      where: { id: locationId, organization_id: organizationId, is_active: true, entity: { is_active: true } },
      select: { id: true, entity_id: true },
    });
    if (!location) throw new PreventiveMaintenanceError("Select an active location in this organization.", 404);
    const asset = await transaction.preventiveMaintenanceAsset.create({
      data: {
        organization_id: organizationId,
        asset_tag: assetTag,
        master_raw_material_id: rawMaterial.id,
        entity_id: location.entity_id,
        location_id: location.id,
        serial_number: serialNumber,
        criticality,
      },
      include: {
        rawMaterial: { select: { raw_material_name: true, manufacturer: true, model_number: true } },
        location: { select: { location_name: true } },
      },
    });
    await createAuditEvent({
      organizationId,
      userId,
      module: "Asset Management",
      action: "MAINTENANCE_ASSET_REGISTERED",
      entityType: "PreventiveMaintenanceAsset",
      entityId: asset.id,
      details: { asset_tag: asset.asset_tag, raw_material_name: rawMaterial.raw_material_name },
    }, transaction);
    return asset;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createPreventiveMaintenancePlan(
  organizationId: string,
  userId: string,
  input: { assetId: unknown; name: unknown; intervalDays: unknown; nextDueDate: unknown; checklist: unknown },
) {
  await requireOrganizationPermission(userId, organizationId, maintenancePermission);
  const assetId = String(input.assetId ?? "").trim();
  const planName = normalizedText(input.name, "Plan name", 120)!;
  const intervalDays = Number(input.intervalDays);
  const nextDueDate = parseDate(input.nextDueDate);
  const checklist = parseChecklist(input.checklist);
  if (!assetId) throw new PreventiveMaintenanceError("Select an equipment asset.");
  if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
    throw new PreventiveMaintenanceError("Repeat interval must be between 1 and 365 days.");
  }

  return prisma.$transaction(async (transaction) => {
    const asset = await transaction.preventiveMaintenanceAsset.findFirst({
      where: { id: assetId, organization_id: organizationId, status: "ACTIVE" },
      select: { id: true, asset_tag: true },
    });
    if (!asset) throw new PreventiveMaintenanceError("Select active equipment in this organization.", 404);
    const plan = await transaction.preventiveMaintenancePlan.create({
      data: {
        organization_id: organizationId,
        asset_id: asset.id,
        plan_name: planName,
        interval_days: intervalDays,
        next_due_date: nextDueDate,
      },
    });
    await transaction.preventiveMaintenancePlanChecklist.createMany({
      data: checklist.map((instruction, sort_order) => ({
        organization_id: organizationId,
        plan_id: plan.id,
        instruction,
        sort_order,
      })),
    });
    await createAuditEvent({
      organizationId,
      userId,
      module: "Asset Management",
      action: "PREVENTIVE_MAINTENANCE_PLAN_CREATED",
      entityType: "PreventiveMaintenancePlan",
      entityId: plan.id,
      details: { asset_tag: asset.asset_tag, plan_name: plan.plan_name, interval_days: intervalDays },
    }, transaction);
    return plan;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function generateDueMaintenanceWorkOrders(organizationId: string, userId: string) {
  await requireOrganizationPermission(userId, organizationId, maintenancePermission);
  const today = todayUtc();
  return prisma.$transaction(async (transaction) => {
    const plans = await transaction.preventiveMaintenancePlan.findMany({
      where: {
        organization_id: organizationId,
        is_active: true,
        next_due_date: { lte: today },
        asset: { is: { status: "ACTIVE" } },
      },
      include: {
        asset: { select: { id: true, asset_tag: true } },
        checklist: { orderBy: { sort_order: "asc" } },
      },
      orderBy: { next_due_date: "asc" },
      take: maximumBatchSize,
    });
    const workOrders = [];
    for (const plan of plans) {
      const existing = await transaction.preventiveMaintenanceWorkOrder.findFirst({
        where: {
          organization_id: organizationId,
          plan_id: plan.id,
          scheduled_for: plan.next_due_date,
        },
        select: { id: true },
      });
      if (existing) continue;

      const workOrder = await transaction.preventiveMaintenanceWorkOrder.create({
        data: {
          organization_id: organizationId,
          asset_id: plan.asset.id,
          plan_id: plan.id,
          scheduled_for: plan.next_due_date,
        },
        select: { id: true, asset_id: true, plan_id: true, scheduled_for: true },
      });
      if (plan.checklist.length > 0) {
        await transaction.preventiveMaintenanceWorkOrderChecklist.createMany({
          data: plan.checklist.map((item) => ({
            organization_id: organizationId,
            work_order_id: workOrder.id,
            sort_order: item.sort_order,
            instruction: item.instruction,
          })),
        });
      }
      await createAuditEvent({
        organizationId,
        userId,
        module: "Asset Management",
        action: "PREVENTIVE_MAINTENANCE_WORK_ORDER_CREATED",
        entityType: "PreventiveMaintenanceWorkOrder",
        entityId: workOrder.id,
        details: { asset_tag: plan.asset.asset_tag, scheduled_for: workOrder.scheduled_for.toISOString().slice(0, 10) },
      }, transaction);
      workOrders.push(workOrder);
    }
    return { createdCount: workOrders.length, workOrders };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateMaintenanceChecklistItem(
  organizationId: string,
  userId: string,
  input: { workOrderId: unknown; checklistItemId: unknown; completed: unknown; note?: unknown },
) {
  await requireOrganizationPermission(userId, organizationId, maintenancePermission);
  const workOrderId = String(input.workOrderId ?? "").trim();
  const checklistItemId = String(input.checklistItemId ?? "").trim();
  if (typeof input.completed !== "boolean") throw new PreventiveMaintenanceError("Checklist completion must be true or false.");
  const completed = input.completed;
  const note = normalizedText(input.note, "Checklist note", 500, false);
  if (!workOrderId || !checklistItemId) throw new PreventiveMaintenanceError("Select a work order checklist item.");

  return prisma.$transaction(async (transaction) => {
    const workOrder = await transaction.preventiveMaintenanceWorkOrder.findFirst({
      where: { id: workOrderId, organization_id: organizationId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      select: { id: true, status: true },
    });
    if (!workOrder) throw new PreventiveMaintenanceError("An open maintenance work order was not found.", 404);
    const updated = await transaction.preventiveMaintenanceWorkOrderChecklist.updateMany({
      where: { id: checklistItemId, organization_id: organizationId, work_order_id: workOrder.id },
      data: {
        is_completed: completed,
        completion_note: note,
        completed_at: completed ? new Date() : null,
        completed_by: completed ? String(userId) : null,
      },
    });
    if (updated.count !== 1) throw new PreventiveMaintenanceError("Work order checklist item was not found.", 404);
    if (workOrder.status === "SCHEDULED") {
      await transaction.preventiveMaintenanceWorkOrder.updateMany({
        where: { id: workOrder.id, organization_id: organizationId, status: "SCHEDULED" },
        data: { status: "IN_PROGRESS" },
      });
    }
    await createAuditEvent({
      organizationId,
      userId,
      module: "Asset Management",
      action: completed ? "MAINTENANCE_CHECKLIST_COMPLETED" : "MAINTENANCE_CHECKLIST_REOPENED",
      entityType: "PreventiveMaintenanceWorkOrder",
      entityId: workOrder.id,
      details: { checklist_item_id: checklistItemId },
    }, transaction);
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function completeMaintenanceWorkOrder(
  organizationId: string,
  userId: string,
  performedBy: unknown,
  input: { workOrderId: unknown; downtimeMinutes: unknown; completionNotes?: unknown },
) {
  await requireOrganizationPermission(userId, organizationId, maintenancePermission);
  const workOrderId = String(input.workOrderId ?? "").trim();
  const downtimeMinutes = Number(input.downtimeMinutes);
  const completionNotes = normalizedText(input.completionNotes, "Completion notes", 1000, false);
  const performer = normalizedText(performedBy, "Completed by", 255)!;
  if (!workOrderId) throw new PreventiveMaintenanceError("A work order is required.");
  if (!Number.isInteger(downtimeMinutes) || downtimeMinutes < 0 || downtimeMinutes > 10080) {
    throw new PreventiveMaintenanceError("Downtime must be between 0 and 10,080 minutes.");
  }

  return prisma.$transaction(async (transaction) => {
    const workOrder = await transaction.preventiveMaintenanceWorkOrder.findFirst({
      where: { id: workOrderId, organization_id: organizationId },
      include: {
        checklist: { select: { id: true, is_completed: true } },
        plan: { select: { id: true, interval_days: true, next_due_date: true, is_active: true } },
        asset: { select: { asset_tag: true } },
      },
    });
    if (!workOrder) throw new PreventiveMaintenanceError("Maintenance work order was not found.", 404);
    if (workOrder.status === "COMPLETED" || workOrder.status === "CANCELLED") {
      throw new PreventiveMaintenanceError("This maintenance work order is already closed.", 409);
    }
    if (workOrder.checklist.length === 0 || workOrder.checklist.some((item) => !item.is_completed)) {
      throw new PreventiveMaintenanceError("Complete every checklist step before closing this work order.");
    }

    const now = new Date();
    const updated = await transaction.preventiveMaintenanceWorkOrder.updateMany({
      where: { id: workOrder.id, organization_id: organizationId, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      data: {
        status: "COMPLETED",
        completed_by: performer,
        completed_at: now,
        downtime_minutes: downtimeMinutes,
        completion_notes: completionNotes,
      },
    });
    if (updated.count !== 1) throw new PreventiveMaintenanceError("The work order changed; reload and try again.", 409);

    if (workOrder.plan?.is_active) {
      const today = todayUtc();
      const dueTime = workOrder.plan.next_due_date.getTime();
      const daysBehind = Math.floor((today.getTime() - dueTime) / dayMilliseconds);
      const intervalsToAdvance = Math.max(1, Math.floor(daysBehind / workOrder.plan.interval_days) + 1);
      const nextDueDate = new Date(dueTime + intervalsToAdvance * workOrder.plan.interval_days * dayMilliseconds);
      const planUpdated = await transaction.preventiveMaintenancePlan.updateMany({
        where: {
          id: workOrder.plan.id,
          organization_id: organizationId,
          next_due_date: workOrder.plan.next_due_date,
          is_active: true,
        },
        data: { next_due_date: nextDueDate },
      });
      if (planUpdated.count !== 1) throw new PreventiveMaintenanceError("The maintenance schedule changed; reload and try again.", 409);
    }

    await createAuditEvent({
      organizationId,
      userId,
      module: "Asset Management",
      action: "PREVENTIVE_MAINTENANCE_WORK_ORDER_COMPLETED",
      entityType: "PreventiveMaintenanceWorkOrder",
      entityId: workOrder.id,
      details: {
        asset_tag: workOrder.asset.asset_tag,
        downtime_minutes: downtimeMinutes,
        checklist_completed: workOrder.checklist.length,
      },
    }, transaction);
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
