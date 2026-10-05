import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { getWorkOrderBomAllocatedQuantities } from "@/lib/services/factory/work-order-material-allocation-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";

type Database = Prisma.TransactionClient | typeof prisma;

function uniqueIds(ids: string[], label: string) {
  const normalized = ids.map((id) => id.trim());
  if (normalized.length === 0 || normalized.some((id) => !id)) throw new Error(`Select at least one ${label}.`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`A ${label} can only be selected once.`);
  if (normalized.length > 200) throw new Error(`Select no more than 200 ${label}s at a time.`);
  return normalized;
}

async function refreshRequestStatuses(database: Database, organizationId: string, requestIds: string[]) {
  const ids = [...new Set(requestIds)];
  for (const requestId of ids) {
    const lines = await database.rawMaterialOutwardRequestLine.findMany({
      where: { organization_id: organizationId, request_id: requestId },
      select: { status: true },
    });
    if (lines.length === 0) continue;
    const statuses = lines.map((line) => line.status);
    const status = statuses.every((item) => item === "SHIPPED")
      ? "SHIPPED"
      : statuses.every((item) => item === "PACKED" || item === "SHIPPED")
        ? "PACKED"
        : statuses.every((item) => item === "PICKED" || item === "PACKED" || item === "SHIPPED")
          ? "PICKED"
          : "ACCEPTED";
    await database.rawMaterialOutwardRequest.updateMany({
      where: { id: requestId, organization_id: organizationId, status: { not: "REQUESTED" } },
      data: { status },
    });
  }
}

