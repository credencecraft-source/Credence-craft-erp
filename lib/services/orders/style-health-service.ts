import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export type StyleHealthMilestoneRecord = {
  id: string;
  documentNo: string;
  status: string | null;
  occurredAt: string;
  createdBy: string | null;
  detail: string | null;
};

export type StyleHealthMaterialCategory = {
  subCategory: string;
  poCreatedAt: string | null;
  orderedStatus: "NOT_CREATED" | "PARTIAL" | "FULL";
  receivedStatus: "NOT_RECEIVED" | "PARTIAL" | "FULL";
  materialReceivedAt: string | null;
};

export type StyleHealthOrder = {
  id: string;
  orderNo: string;
  brand: string | null;
  styleName: string | null;
  buyer: string | null;
  orderCreated: StyleHealthMilestoneRecord[];
  materials: StyleHealthMaterialCategory[];
  workOrders: StyleHealthMilestoneRecord[];
};

function creationActor(
  events: Map<string, string | null>,
  entityType: string,
  entityId: string,
) {
  return events.get(`${entityType}:${entityId}`)?.trim() || null;
}

export async function listStyleHealthOrders(workspaceUserId: string, publicOrganizationId: string) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "VIEW_ORDERS",
  );
  const organizationId = membership.organization_id;

  const [orders, workOrders] = await Promise.all([
    prisma.merchandisingOrder.findMany({
      where: { organization_id: organizationId },
      select: {
        id: true,
        orderNo: true,
        brand: true,
        styleName: true,
        buyer: true,
        created_at: true,
        bomItems: {
          select: {
            id: true,
            subCategory: true,
            rawMaterialName: true,
            totalRequiredQty: true,
            requiredQty: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }),
    prisma.factoryWorkOrder.findMany({
      where: { organization_id: organizationId },
      select: {
        id: true,
        order_id: true,
        work_order_no: true,
        status: true,
        created_at: true,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }),
  ]);

  const groupedPurchaseOrderLinesPromise = orders.length > 0
    ? prisma.groupedPurchaseOrderLine.findMany({
      where: {
        source_order_id: { in: orders.map(({ id }) => id) },
        groupedPurchaseOrder: { is: { organization_id: organizationId } },
      },
      select: {
        source_bom_item_id: true,
        source_order_id: true,
        grouped_qty: true,
        groupedPurchaseOrder: { select: { created_at: true } },
        rmGrnOrderAllocations: {
          where: { organization_id: organizationId },
          select: {
            allocated_quantity: true,
            verificationAllocation: {
              select: {
                verification: { select: { organization_id: true, created_at: true } },
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    })
    : Promise.resolve([]);
  const scopedGroupedPurchaseOrderLines = await groupedPurchaseOrderLinesPromise;

  const auditEntityIds = [
    ...orders.map(({ id }) => id),
    ...workOrders.map(({ id }) => id),
  ];
  const creationEvents = auditEntityIds.length > 0
    ? await prisma.auditEvent.findMany({
        where: {
          organization_id: organizationId,
          entity_id: { in: auditEntityIds },
          entity_type: { in: ["MerchandisingOrder", "FactoryWorkOrder"] },
        },
        select: {
          entity_type: true,
          entity_id: true,
          action: true,
          created_at: true,
          user: { select: { full_name: true } },
        },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
      })
    : [];

  const creationActors = new Map<string, string | null>();
  for (const event of creationEvents) {
    if (!event.entity_type || !event.entity_id) continue;
    if (event.action !== "CREATE" && !event.action.startsWith("CREATE_")) continue;
    const key = `${event.entity_type}:${event.entity_id}`;
    if (!creationActors.has(key)) {
      creationActors.set(key, event.user?.full_name ?? null);
    }
  }

  type MaterialProgress = {
    subCategory: string;
    requiredQuantity: Prisma.Decimal;
    orderedQuantity: Prisma.Decimal;
    receivedQuantity: Prisma.Decimal;
    poCreatedAt: string | null;
    materialReceivedAt: string | null;
  };
  const milestonesByOrder = new Map(orders.map((order) => [
    order.id,
    {
      materials: new Map<string, MaterialProgress>(),
    },
  ]));

  const bomItemById = new Map<string, { orderId: string; subCategory: string }>();
  for (const order of orders) {
    const materials = milestonesByOrder.get(order.id)!.materials;
    for (const bomItem of order.bomItems) {
      if (!bomItem.rawMaterialName?.trim()) continue;
      const subCategory = bomItem.subCategory?.trim() || "Uncategorized";
      const material = materials.get(subCategory) ?? {
        subCategory,
        requiredQuantity: new Prisma.Decimal(0),
        orderedQuantity: new Prisma.Decimal(0),
        receivedQuantity: new Prisma.Decimal(0),
        poCreatedAt: null,
        materialReceivedAt: null,
      };
      material.requiredQuantity = material.requiredQuantity.plus(
        bomItem.totalRequiredQty ?? bomItem.requiredQty ?? 0,
      );
      materials.set(subCategory, material);
      bomItemById.set(bomItem.id, { orderId: order.id, subCategory });
    }
  }

  for (const line of scopedGroupedPurchaseOrderLines) {
    const bomItem = bomItemById.get(line.source_bom_item_id);
    if (!bomItem || bomItem.orderId !== line.source_order_id) continue;
    const material = milestonesByOrder.get(bomItem.orderId)?.materials.get(bomItem.subCategory);
    if (!material) continue;

    material.orderedQuantity = material.orderedQuantity.plus(line.grouped_qty);
    const poCreatedAt = line.groupedPurchaseOrder.created_at.toISOString();
    if (!material.poCreatedAt || poCreatedAt > material.poCreatedAt) {
      material.poCreatedAt = poCreatedAt;
    }

    for (const allocation of line.rmGrnOrderAllocations) {
      const allocatedQuantity = new Prisma.Decimal(allocation.allocated_quantity);
      const verification = allocation.verificationAllocation.verification;
      if (allocatedQuantity.lte(0) || verification.organization_id !== organizationId) continue;
      material.receivedQuantity = material.receivedQuantity.plus(allocatedQuantity);
      const verificationDate = verification.created_at.toISOString();
      if (!material.materialReceivedAt || verificationDate > material.materialReceivedAt) {
        material.materialReceivedAt = verificationDate;
      }
    }
  }

  const workOrdersByOrder = new Map<string, StyleHealthMilestoneRecord[]>();
  for (const workOrder of workOrders) {
    const items = workOrdersByOrder.get(workOrder.order_id) ?? [];
    items.push({
      id: workOrder.id,
      documentNo: workOrder.work_order_no,
      status: workOrder.status,
      occurredAt: workOrder.created_at.toISOString(),
      createdBy: creationActor(creationActors, "FactoryWorkOrder", workOrder.id),
      detail: null,
    });
    workOrdersByOrder.set(workOrder.order_id, items);
  }

  return orders.map((order): StyleHealthOrder => {
    const milestones = milestonesByOrder.get(order.id)!;
    return {
      id: order.id,
      orderNo: order.orderNo,
      brand: order.brand,
      styleName: order.styleName,
      buyer: order.buyer,
      orderCreated: [{
        id: order.id,
        documentNo: order.orderNo,
        status: null,
        occurredAt: order.created_at.toISOString(),
        createdBy: creationActor(creationActors, "MerchandisingOrder", order.id),
        detail: null,
      }],
      materials: [...milestones.materials.values()]
        .map((material): StyleHealthMaterialCategory => ({
          subCategory: material.subCategory,
          poCreatedAt: material.poCreatedAt,
          orderedStatus: !material.poCreatedAt
            ? "NOT_CREATED"
            : material.orderedQuantity.greaterThanOrEqualTo(material.requiredQuantity)
              ? "FULL"
              : "PARTIAL",
          receivedStatus: material.receivedQuantity.isZero()
            ? "NOT_RECEIVED"
            : material.receivedQuantity.greaterThanOrEqualTo(material.requiredQuantity)
              ? "FULL"
              : "PARTIAL",
          materialReceivedAt: material.materialReceivedAt,
        }))
        .sort((left, right) => left.subCategory.localeCompare(right.subCategory)),
      workOrders: workOrdersByOrder.get(order.id) ?? [],
    };
  });
}
