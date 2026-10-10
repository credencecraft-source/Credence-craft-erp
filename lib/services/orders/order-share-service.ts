import { randomUUID } from "node:crypto";
import { OrderShareStatus } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { requireActiveOrganizationEntity } from "@/lib/services/organizations/organization-entity-service";
import { reserveNextOrderNumber } from "@/lib/services/orders/order-service";
import { lockOrganizationOrderQuantityLimit } from "@/lib/services/platform/order-quantity-limit-service";
import { validateMonthlyFormLimits } from "@/lib/services/platform/segment-form-restriction-service";

const PENDING_ORDER_SHARE_PAGE_SIZE = 25;

export async function createOrderShare(input: {
  orderId: string;
  sourceOrganizationId: string;
  sharedByUserId: string;
}) {
  const sourceOrder = await prisma.merchandisingOrder.findFirst({
    where: { id: input.orderId, organization_id: input.sourceOrganizationId },
    include: { organization: true },
  });
  if (!sourceOrder) throw new Error("Order not found.");
  const buyer = sourceOrder.buyer
    ? await prisma.masterBuyer.findFirst({ where: { organization_id: input.sourceOrganizationId, buyer_name: sourceOrder.buyer, is_active: true }, select: { buyer_email: true } })
    : null;
  const buyerEmail = buyer?.buyer_email?.trim().toLowerCase();
  if (!buyerEmail) throw new Error("Configure a buyer email in the Buyer master before sharing.");
  const targetUser = await prisma.workspaceUser.findUnique({ where: { email: buyerEmail }, select: { id: true } });
  if (!targetUser) throw new Error("No buyer workspace account matches the configured buyer email.");

  return prisma.$transaction(async (transaction) => {
    const share = await transaction.orderShare.create({
      data: {
        id: randomUUID(),
        source_order_id: sourceOrder.id,
        source_organization_id: input.sourceOrganizationId,
        target_workspace_user_id: targetUser.id,
        shared_by_user_id: input.sharedByUserId,
      },
    });

    await transaction.workspaceNotification.createMany({
      data: [{
        workspace_user_id: targetUser.id,
        type: "ORDER_SHARE",
        reference_id: share.id,
        title: "Order shared with you as a buyer",
        body: `${sourceOrder.orderNo} from ${sourceOrder.organization.organization_name} is waiting for your review.`,
      }],
    });
    return share;
  });
}

export async function listPendingOrderShares(workspaceUserId: string, cursor?: string) {
  const rows = await prisma.orderShare.findMany({
    where: {
      status: OrderShareStatus.PENDING,
      target_workspace_user_id: workspaceUserId,
    },
    include: {
      sourceOrder: { select: { orderNo: true, brand: true, orderQty: true, deliveryDate: true } },
      sourceOrganization: { select: { organization_name: true, organization_id: true } },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: PENDING_ORDER_SHARE_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > PENDING_ORDER_SHARE_PAGE_SIZE;
  const shares = rows.slice(0, PENDING_ORDER_SHARE_PAGE_SIZE);
  return {
    shares,
    nextCursor: hasMore ? shares[shares.length - 1]?.id ?? null : null,
  };
}

export async function countPendingOrderShares(workspaceUserId: string) {
  return prisma.orderShare.count({
    where: {
      status: OrderShareStatus.PENDING,
      target_workspace_user_id: workspaceUserId,
    },
  });
}

export async function acceptOrderShare(input: {
  shareId: string;
  workspaceUserId: string;
  destinationOrganizationId: string;
}) {
  const destinationMembership = await requireOrganizationAccess(input.workspaceUserId, input.destinationOrganizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);

  return prisma.$transaction(async (transaction) => {
    const share = await transaction.orderShare.findUnique({
      where: { id: input.shareId },
      include: { sourceOrder: { include: { finishedGoods: true, bomItems: true } } },
    });
    if (!share) throw new Error("Order share not found.");
    if (share.status === OrderShareStatus.ACCEPTED && share.accepted_order_id) {
      return { share, orderId: share.accepted_order_id };
    }
    if (share.status !== OrderShareStatus.PENDING) throw new Error("This order share is no longer pending.");

    if (share.target_workspace_user_id !== input.workspaceUserId) throw new Error("This order is not assigned to your buyer account.");

    await lockOrganizationOrderQuantityLimit(transaction, destinationMembership.organization_id);
    await validateMonthlyFormLimits(
      destinationMembership.organization_id,
      "merchandising_orders",
      Number(share.sourceOrder.orderQty ?? 0),
      undefined,
      transaction,
    );
    const orderNo = await reserveNextOrderNumber(destinationMembership.organization_id, transaction);
    const source = share.sourceOrder;
    const entity = await requireActiveOrganizationEntity(destinationMembership.organization_id, source.entityName, transaction);
    const order = await transaction.merchandisingOrder.create({
      data: {
        organization_id: destinationMembership.organization_id,
        entity_id: entity.id,
        orderNo,
        entityName: entity.entity_name,
        category: source.category,
        subCategory: source.subCategory,
        season: source.season,
        article: source.article,
        styleName: source.styleName,
        colors: source.colors,
        buyer: source.buyer,
        brand: source.brand,
        sizeGroup: source.sizeGroup,
        haveSizeRatio: source.haveSizeRatio,
        ratioOrderQty: source.ratioOrderQty,
        orderQty: source.orderQty,
        deliveryDate: source.deliveryDate,
        finalStatus: "Draft",
        processStatus: source.processStatus,
        sourceStatus: "PORTAL ORDERS",
        finishedGoods: { create: source.finishedGoods.map((row) => ({ buyerSize: row.buyerSize, size: row.size, beforeExcessQty: row.beforeExcessQty, excess: row.excess, excessQty: row.excessQty, totalQty: row.totalQty, buyerPoPrice: row.buyerPoPrice, exchangePrice: row.exchangePrice, priceInInr: row.priceInInr })) },
        bomItems: { create: source.bomItems.map((item) => ({ categoryType: item.categoryType, category: item.category, subCategory: item.subCategory, rawMaterialName: item.rawMaterialName, stockUom: item.stockUom, size: item.size, orderQty: item.orderQty, buyerConsumption: item.buyerConsumption, buyerPrice: item.buyerPrice, internalConsumption: null, internalPrice: null, valuePerGarmentRm: null, consumption: item.consumption, requiredQty: item.requiredQty, itemWiseExcessPercentage: item.itemWiseExcessPercentage, itemWiseExcessQty: item.itemWiseExcessQty, totalRequiredQty: item.totalRequiredQty })) },
      },
    });
    const updatedShare = await transaction.orderShare.update({ where: { id: share.id }, data: { status: OrderShareStatus.ACCEPTED, accepted_by_user_id: input.workspaceUserId, destination_organization_id: destinationMembership.organization_id, accepted_order_id: order.id, accepted_at: new Date() } });
    await transaction.workspaceNotification.updateMany({ where: { reference_id: share.id, type: "ORDER_SHARE" }, data: { read_at: new Date() } });
    return { share: updatedShare, orderId: order.id };
  });
}

export async function rejectOrderShare(shareId: string, workspaceUserId: string) {
  const share = await prisma.orderShare.findFirst({ where: { id: shareId, target_workspace_user_id: workspaceUserId, status: OrderShareStatus.PENDING } });
  if (!share) throw new Error("Order share not found or already handled.");
  return prisma.orderShare.update({ where: { id: shareId }, data: { status: OrderShareStatus.REJECTED } });
}