export async function createWorkOrderMaterialRequest(input: {
  organizationId: string;
  workOrderId: string;
  requestedBy: string;
  actorId: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
  return prisma.$transaction(async (transaction) => {
    const workOrder = await transaction.factoryWorkOrder.findFirst({
      where: { id: input.workOrderId, organization_id: input.organizationId },
      select: {
        id: true,
        work_order_no: true,
        bomLines: {
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
          select: {
            id: true,
            source_bom_item_id: true,
            raw_material_name: true,
            category: true,
            size: true,
          },
        },
      },
    });
    if (!workOrder) throw new Error("Work order was not found in this organization.");
    if (workOrder.bomLines.length === 0) throw new Error("This work order has no raw-material BOM lines to request.");

    const allocatedByLineId = await getWorkOrderBomAllocatedQuantities(
      input.organizationId,
      workOrder.bomLines.map((line) => line.id),
      transaction,
    );
    const previousRequests = await transaction.rawMaterialOutwardRequestLine.findMany({
      where: {
        organization_id: input.organizationId,
        work_order_bom_line_id: { in: workOrder.bomLines.map((line) => line.id) },
      },
      select: { work_order_bom_line_id: true, requested_quantity: true },
    });
    const alreadyRequestedByLine = new Map<string, Prisma.Decimal>();
    for (const line of previousRequests) {
      alreadyRequestedByLine.set(
        line.work_order_bom_line_id,
        (alreadyRequestedByLine.get(line.work_order_bom_line_id) ?? new Prisma.Decimal(0)).plus(line.requested_quantity),
      );
    }

    const requestLines = workOrder.bomLines.flatMap((line) => {
      const allocated = allocatedByLineId.get(line.id) ?? new Prisma.Decimal(0);
      const alreadyRequested = alreadyRequestedByLine.get(line.id) ?? new Prisma.Decimal(0);
      const remaining = Prisma.Decimal.max(allocated.minus(alreadyRequested), 0);
      return remaining.gt(0) ? [{
        work_order_bom_line_id: line.id,
        raw_material: line.raw_material_name,
        category: line.category,
        size: line.size,
        allocated_quantity: allocated,
        requested_quantity: remaining,
      }] : [];
    });
    if (requestLines.length === 0) {
      throw new Error("There are no newly allocated raw materials to request for this work order.");
    }

    const requestNo = await reserveProcurementDocumentNumber(
      input.organizationId,
      "RM_OUTWARD_REQUEST",
      transaction,
    );
    const created = await transaction.rawMaterialOutwardRequest.create({
      data: {
        organization_id: input.organizationId,
        work_order_id: workOrder.id,
        request_no: requestNo,
        requested_by: input.requestedBy,
        lines: { create: requestLines },
      },
      select: { id: true, request_no: true, status: true },
    });
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "Inventory Management",
      action: "RAW_MATERIAL_OUTWARD_REQUESTED",
      entityType: "RawMaterialOutwardRequest",
      entityId: created.id,
      details: { requestNo, workOrderNo: workOrder.work_order_no, lineCount: requestLines.length },
    }, transaction);
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function acceptRawMaterialOutwardRequest(input: {
  organizationId: string;
  requestId: string;
  actorId: string;
  actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const request = await transaction.rawMaterialOutwardRequest.findFirst({
      where: { id: input.requestId, organization_id: input.organizationId, status: "REQUESTED" },
      select: { id: true, request_no: true },
    });
    if (!request) throw new Error("This request is no longer waiting for acceptance.");
    const updated = await transaction.rawMaterialOutwardRequest.updateMany({
      where: { id: request.id, organization_id: input.organizationId, status: "REQUESTED" },
      data: { status: "ACCEPTED", accepted_by: input.actorName, accepted_at: new Date() },
    });
    if (updated.count !== 1) throw new Error("This request changed before it could be accepted. Reload and try again.");
    const acceptedLines = await transaction.rawMaterialOutwardRequestLine.updateMany({
      where: { request_id: request.id, organization_id: input.organizationId, status: "REQUESTED" },
      data: { status: "ACCEPTED" },
    });
    if (acceptedLines.count === 0) throw new Error("This request has no items waiting for acceptance.");
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "Inventory Management",
      action: "RAW_MATERIAL_OUTWARD_ACCEPTED",
      entityType: "RawMaterialOutwardRequest",
      entityId: request.id,
      details: { requestNo: request.request_no },
    }, transaction);
    return { id: request.id, status: "ACCEPTED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function markRawMaterialOutwardItemPicked(input: {
  organizationId: string;
  requestLineId: string;
  actorId: string;
  actorName: string;
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  return prisma.$transaction(async (transaction) => {
    const line = await transaction.rawMaterialOutwardRequestLine.findFirst({
      where: {
        id: input.requestLineId,
        organization_id: input.organizationId,
        status: "ACCEPTED",
        request: { organization_id: input.organizationId, status: "ACCEPTED" },
      },
      select: { id: true, request_id: true, requested_quantity: true },
    });
    if (!line) throw new Error("This item is no longer waiting to be picked.");
    const updated = await transaction.rawMaterialOutwardRequestLine.updateMany({
      where: { id: line.id, organization_id: input.organizationId, status: "ACCEPTED" },
      data: {
        status: "PICKED",
        picked_quantity: line.requested_quantity,
        picked_by: input.actorName,
        picked_at: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error("This item changed before it could be marked picked. Reload and try again.");
    await refreshRequestStatuses(transaction, input.organizationId, [line.request_id]);
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "Inventory Management",
      action: "RAW_MATERIAL_OUTWARD_ITEM_PICKED",
      entityType: "RawMaterialOutwardRequestLine",
      entityId: line.id,
      details: { requestId: line.request_id, pickedQuantity: line.requested_quantity.toString() },
    }, transaction);
    return { id: line.id, status: "PICKED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createRawMaterialOutwardBox(input: {
  organizationId: string;
  actorId: string;
  actorName: string;
  requestLineIds: string[];
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  const lineIds = uniqueIds(input.requestLineIds, "picked item");
  return prisma.$transaction(async (transaction) => {
    const lines = await transaction.rawMaterialOutwardRequestLine.findMany({
      where: {
        id: { in: lineIds },
        organization_id: input.organizationId,
        status: { in: ["PICKED", "PACKED"] },
        request: { organization_id: input.organizationId },
      },
      select: { id: true, request_id: true, picked_quantity: true },
    });
    if (lines.length !== lineIds.length) throw new Error("One or more selected items are no longer available to pack.");
    const packedLines = await transaction.rawMaterialOutwardBoxLine.findMany({
      where: { organization_id: input.organizationId, request_line_id: { in: lineIds } },
      select: { request_line_id: true, quantity: true },
    });
    const packedByLineId = new Map<string, Prisma.Decimal>();
    for (const packedLine of packedLines) {
      packedByLineId.set(
        packedLine.request_line_id,
        (packedByLineId.get(packedLine.request_line_id) ?? new Prisma.Decimal(0)).plus(packedLine.quantity),
      );
    }

    const boxLines = lines.map((line) => ({
      line,
      quantity: Prisma.Decimal.max(line.picked_quantity.minus(packedByLineId.get(line.id) ?? 0), 0),
    })).filter(({ quantity }) => quantity.gt(0));
    if (boxLines.length === 0) throw new Error("The selected items have no picked quantity remaining to box.");
    const boxNo = await reserveProcurementDocumentNumber(input.organizationId, "RM_OUTWARD_BOX", transaction);
    const box = await transaction.rawMaterialOutwardBox.create({
      data: {
        organization_id: input.organizationId,
        box_no: boxNo,
        packed_by: input.actorName,
      },
      select: { id: true, box_no: true, packed_at: true },
    });
    await transaction.rawMaterialOutwardBoxLine.createMany({
      data: boxLines.map(({ line, quantity }) => ({
        organization_id: input.organizationId,
        box_id: box.id,
        request_line_id: line.id,
        quantity,
      })),
    });

    for (const { line } of boxLines) {
      const totalPacked = (packedByLineId.get(line.id) ?? new Prisma.Decimal(0))
        .plus(Prisma.Decimal.max(line.picked_quantity.minus(packedByLineId.get(line.id) ?? 0), 0));
      if (totalPacked.greaterThanOrEqualTo(line.picked_quantity)) {
        await transaction.rawMaterialOutwardRequestLine.updateMany({
          where: { id: line.id, organization_id: input.organizationId, status: { in: ["PICKED", "PACKED"] } },
          data: { status: "PACKED" },
        });
      }
    }
    await refreshRequestStatuses(transaction, input.organizationId, boxLines.map(({ line }) => line.request_id));
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "Inventory Management",
      action: "RAW_MATERIAL_OUTWARD_BOX_CREATED",
      entityType: "RawMaterialOutwardBox",
      entityId: box.id,
      details: { boxNo, lineCount: boxLines.length },
    }, transaction);
    return box;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createRawMaterialOutwardShipment(input: {
  organizationId: string;
  actorId: string;
  actorName: string;
  boxIds: string[];
}) {
  await requireOrganizationAccess(input.actorId, input.organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  const boxIds = uniqueIds(input.boxIds, "box");
  return prisma.$transaction(async (transaction) => {
    const boxes = await transaction.rawMaterialOutwardBox.findMany({
      where: { id: { in: boxIds }, organization_id: input.organizationId, shipment: { is: null } },
      select: {
        id: true,
        box_no: true,
        lines: { select: { request_line_id: true, quantity: true } },
      },
    });
    if (boxes.length !== boxIds.length) throw new Error("One or more selected boxes are already shipped or unavailable.");
    if (boxes.some((box) => box.lines.length === 0)) throw new Error("A shipment cannot include an empty box.");

    const packingListNo = await reserveProcurementDocumentNumber(
      input.organizationId,
      "RM_OUTWARD_PACKING_LIST",
      transaction,
    );
    const shipment = await transaction.rawMaterialOutwardShipment.create({
      data: {
        organization_id: input.organizationId,
        packing_list_no: packingListNo,
        shipped_by: input.actorName,
      },
      select: { id: true, packing_list_no: true, shipped_at: true },
    });
    await transaction.rawMaterialOutwardShipmentBox.createMany({
      data: boxes.map((box) => ({
        organization_id: input.organizationId,
        shipment_id: shipment.id,
        box_id: box.id,
      })),
    });

    const requestLineIds = [...new Set(boxes.flatMap((box) => box.lines.map((line) => line.request_line_id)))];
    const packedLines = await transaction.rawMaterialOutwardBoxLine.findMany({
      where: { organization_id: input.organizationId, request_line_id: { in: requestLineIds } },
      select: {
        request_line_id: true,
        quantity: true,
        box: { select: { shipment: { select: { shipment_id: true } } } },
      },
    });
    const shippedByLineId = new Map<string, Prisma.Decimal>();
    for (const packedLine of packedLines) {
      if (!packedLine.box.shipment) continue;
      shippedByLineId.set(
        packedLine.request_line_id,
        (shippedByLineId.get(packedLine.request_line_id) ?? new Prisma.Decimal(0)).plus(packedLine.quantity),
      );
    }
    const requestLines = await transaction.rawMaterialOutwardRequestLine.findMany({
      where: { id: { in: requestLineIds }, organization_id: input.organizationId },
      select: { id: true, request_id: true, requested_quantity: true },
    });
    for (const line of requestLines) {
      if ((shippedByLineId.get(line.id) ?? new Prisma.Decimal(0)).greaterThanOrEqualTo(line.requested_quantity)) {
        await transaction.rawMaterialOutwardRequestLine.updateMany({
          where: { id: line.id, organization_id: input.organizationId, status: "PACKED" },
          data: { status: "SHIPPED" },
        });
      }
    }
    await refreshRequestStatuses(transaction, input.organizationId, requestLines.map((line) => line.request_id));
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "Inventory Management",
      action: "RAW_MATERIAL_OUTWARD_SHIPPED",
      entityType: "RawMaterialOutwardShipment",
      entityId: shipment.id,
      details: { packingListNo, boxNos: boxes.map((box) => box.box_no) },
    }, transaction);
    return { ...shipment, boxCount: boxes.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listRawMaterialOutwardWorkflow(organizationId: string, actorId: string, workOrderId?: string) {
  await requireOrganizationAccess(actorId, organizationId);
  const [requests, boxes, shipments] = await Promise.all([
    prisma.rawMaterialOutwardRequest.findMany({
      where: {
        organization_id: organizationId,
        ...(workOrderId ? { work_order_id: workOrderId } : {}),
      },
      include: {
        workOrder: { select: { work_order_no: true, order_no: true } },
        lines: { orderBy: [{ created_at: "asc" }, { id: "asc" }] },
      },
      orderBy: [{ requested_at: "desc" }, { id: "desc" }],
    }),
    workOrderId ? Promise.resolve([]) : prisma.rawMaterialOutwardBox.findMany({
      where: { organization_id: organizationId },
      include: {
        lines: {
          include: {
            requestLine: {
              select: {
                id: true,
                raw_material: true,
                category: true,
                size: true,
                request: {
                  select: {
                    request_no: true,
                    workOrder: { select: { work_order_no: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ created_at: "asc" }, { id: "asc" }],
        },
        shipment: { include: { shipment: { select: { id: true, packing_list_no: true, shipped_at: true } } } },
      },
      orderBy: [{ packed_at: "desc" }, { id: "desc" }],
    }),
    workOrderId ? Promise.resolve([]) : prisma.rawMaterialOutwardShipment.findMany({
      where: { organization_id: organizationId },
      include: { boxes: { include: { box: { select: { id: true, box_no: true } } } } },
      orderBy: [{ shipped_at: "desc" }, { id: "desc" }],
    }),
  ]);

  return {
    requests: requests.map((request) => ({
      id: request.id,
      workOrderId: request.work_order_id,
      requestNo: request.request_no,
      status: request.status,
      requestedAt: request.requested_at,
      requestedBy: request.requested_by,
      workOrderNo: request.workOrder.work_order_no,
      orderNo: request.workOrder.order_no,
      lines: request.lines.map((line) => ({
        id: line.id,
        workOrderBomLineId: line.work_order_bom_line_id,
        rawMaterial: line.raw_material,
        category: line.category,
        size: line.size,
        allocatedQuantity: line.allocated_quantity.toString(),
        requestedQuantity: line.requested_quantity.toString(),
        pickedQuantity: line.picked_quantity.toString(),
        status: line.status,
        pickedBy: line.picked_by,
        pickedAt: line.picked_at,
      })),
    })),
    boxes: boxes.map((box) => ({
      id: box.id,
      boxNo: box.box_no,
      packedAt: box.packed_at,
      packedBy: box.packed_by,
      shipment: box.shipment?.shipment ?? null,
      lines: box.lines.map((line) => ({
        id: line.id,
        requestLineId: line.request_line_id,
        rawMaterial: line.requestLine.raw_material,
        category: line.requestLine.category,
        size: line.requestLine.size,
        requestNo: line.requestLine.request.request_no,
        workOrderNo: line.requestLine.request.workOrder.work_order_no,
        quantity: line.quantity.toString(),
      })),
    })),
    shipments: shipments.map((shipment) => ({
      id: shipment.id,
      packingListNo: shipment.packing_list_no,
      shippedAt: shipment.shipped_at,
      shippedBy: shipment.shipped_by,
      boxes: shipment.boxes.map(({ box }) => ({ id: box.id, boxNo: box.box_no })),
    })),
  };
}

export async function getRawMaterialPickHistoryForGroupedLine(
  organizationId: string,
  actorId: string,
  groupedPurchaseOrderLineId: string,
) {
  await requireOrganizationAccess(actorId, organizationId);
  const groupedLine = await prisma.groupedPurchaseOrderLine.findFirst({
    where: {
      id: groupedPurchaseOrderLineId,
      groupedPurchaseOrder: { organization_id: organizationId },
      sourceOrder: { organization_id: organizationId },
    },
    select: {
      id: true,
      source_bom_item_id: true,
      order_no: true,
      style_name: true,
      item_name: true,
      grouped_qty: true,
      sourceOrder: { select: { orderNo: true, styleName: true, article: true } },
    },
  });
  if (!groupedLine) return null;

  const [pickedLines, allocations] = await Promise.all([
    prisma.rawMaterialOutwardRequestLine.findMany({
      where: {
        organization_id: organizationId,
        picked_quantity: { gt: 0 },
        workOrderBomLine: {
          source_bom_item_id: groupedLine.source_bom_item_id,
          workOrder: { organization_id: organizationId },
        },
        request: { organization_id: organizationId },
      },
      select: {
        id: true,
        raw_material: true,
        category: true,
        size: true,
        requested_quantity: true,
        picked_quantity: true,
        picked_by: true,
        picked_at: true,
        request: {
          select: {
            requested_by: true,
            requested_at: true,
            workOrder: {
              select: {
                work_order_no: true,
                order_no: true,
                order: { select: { orderNo: true, styleName: true, article: true } },
              },
            },
          },
        },
      },
      orderBy: [{ picked_at: "desc" }, { id: "desc" }],
    }),
    prisma.rmGrnOrderAllocation.findMany({
      where: {
        organization_id: organizationId,
        grouped_purchase_order_line_id: groupedLine.id,
        groupedPurchaseOrderLine: { groupedPurchaseOrder: { organization_id: organizationId } },
      },
      select: { allocated_quantity: true },
    }),
  ]);

  const requestedTotal = pickedLines.reduce(
    (total, line) => total.plus(line.requested_quantity),
    new Prisma.Decimal(0),
  );
  const pickedTotal = pickedLines.reduce(
    (total, line) => total.plus(line.picked_quantity),
    new Prisma.Decimal(0),
  );
  const allocatedTotal = allocations.reduce(
    (total, allocation) => total.plus(allocation.allocated_quantity),
    new Prisma.Decimal(0),
  );
  const availableStock = Prisma.Decimal.max(allocatedTotal.minus(pickedTotal), 0);
  return {
    rawMaterialName: groupedLine.item_name,
    orderNo: groupedLine.order_no ?? groupedLine.sourceOrder.orderNo,
    styleNo: groupedLine.style_name ?? groupedLine.sourceOrder.styleName ?? groupedLine.sourceOrder.article,
    groupedQuantity: groupedLine.grouped_qty.toString(),
    allocatedQuantity: allocatedTotal.toString(),
    availableStock: availableStock.toString(),
    requestedTotal: requestedTotal.toString(),
    pickedTotal: pickedTotal.toString(),
    records: pickedLines.map((line) => ({
      id: line.id,
      orderNo: line.request.workOrder.order_no || line.request.workOrder.order.orderNo,
      styleNo: line.request.workOrder.order.styleName || line.request.workOrder.order.article || "",
      workOrderNo: line.request.workOrder.work_order_no,
      requestedBy: line.request.requested_by,
      requestedAt: line.request.requested_at,
      requestedQuantity: line.requested_quantity.toString(),
      pickedBy: line.picked_by,
      pickedAt: line.picked_at,
      pickedQuantity: line.picked_quantity.toString(),
      rawMaterial: line.raw_material,
      category: line.category,
      size: line.size,
    })),
  };
}

export async function getRawMaterialPickSummariesForGroupedLines(
  organizationId: string,
  actorId: string,
  groupedPurchaseOrderLineIds: string[],
) {
  await requireOrganizationAccess(actorId, organizationId);
  const ids = [...new Set(groupedPurchaseOrderLineIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};

  const groupedLines = await prisma.groupedPurchaseOrderLine.findMany({
    where: {
      id: { in: ids },
      groupedPurchaseOrder: { organization_id: organizationId },
      sourceOrder: { organization_id: organizationId },
    },
    select: { id: true, source_bom_item_id: true },
  });
  if (groupedLines.length === 0) return {};

  const sourceBomItemIds = [...new Set(groupedLines.map((line) => line.source_bom_item_id))];
  const [allocations, pickedLines] = await Promise.all([
    prisma.rmGrnOrderAllocation.findMany({
      where: {
        organization_id: organizationId,
        grouped_purchase_order_line_id: { in: groupedLines.map((line) => line.id) },
        groupedPurchaseOrderLine: { groupedPurchaseOrder: { organization_id: organizationId } },
      },
      select: { grouped_purchase_order_line_id: true, allocated_quantity: true },
    }),
    prisma.rawMaterialOutwardRequestLine.findMany({
      where: {
        organization_id: organizationId,
        picked_quantity: { gt: 0 },
        workOrderBomLine: {
          source_bom_item_id: { in: sourceBomItemIds },
          workOrder: { organization_id: organizationId },
        },
        request: { organization_id: organizationId },
      },
      select: {
        picked_quantity: true,
        workOrderBomLine: { select: { source_bom_item_id: true } },
      },
    }),
  ]);

  const allocatedByLine = new Map<string, Prisma.Decimal>();
  for (const allocation of allocations) {
    allocatedByLine.set(
      allocation.grouped_purchase_order_line_id,
      (allocatedByLine.get(allocation.grouped_purchase_order_line_id) ?? new Prisma.Decimal(0))
        .plus(allocation.allocated_quantity),
    );
  }
  const pickedBySourceBomItem = new Map<string, Prisma.Decimal>();
  for (const line of pickedLines) {
    const sourceBomItemId = line.workOrderBomLine.source_bom_item_id;
    pickedBySourceBomItem.set(
      sourceBomItemId,
      (pickedBySourceBomItem.get(sourceBomItemId) ?? new Prisma.Decimal(0)).plus(line.picked_quantity),
    );
  }

  return Object.fromEntries(groupedLines.map((line) => {
    const allocated = allocatedByLine.get(line.id) ?? new Prisma.Decimal(0);
    const picked = pickedBySourceBomItem.get(line.source_bom_item_id) ?? new Prisma.Decimal(0);
    return [line.id, {
      pickedQuantity: picked.toString(),
      balanceStock: Prisma.Decimal.max(allocated.minus(picked), 0).toString(),
    }];
  }));
}
