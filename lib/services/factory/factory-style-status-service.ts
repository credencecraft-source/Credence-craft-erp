import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export type FactoryStyleActivity = {
  id: string;
  documentNo: string;
  status: string | null;
  occurredAt: string;
  createdBy: string | null;
  detail: string | null;
};

export type FactoryStyleProcessProgress = {
  id: string;
  processName: string;
  plannedQuantity: number;
  producedQuantity: number;
  completedQuantity: number;
  receivedQuantity: number;
  status: string;
  occurredAt: string | null;
};

export type FactoryStyleStatusOrder = {
  id: string;
  orderNo: string;
  brand: string | null;
  styleName: string | null;
  workOrders: FactoryStyleActivity[];
  processes: FactoryStyleProcessProgress[];
  transfers: FactoryStyleActivity[];
  finishedGoods: FactoryStyleActivity[];
  plannedFinishedGoodsQuantity: number;
  approvedFinishedGoodsQuantity: number;
};

export async function listFactoryStyleStatusOrders(
  workspaceUserId: string,
  publicOrganizationId: string,
) {
  const membership = await requireOrganizationPermission(
    workspaceUserId,
    publicOrganizationId,
    "VIEW_FACTORY_PRODUCTION",
  );
  const organizationId = membership.organization_id;

  const orders = await prisma.merchandisingOrder.findMany({
    where: { organization_id: organizationId },
    select: {
      id: true,
      orderNo: true,
      brand: true,
      styleName: true,
      workOrders: {
        where: { organization_id: organizationId },
        select: {
          id: true,
          work_order_no: true,
          status: true,
          total_qty: true,
          created_at: true,
          processController: {
            select: {
              processes: {
                orderBy: { sl_no: "asc" },
                select: {
                  process_id: true,
                  process_name: true,
                  order_qty: true,
                  created_qty: true,
                  completed_qty: true,
                  received_qty: true,
                  status: true,
                  productionUpdates: { select: { created_at: true } },
                },
              },
            },
          },
          shopFloorTransfers: {
            where: { organization_id: organizationId },
            select: {
              id: true,
              quantity: true,
              status: true,
              is_final: true,
              sent_at: true,
              received_at: true,
              fromProcess: { select: { process_name: true } },
              toProcess: { select: { process_name: true } },
            },
          },
          grns: {
            where: { organization_id: organizationId },
            select: {
              id: true,
              grn_no: true,
              grn_date: true,
              received_qty: true,
              status: true,
              approved_at: true,
              fromProcess: { select: { process_name: true } },
              toProcess: { select: { process_name: true } },
            },
          },
          inventoryGrns: {
            where: { organization_id: organizationId },
            select: {
              id: true,
              grn_no: true,
              grn_date: true,
              status: true,
              verified_at: true,
              lines: {
                select: { received_quantity: true, approved_quantity: true },
              },
            },
          },
          finishedGoodsAllocatedStockReceipts: {
            where: { organization_id: organizationId },
            select: {
              id: true,
              grn_no: true,
              posted_at: true,
              approved_quantity: true,
              size: true,
            },
          },
        },
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });

  const workOrderIds = orders.flatMap((order) => order.workOrders.map(({ id }) => id));
  const creationEvents = workOrderIds.length > 0
    ? await prisma.auditEvent.findMany({
      where: {
        organization_id: organizationId,
        entity_id: { in: [...orders.map(({ id }) => id), ...workOrderIds] },
        entity_type: { in: ["MerchandisingOrder", "FactoryWorkOrder"] },
      },
      select: {
        entity_type: true,
        entity_id: true,
        action: true,
        user: { select: { full_name: true } },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    })
    : [];
  const actors = new Map<string, string | null>();
  for (const event of creationEvents) {
    if (!event.entity_type || !event.entity_id) continue;
    if (event.action !== "CREATE" && !event.action.startsWith("CREATE_")) continue;
    const key = `${event.entity_type}:${event.entity_id}`;
    if (!actors.has(key)) actors.set(key, event.user?.full_name ?? null);
  }

  return orders.map((order): FactoryStyleStatusOrder => {
    const processProgress = new Map<string, FactoryStyleProcessProgress>();
    const workOrders: FactoryStyleActivity[] = [];
    const transfers: FactoryStyleActivity[] = [];
    const finishedGoods: FactoryStyleActivity[] = [];
    let plannedFinishedGoodsQuantity = 0;
    let approvedFinishedGoodsQuantity = 0;

    for (const workOrder of order.workOrders) {
      plannedFinishedGoodsQuantity += workOrder.total_qty;
      workOrders.push({
        id: workOrder.id,
        documentNo: workOrder.work_order_no,
        status: workOrder.status,
        occurredAt: workOrder.created_at.toISOString(),
        createdBy: actors.get(`FactoryWorkOrder:${workOrder.id}`) ?? null,
        detail: `${workOrder.total_qty.toLocaleString("en-IN")} units`,
      });

      for (const process of workOrder.processController?.processes ?? []) {
        const key = process.process_name.trim().toLocaleLowerCase();
        if (!key) continue;
        const latestUpdate = process.productionUpdates.reduce<Date | null>(
          (latest, update) => !latest || update.created_at > latest ? update.created_at : latest,
          null,
        );
        const current = processProgress.get(key) ?? {
          id: key,
          processName: process.process_name,
          plannedQuantity: 0,
          producedQuantity: 0,
          completedQuantity: 0,
          receivedQuantity: 0,
          status: process.status,
          occurredAt: null,
        };
        current.plannedQuantity += process.order_qty;
        current.producedQuantity += process.created_qty;
        current.completedQuantity += process.completed_qty;
        current.receivedQuantity += process.received_qty;
        current.status = process.status;
        if (latestUpdate && (!current.occurredAt || latestUpdate.toISOString() > current.occurredAt)) {
          current.occurredAt = latestUpdate.toISOString();
        }
        processProgress.set(key, current);
      }

      for (const transfer of workOrder.shopFloorTransfers) {
        transfers.push({
          id: `transfer:${transfer.id}`,
          documentNo: `${transfer.fromProcess.process_name} → ${transfer.toProcess?.process_name ?? "Finished goods"}`,
          status: transfer.status,
          occurredAt: (transfer.received_at ?? transfer.sent_at).toISOString(),
          createdBy: null,
          detail: `${transfer.quantity.toLocaleString("en-IN")} units${transfer.is_final ? " · final transfer" : ""}`,
        });
      }
      for (const grn of workOrder.grns) {
        transfers.push({
          id: `process-grn:${grn.id}`,
          documentNo: grn.grn_no,
          status: grn.status,
          occurredAt: (grn.approved_at ?? grn.grn_date).toISOString(),
          createdBy: grn.approved_at ? grn.fromProcess.process_name : null,
          detail: `${grn.fromProcess.process_name} → ${grn.toProcess.process_name} · ${grn.received_qty.toLocaleString("en-IN")} units`,
        });
      }
      for (const grn of workOrder.inventoryGrns) {
        const receivedQuantity = grn.lines.reduce((total, line) => total + line.received_quantity, 0);
        const approvedQuantity = grn.lines.reduce((total, line) => total + (line.approved_quantity ?? 0), 0);
        approvedFinishedGoodsQuantity += approvedQuantity;
        finishedGoods.push({
          id: `fg-grn:${grn.id}`,
          documentNo: grn.grn_no,
          status: grn.status,
          occurredAt: (grn.verified_at ?? grn.grn_date).toISOString(),
          createdBy: null,
          detail: `${approvedQuantity.toLocaleString("en-IN")} approved of ${receivedQuantity.toLocaleString("en-IN")} received`,
        });
      }
      for (const receipt of workOrder.finishedGoodsAllocatedStockReceipts) {
        finishedGoods.push({
          id: `fg-receipt:${receipt.id}`,
          documentNo: receipt.grn_no,
          status: "POSTED",
          occurredAt: receipt.posted_at.toISOString(),
          createdBy: null,
          detail: `${receipt.approved_quantity.toLocaleString("en-IN")} approved · size ${receipt.size}`,
        });
      }
    }

    return {
      id: order.id,
      orderNo: order.orderNo,
      brand: order.brand,
      styleName: order.styleName,
      workOrders,
      processes: [...processProgress.values()],
      transfers,
      finishedGoods,
      plannedFinishedGoodsQuantity,
      approvedFinishedGoodsQuantity,
    };
  });
}
