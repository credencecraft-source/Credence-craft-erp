import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { calculateTax } from "./gst-calculation-service";
import { reserveProcurementDocumentNumber } from "./procurement-document-number-service";
import { getPurchaseOrder } from "./purchase-order-service";

const generalPurchaseOrderRequestSelect = {
  id: true,
  status: true,
  entity_id: true,
  raw_material_id: true,
  quantity: true,
  vendor_id: true,
  vendor_price: true,
  gst: true,
  hsn_code: true,
  created_by: true,
  created_at: true,
  approved_by: true,
  approved_at: true,
  purchase_order_id: true,
  general_purchase_order_group_id: true,
} as const;

const generalPurchaseOrderRequestListSelect = {
  ...generalPurchaseOrderRequestSelect,
  rawMaterial: {
    select: {
      id: true,
      organization_id: true,
      is_active: true,
      is_asset: true,
      raw_material_name: true,
      raw_material_category: {
        select: {
          organization_id: true,
          raw_material_category: true,
          raw_material_type: { select: { organization_id: true, is_asset: true } },
        },
      },
      raw_material_sub_category: {
        select: { organization_id: true, raw_material_sub_category: true },
      },
      stock_uom: {
        select: { organization_id: true, uom: true },
      },
    },
  },
  vendor: {
    select: { id: true, organization_id: true, vendor: true, is_active: true },
  },
  purchaseOrder: {
    select: {
      id: true,
      organization_id: true,
      display_no: true,
      purchase_order_no: true,
      status: true,
    },
  },
  entity: { select: { id: true, organization_id: true, entity_name: true, is_active: true } },
} satisfies Prisma.GeneralPurchaseOrderRequestSelect;

const generalPurchaseOrderGroupSelect = {
  id: true,
  organization_id: true,
  entity_id: true,
  vendor_id: true,
  raw_material_id: true,
  display_no: true,
  status: true,
  raw_material: true,
  category: true,
  sub_category: true,
  stock_uom: true,
  quantity: true,
  vendor_price: true,
  gst: true,
  hsn_code: true,
  is_asset: true,
  created_at: true,
  entity: { select: { id: true, organization_id: true, entity_name: true } },
  vendor: { select: { id: true, organization_id: true, vendor: true } },
  requests: { select: { id: true } },
  purchaseOrderLine: {
    select: {
      purchaseOrder: {
        select: { id: true, organization_id: true, display_no: true, purchase_order_no: true, status: true },
      },
    },
  },
} satisfies Prisma.GeneralPurchaseOrderGroupSelect;

const zero = () => new Prisma.Decimal(0);

export type GeneralPurchaseOrderRequestInput = {
  entityId: string;
  rawMaterialId: string;
  quantity: number | string;
  isAsset?: boolean;
};

export type GeneralPurchaseOrderPriceInput = {
  vendorId: string;
  vendorPrice: number | string;
  gstMasterId?: string | null;
  hsnCode?: string | null;
  quantity: number | string;
};

function decimalInput(value: number | string, label: string, scale: number) {
  const normalized = String(value).trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(normalized)) {
    throw new Error(`${label} must be a valid number with at most ${scale} decimal places.`);
  }
  return new Prisma.Decimal(normalized);
}

function parseQuantity(value: number | string) {
  const quantity = decimalInput(value, "Quantity", 2);
  if (!quantity.gt(0) || quantity.gt("9999999999.99")) {
    throw new Error("Quantity must be greater than zero and within the supported range.");
  }
  return quantity;
}

function parsePrice(value: number | string) {
  const price = decimalInput(value, "Vendor price", 4);
  if (price.gt("99999999.9999")) {
    throw new Error("Vendor price exceeds the supported range.");
  }
  return price;
}

function parseDate(value: string | null | undefined, label: string, fallback?: Date) {
  if (!value) return fallback ?? null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} is invalid.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed;
}

function serializeGeneralPurchaseOrderGroup(
  group: Prisma.GeneralPurchaseOrderGroupGetPayload<{ select: typeof generalPurchaseOrderGroupSelect }>,
) {
  if (
    group.entity.organization_id !== group.organization_id
    || group.vendor.organization_id !== group.organization_id
  ) {
    throw new Error("A General PO group references unavailable organization data.");
  }
  const purchaseOrder = group.purchaseOrderLine?.purchaseOrder;
  if (purchaseOrder && purchaseOrder.organization_id !== group.organization_id) {
    throw new Error("A General PO group references unavailable organization data.");
  }
  return {
    id: group.id,
    number: group.display_no ? `GMG-${group.display_no}` : group.id,
    status: group.status,
    entityId: group.entity_id,
    entityName: group.entity.entity_name,
    vendor: { id: group.vendor.id, name: group.vendor.vendor },
    rawMaterialId: group.raw_material_id,
    rawMaterial: group.raw_material,
    isAsset: group.is_asset,
    category: group.category,
    subCategory: group.sub_category,
    stockUom: group.stock_uom,
    quantity: Number(group.quantity),
    vendorPrice: Number(group.vendor_price),
    gst: Number(group.gst),
    hsnCode: group.hsn_code,
    requestCount: group.requests.length,
    purchaseOrder: purchaseOrder
      ? {
          id: purchaseOrder.id,
          number: purchaseOrder.display_no
            ? `PO-${purchaseOrder.display_no}`
            : purchaseOrder.purchase_order_no,
          status: purchaseOrder.status,
        }
      : null,
    createdAt: group.created_at,
  };
}

export async function listGeneralPurchaseOrderRequests(
  organizationId: string,
  statuses?: string[],
  input: { cursor?: string; limit?: number; unGroupedOnly?: boolean; requestId?: string; isAsset?: boolean } = {},
) {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const where = {
    organization_id: organizationId,
    ...(input.requestId ? { id: input.requestId } : {}),
    ...(statuses?.length ? { status: { in: statuses } } : {}),
    ...(input.unGroupedOnly ? { general_purchase_order_group_id: null } : {}),
    ...(input.isAsset !== undefined
      ? {
          rawMaterial: {
            is: {
              organization_id: organizationId,
              raw_material_category: {
                is: {
                  organization_id: organizationId,
                  raw_material_type: {
                    is: {
                      organization_id: organizationId,
                      is_asset: input.isAsset,
                    },
                  },
                },
              },
            },
          },
        }
      : {}),
  };
  if (input.cursor) {
    const cursor = await prisma.generalPurchaseOrderRequest.findFirst({
      where: { ...where, id: input.cursor },
      select: { id: true },
    });
    if (!cursor) throw new Error("General PO pagination cursor is invalid for this organization.");
  }
  const requests = await prisma.generalPurchaseOrderRequest.findMany({
    where,
    select: generalPurchaseOrderRequestListSelect,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = requests.length > limit;
  const pageRequests = hasNextPage ? requests.slice(0, limit) : requests;
  return {
    requests: pageRequests.map((request) => {
    const material = request.rawMaterial;
    const vendor = request.vendor;
    const purchaseOrder = request.purchaseOrder;
    const entity = request.entity;
    if (!material || material.id !== request.raw_material_id
      || material.organization_id !== organizationId) {
      throw new Error("A General PO request references unavailable organization data.");
    }
    if (!material.raw_material_category
      || material.raw_material_category.organization_id !== organizationId
      || !material.raw_material_sub_category
      || material.raw_material_sub_category.organization_id !== organizationId
      || !material.stock_uom
      || material.stock_uom.organization_id !== organizationId) {
      throw new Error("A General PO raw material references unavailable organization master data.");
    }
    if (request.vendor_id && (!vendor || vendor.id !== request.vendor_id || vendor.organization_id !== organizationId)) {
      throw new Error("A General PO request references unavailable organization data.");
    }
    if (request.purchase_order_id
      && (!purchaseOrder || purchaseOrder.id !== request.purchase_order_id || purchaseOrder.organization_id !== organizationId)) {
      throw new Error("A General PO request references unavailable organization data.");
    }
    if (request.entity_id && (!entity || entity.id !== request.entity_id || entity.organization_id !== organizationId)) {
      throw new Error("A General PO request references unavailable organization data.");
    }
    return {
    id: request.id,
    status: request.status,
    entityId: request.entity_id,
    entityName: entity?.entity_name ?? null,
    generalPurchaseOrderGroupId: request.general_purchase_order_group_id,
    rawMaterial: material.raw_material_name,
    rawMaterialId: request.raw_material_id,
    isAsset: material.raw_material_category.raw_material_type?.is_asset ?? material.is_asset,
    category: material.raw_material_category.raw_material_category,
    subCategory: material.raw_material_sub_category.raw_material_sub_category,
    stockUom: material.stock_uom.uom,
    quantity: Number(request.quantity),
    vendor: vendor ? { id: vendor.id, name: vendor.vendor } : null,
    vendorPrice: request.vendor_price === null ? null : Number(request.vendor_price),
    gst: request.gst === null ? null : Number(request.gst),
    hsnCode: request.hsn_code,
    createdBy: request.created_by,
    createdAt: request.created_at,
    approvedBy: request.approved_by,
    approvedAt: request.approved_at,
      purchaseOrder: purchaseOrder
      ? {
            id: purchaseOrder.id,
            number: purchaseOrder.display_no
              ? `PO-${purchaseOrder.display_no}`
              : purchaseOrder.purchase_order_no,
            status: purchaseOrder.status,
        }
      : null,
        };
      }),
    nextCursor: hasNextPage ? pageRequests[pageRequests.length - 1]?.id ?? null : null,
  };
}

export async function createGeneralPurchaseOrderRequests(
  organizationId: string,
  inputs: GeneralPurchaseOrderRequestInput[],
  createdBy: string,
  createdByUserId: string,
) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new Error("Add at least one raw material and quantity.");
  }
  if (inputs.length > 100) throw new Error("Submit no more than 100 raw materials at a time.");

  const normalized = inputs.map((input) => {
    const entityId = String(input.entityId ?? "").trim();
    const rawMaterialId = String(input.rawMaterialId ?? "").trim();
    if (!entityId) throw new Error("Select an Entity for every material request.");
    if (!rawMaterialId) throw new Error("Select a raw material for every request.");
    if (input.isAsset !== undefined && typeof input.isAsset !== "boolean") {
      throw new Error("Asset classification must be true or false.");
    }
    return { entityId, rawMaterialId, quantity: parseQuantity(input.quantity), isAsset: input.isAsset };
  });

  return prisma.$transaction(async (transaction) => {
    const ids = [...new Set(normalized.map((input) => input.rawMaterialId))];
    const entityIds = [...new Set(normalized.map((input) => input.entityId))];
    if (entityIds.length !== 1) throw new Error("Submit material requests for one Entity at a time.");
    const [entity, materials] = await Promise.all([
      transaction.masterEntity.findFirst({
        where: { id: entityIds[0], organization_id: organizationId, is_active: true },
        select: { id: true },
      }),
      transaction.masterRawMaterial.findMany({
      where: { organization_id: organizationId, id: { in: ids }, is_active: true },
      select: {
        id: true,
        is_asset: true,
        raw_material_category: {
          select: {
            organization_id: true,
            raw_material_type: { select: { organization_id: true, is_asset: true } },
          },
        },
      },
      }),
    ]);
    if (!entity) throw new Error("The selected Entity is unavailable in this organization.");
    if (materials.length !== ids.length) {
      throw new Error("One or more selected raw materials are unavailable in this organization.");
    }
    const materialById = new Map(materials.map((material) => [material.id, {
      ...material,
      effectiveAssetClassification: material.raw_material_category.raw_material_type?.is_asset ?? material.is_asset,
    }]));
    const requestedAssetByMaterial = new Map<string, boolean>();
    for (const input of normalized) {
      if (input.isAsset === undefined) continue;
      const previous = requestedAssetByMaterial.get(input.rawMaterialId);
      if (previous !== undefined && previous !== input.isAsset) {
        throw new Error("Use one asset classification for every line of the same raw material.");
      }
      requestedAssetByMaterial.set(input.rawMaterialId, input.isAsset);
    }
    for (const [rawMaterialId, isAsset] of requestedAssetByMaterial) {
      const material = materialById.get(rawMaterialId);
      if (!material) throw new Error("One or more selected raw materials are unavailable in this organization.");
      if (typeof material.raw_material_category.raw_material_type?.is_asset !== "boolean") {
        throw new Error("Set the asset classification on this raw material's type before creating General PO requests.");
      }
      if (material.effectiveAssetClassification !== isAsset) {
        throw new Error("Asset classification is controlled by the Raw Material Type and cannot be changed in General PO.");
      }
    }
    for (const material of materialById.values()) {
      const rawMaterialType = material.raw_material_category.raw_material_type;
      if (!rawMaterialType
        || rawMaterialType.organization_id !== organizationId
        || material.raw_material_category.organization_id !== organizationId
        || typeof rawMaterialType.is_asset !== "boolean") {
        throw new Error("Set the asset classification on each raw material type before creating General PO requests.");
      }
      if (material.is_asset !== rawMaterialType.is_asset) {
        throw new Error("Raw Material asset classification is out of sync with its type. Save the Raw Material from Admin Master Data to synchronize it.");
      }
    }

    const requests = [];
    for (const input of normalized) {
      const request = await transaction.generalPurchaseOrderRequest.create({
        data: {
          organization_id: organizationId,
          entity_id: input.entityId,
          raw_material_id: input.rawMaterialId,
          quantity: input.quantity,
          created_by: createdBy,
          created_by_user_id: createdByUserId,
        },
      });
      await createAuditEvent({
        organizationId,
        userId: createdByUserId,
        module: "Procurement",
        action: "CREATE_GENERAL_PO_REQUEST",
        entityType: "GeneralPurchaseOrderRequest",
        entityId: request.id,
        details: {
          entity_id: input.entityId,
          raw_material_id: input.rawMaterialId,
          quantity: input.quantity.toString(),
          is_asset: materialById.get(input.rawMaterialId)?.effectiveAssetClassification ?? false,
        },
      }, transaction);
      requests.push(request);
    }
    return requests;
  });
}

export async function saveGeneralPurchaseOrderPrice(
  organizationId: string,
  requestId: string,
  input: GeneralPurchaseOrderPriceInput,
  actorUserId: string,
) {
  const vendorPrice = parsePrice(input.vendorPrice);
  const quantity = parseQuantity(input.quantity);
  const vendorId = String(input.vendorId ?? "").trim();
  if (!vendorId) throw new Error("Select a vendor.");
  const hsnCode = String(input.hsnCode ?? "").trim();
  if (!input.gstMasterId) throw new Error("Select a GST rate from this organization’s master data.");
  if (!hsnCode) throw new Error("Select an HSN code from this organization’s master data.");
  if (hsnCode.length > 100) throw new Error("HSN code cannot exceed 100 characters.");

  return prisma.$transaction(async (transaction) => {
    const request = await transaction.generalPurchaseOrderRequest.findFirst({
      where: {
        id: requestId,
        organization_id: organizationId,
        status: "PENDING_PRICE_APPROVAL",
        purchase_order_id: null,
      },
      select: { id: true },
    });
    if (!request) throw new Error("General PO request is no longer pending price approval.");

    const vendor = await transaction.masterVendor.findFirst({
      where: { id: vendorId, organization_id: organizationId, is_active: true },
      select: { id: true },
    });
    if (!vendor) throw new Error("The selected vendor is unavailable in this organization.");

    let gst: Prisma.Decimal | null = null;
    if (input.gstMasterId) {
      const gstMaster = await transaction.masterGst.findFirst({
        where: { id: input.gstMasterId, organization_id: organizationId, is_active: true },
        select: { gst: true },
      });
      if (!gstMaster || gstMaster.gst === null) throw new Error("The selected GST rate is unavailable.");
      if (gstMaster.gst.lt(0) || gstMaster.gst.gt(100)) throw new Error("The selected GST rate must be between 0 and 100 percent.");
      gst = gstMaster.gst;
    }

    if (hsnCode) {
      const hsn = await transaction.masterHsn.findFirst({
        where: { organization_id: organizationId, hsn_code: hsnCode, is_active: true },
        select: { id: true },
      });
      if (!hsn) throw new Error("Select an active HSN code from this organization’s master data.");
    }

    const updated = await transaction.generalPurchaseOrderRequest.updateMany({
      where: {
        id: request.id,
        organization_id: organizationId,
        status: "PENDING_PRICE_APPROVAL",
        purchase_order_id: null,
      },
      data: {
        vendor_id: vendor.id,
        vendor_price: vendorPrice,
        gst,
        hsn_code: hsnCode || null,
        quantity,
      },
    });
    if (updated.count !== 1) throw new Error("General PO request changed before its price could be saved.");
    await createAuditEvent({
      organizationId,
      userId: actorUserId,
      module: "Procurement",
      action: "SAVE_GENERAL_PO_PRICE",
      entityType: "GeneralPurchaseOrderRequest",
      entityId: request.id,
      details: { vendor_id: vendor.id, vendor_price: vendorPrice.toString(), gst: gst?.toString() ?? null, hsn_code: hsnCode || null },
    }, transaction);
    return { id: request.id, updated: true };
  });
}

export async function approveGeneralPurchaseOrderPrice(
  organizationId: string,
  requestId: string,
  reviewer: string,
  reviewerUserId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const request = await transaction.generalPurchaseOrderRequest.findFirst({
      where: {
        id: requestId,
        organization_id: organizationId,
        status: "PENDING_PRICE_APPROVAL",
        purchase_order_id: null,
        vendor_id: { not: null },
        vendor_price: { not: null },
        gst: { not: null },
        hsn_code: { not: null },
      },
      select: { id: true, vendor_id: true, vendor_price: true },
    });
    if (!request) throw new Error("Save a vendor and price before approving this General PO request.");

    const updated = await transaction.generalPurchaseOrderRequest.updateMany({
      where: {
        id: request.id,
        organization_id: organizationId,
        status: "PENDING_PRICE_APPROVAL",
        purchase_order_id: null,
      },
      data: {
        status: "PRICE_APPROVED",
        approved_by: reviewer,
        approved_by_user_id: reviewerUserId,
        approved_at: new Date(),
      },
    });
    if (updated.count !== 1) throw new Error("General PO request changed before it could be approved.");
    await createAuditEvent({
      organizationId,
      userId: reviewerUserId,
      module: "Procurement",
      action: "APPROVE_GENERAL_PO_PRICE",
      entityType: "GeneralPurchaseOrderRequest",
      entityId: request.id,
      details: { vendor_id: request.vendor_id, vendor_price: request.vendor_price?.toString() },
    }, transaction);
    return { id: request.id, status: "PRICE_APPROVED" };
  });
}

export async function listGeneralPurchaseOrderGroups(
  organizationId: string,
  statuses?: string[],
  input: { cursor?: string; limit?: number; isAsset?: boolean } = {},
) {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const where = {
    organization_id: organizationId,
    ...(statuses?.length ? { status: { in: statuses } } : {}),
    ...(input.isAsset !== undefined ? { is_asset: input.isAsset } : {}),
  };
  if (input.cursor) {
    const cursor = await prisma.generalPurchaseOrderGroup.findFirst({
      where: { ...where, id: input.cursor },
      select: { id: true },
    });
    if (!cursor) throw new Error("General PO group pagination cursor is invalid for this organization.");
  }
  const groups = await prisma.generalPurchaseOrderGroup.findMany({
    where,
    select: generalPurchaseOrderGroupSelect,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = groups.length > limit;
  const pageGroups = hasNextPage ? groups.slice(0, limit) : groups;
  return {
    groups: pageGroups.map(serializeGeneralPurchaseOrderGroup),
    nextCursor: hasNextPage ? pageGroups[pageGroups.length - 1]?.id ?? null : null,
  };
}

export async function createGeneralPurchaseOrderGroups(
  organizationId: string,
  requestIds: string[],
  createdBy: string,
  actorUserId: string,
  entityId?: string | null,
) {
  const uniqueIds = [...new Set(requestIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error("Select at least one price-approved General PO request.");
  if (uniqueIds.length !== requestIds.length) throw new Error("A General PO request cannot be selected more than once.");

  return prisma.$transaction(async (transaction) => {
    const requests = await transaction.generalPurchaseOrderRequest.findMany({
      where: {
        id: { in: uniqueIds },
        organization_id: organizationId,
        status: "PRICE_APPROVED",
        purchase_order_id: null,
        general_purchase_order_group_id: null,
      },
      select: generalPurchaseOrderRequestListSelect,
    });
    if (requests.length !== uniqueIds.length) {
      throw new Error("One or more selected requests are unavailable, already grouped, or not price-approved.");
    }
    if (new Set(requests.map((request) => request.rawMaterial.is_asset)).size > 1) {
      throw new Error("Asset and non-asset requests must be grouped separately.");
    }

    const unassignedRequests = requests.filter((request) => !request.entity_id);
    let groupableRequests = requests;
    if (unassignedRequests.length > 0) {
      const selectedEntityId = String(entityId ?? "").trim();
      if (!selectedEntityId) {
        throw new Error("Select an Entity to continue legacy General PO requests.");
      }
      const entity = await transaction.masterEntity.findFirst({
        where: { id: selectedEntityId, organization_id: organizationId, is_active: true },
        select: { id: true, organization_id: true, entity_name: true, is_active: true },
      });
      if (!entity) throw new Error("The selected Entity is unavailable in this organization.");
      const assigned = await transaction.generalPurchaseOrderRequest.updateMany({
        where: {
          id: { in: unassignedRequests.map((request) => request.id) },
          organization_id: organizationId,
          status: "PRICE_APPROVED",
          purchase_order_id: null,
          general_purchase_order_group_id: null,
          entity_id: null,
        },
        data: { entity_id: entity.id },
      });
      if (assigned.count !== unassignedRequests.length) {
        throw new Error("Legacy General PO requests changed before an Entity could be assigned.");
      }
      groupableRequests = requests.map((request) => request.entity_id
        ? request
        : { ...request, entity_id: entity.id, entity });
    }

    const groupsByKey = new Map<string, typeof groupableRequests>();
    for (const request of groupableRequests) {
      const { rawMaterial, vendor, entity } = request;
      if (!request.entity_id || !entity || entity.organization_id !== organizationId || !vendor
        || vendor.organization_id !== organizationId || !rawMaterial || rawMaterial.organization_id !== organizationId
        || !request.vendor_id || request.vendor_price === null || request.gst === null || !request.hsn_code) {
        throw new Error("Every request must have an active Entity, material, vendor, approved price, GST, and HSN.");
      }
      if (!rawMaterial.is_active || !entity.is_active || !vendor.is_active) {
        throw new Error("Every grouped request must reference active organization master records.");
      }
      const key = [
        request.entity_id,
        request.vendor_id,
        request.raw_material_id,
        request.vendor_price.toString(),
        request.gst.toString(),
        request.hsn_code.trim().toUpperCase(),
        rawMaterial.stock_uom.uom.trim().toLowerCase(),
        String(rawMaterial.is_asset),
      ].join("|");
      const current = groupsByKey.get(key) ?? [];
      current.push(request);
      groupsByKey.set(key, current);
    }

    const createdGroups = [];
    for (const groupRequests of groupsByKey.values()) {
      const first = groupRequests[0];
      const material = first.rawMaterial;
      if (!material || !first.entity_id || !first.vendor_id || first.vendor_price === null
        || first.gst === null || !first.hsn_code) {
        throw new Error("A General PO group is missing required source data.");
      }
      const displayNumber = await reserveProcurementDocumentNumber(
        organizationId,
        "GENERAL_MASTER_GROUP",
        transaction,
      );
      const displayNo = Number(displayNumber.replace("GMG-", ""));
      const quantity = groupRequests.reduce((total, request) => total.plus(request.quantity), zero());
      const created = await transaction.generalPurchaseOrderGroup.create({
        data: {
          organization_id: organizationId,
          entity_id: first.entity_id,
          vendor_id: first.vendor_id,
          raw_material_id: first.raw_material_id,
          display_no: displayNo,
          status: "MASTER_GROUPED",
          raw_material: material.raw_material_name,
          category: material.raw_material_category.raw_material_category,
          sub_category: material.raw_material_sub_category.raw_material_sub_category,
          stock_uom: material.stock_uom.uom,
          quantity,
          vendor_price: first.vendor_price,
          gst: first.gst,
          hsn_code: first.hsn_code.trim(),
          is_asset: material.is_asset,
          created_by: createdBy,
        },
        select: { id: true },
      });
      const linked = await transaction.generalPurchaseOrderRequest.updateMany({
        where: {
          id: { in: groupRequests.map((request) => request.id) },
          organization_id: organizationId,
          status: "PRICE_APPROVED",
          purchase_order_id: null,
          general_purchase_order_group_id: null,
        },
        data: { general_purchase_order_group_id: created.id },
      });
      if (linked.count !== groupRequests.length) {
        throw new Error("General PO requests changed before they could be grouped.");
      }
      await createAuditEvent({
        organizationId,
        userId: actorUserId,
        module: "Procurement",
        action: "CREATE_GENERAL_PO_MASTER_GROUP",
        entityType: "GeneralPurchaseOrderGroup",
        entityId: created.id,
        details: {
          entity_id: first.entity_id,
          request_ids: groupRequests.map((request) => request.id),
          quantity: quantity.toString(),
        },
      }, transaction);
      createdGroups.push(created);
    }
    return createdGroups;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createGeneralPurchaseOrder(
  organizationId: string,
  groupIds: string[],
  createdBy: string,
  createdByUserId: string,
  poDate?: string | null,
  deliveryDate?: string | null,
) {
  return createGeneralPurchaseOrderFromGroups(
    organizationId,
    groupIds,
    createdBy,
    createdByUserId,
    poDate,
    deliveryDate,
  );
}

export async function createGeneralPurchaseOrderFromGroups(
  organizationId: string,
  groupIds: string[],
  createdBy: string,
  createdByUserId: string,
  poDate?: string | null,
  deliveryDate?: string | null,
) {
  const uniqueIds = [...new Set(groupIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error("Select at least one General PO Master Group.");
  if (uniqueIds.length !== groupIds.length) throw new Error("A General PO Master Group cannot be selected more than once.");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const parsedPoDate = parseDate(poDate, "PO date", today);
  const parsedDeliveryDate = parseDate(deliveryDate, "Delivery date");
  if (parsedDeliveryDate && parsedDeliveryDate < parsedPoDate!) {
    throw new Error("Delivery date cannot be before the PO date.");
  }

  const purchaseOrder = await prisma.$transaction(async (transaction) => {
    const groups = await transaction.generalPurchaseOrderGroup.findMany({
      where: {
        id: { in: uniqueIds },
        organization_id: organizationId,
        status: "MASTER_GROUPED",
        purchaseOrderLine: null,
      },
      include: {
        entity: { select: { id: true, organization_id: true, is_active: true } },
        vendor: { select: { id: true, organization_id: true, is_active: true, gst_number: true, registered_state: true, registered_state_id: true } },
        rawMaterial: { select: { id: true, organization_id: true, is_active: true } },
        requests: { select: { id: true } },
      },
    });
    if (groups.length !== uniqueIds.length) {
      throw new Error("One or more selected Master Groups are unavailable or already used.");
    }
    const first = groups[0];
    if (groups.some((group) => group.entity_id !== first.entity_id || group.vendor_id !== first.vendor_id)) {
      throw new Error("Select General PO Master Groups for the same Entity and vendor.");
    }
    if (groups.some((group) => group.is_asset !== first.is_asset)) {
      throw new Error("Asset and non-asset Master Groups must be used in separate Purchase Orders.");
    }
    if (groups.some((group) => group.entity.organization_id !== organizationId || !group.entity.is_active
      || group.vendor.organization_id !== organizationId || !group.vendor.is_active
      || group.rawMaterial.organization_id !== organizationId || !group.rawMaterial.is_active)) {
      throw new Error("A selected General PO Master Group references inactive or unavailable organization data.");
    }

    const [organization, registeredState, defaultTaxProfile, gstRates] = await Promise.all([
      transaction.organization.findUnique({
        where: { id: organizationId },
        select: { gst_number: true, state: true, country: true },
      }),
      first.vendor.registered_state_id
        ? transaction.masterState.findFirst({
            where: { id: first.vendor.registered_state_id, organization_id: organizationId },
            select: { state: true },
          })
        : Promise.resolve(null),
      transaction.organizationTaxProfile.findFirst({
        where: { organization_id: organizationId, is_active: true, is_default: true },
        orderBy: { updated_at: "desc" },
      }),
      transaction.masterGst.findMany({
        where: { organization_id: organizationId, is_active: true },
        select: { gst: true, cgst_rate: true, sgst_rate: true, igst_rate: true },
      }),
    ]);
    if (!organization) throw new Error("Organization not found.");
    if (first.vendor.registered_state_id && !registeredState) {
      throw new Error("The vendor’s registered state is unavailable in this organization.");
    }

    const taxRegime = defaultTaxProfile?.tax_regime ?? "GST";
    const vendorState = registeredState?.state ?? first.vendor.registered_state;
    const lines = groups.map((group) => {
      const taxableAmount = group.quantity.mul(group.vendor_price);
      if (taxableAmount.gt("99999999.9999")) {
        throw new Error("A General PO line total exceeds the supported range.");
      }
      const configuredRate = gstRates.find((gstRate) => gstRate.gst?.equals(group.gst));
      const tax = calculateTax({
        taxableAmount: 0,
        totalRate: group.gst.toNumber(),
        taxRegime,
        country: organization.country ?? "IN",
        cgstRate: configuredRate?.cgst_rate?.toNumber() ?? defaultTaxProfile?.cgst_rate?.toNumber(),
        sgstRate: configuredRate?.sgst_rate?.toNumber() ?? defaultTaxProfile?.sgst_rate?.toNumber(),
        igstRate: configuredRate?.igst_rate?.toNumber() ?? defaultTaxProfile?.igst_rate?.toNumber(),
        vatRate: defaultTaxProfile?.vat_rate?.toNumber(),
        salesTaxRate: defaultTaxProfile?.sales_tax_rate?.toNumber(),
        organizationState: organization.state,
        organizationGstin: organization.gst_number,
        vendorState,
        vendorGstin: first.vendor.gst_number,
      });
      const amountForRate = (taxRate: number) => taxableAmount.mul(new Prisma.Decimal(taxRate)).div(100);
      return {
        source_master_line_id: group.id,
        general_purchase_order_group_id: group.id,
        raw_material: group.raw_material,
        category: group.category,
        sub_category: group.sub_category,
        quantity: group.quantity,
        price: group.vendor_price,
        gst: group.gst,
        tax_type: tax.taxType,
        cgst_rate: new Prisma.Decimal(tax.cgstRate),
        sgst_rate: new Prisma.Decimal(tax.sgstRate),
        igst_rate: new Prisma.Decimal(tax.igstRate),
        cgst_amount: amountForRate(tax.cgstRate),
        sgst_amount: amountForRate(tax.sgstRate),
        igst_amount: amountForRate(tax.igstRate),
        hsn_code: group.hsn_code,
        stock_uom: group.stock_uom,
        total: taxableAmount,
      };
    });
    const displayNumber = await reserveProcurementDocumentNumber(organizationId, "PURCHASE_ORDER", transaction);
    const created = await transaction.purchaseOrder.create({
      data: {
        organization_id: organizationId,
        entity_id: first.entity_id,
        vendor_id: first.vendor_id,
        procurement_type: "GENERAL",
        is_asset_purchase: first.is_asset,
        purchase_order_no: `PO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        display_no: Number(displayNumber.replace("PO-", "")),
        created_by: createdBy,
        po_date: parsedPoDate!,
        delivery_date: parsedDeliveryDate,
        lines: { create: lines },
      },
      select: { id: true, purchase_order_no: true },
    });

    const groupUpdate = await transaction.generalPurchaseOrderGroup.updateMany({
      where: { id: { in: uniqueIds }, organization_id: organizationId, status: "MASTER_GROUPED" },
      data: { status: "PO_CREATED" },
    });
    if (groupUpdate.count !== uniqueIds.length) {
      throw new Error("General PO Master Groups changed before the Purchase Order could be created.");
    }
    const requestIds = groups.flatMap((group) => group.requests.map((request) => request.id));
    const linkedRequests = await transaction.generalPurchaseOrderRequest.updateMany({
      where: {
        id: { in: requestIds },
        organization_id: organizationId,
        status: "PRICE_APPROVED",
        purchase_order_id: null,
        general_purchase_order_group_id: { in: uniqueIds },
      },
      data: { status: "PO_CREATED", purchase_order_id: created.id },
    });
    if (linkedRequests.count !== requestIds.length) {
      throw new Error("General PO requests changed before the Purchase Order could be created.");
    }
    await createAuditEvent({
      organizationId,
      userId: createdByUserId,
      module: "Procurement",
      action: "CREATE_GENERAL_PURCHASE_ORDER",
      entityType: "PurchaseOrder",
      entityId: created.id,
      details: { purchase_order_no: created.purchase_order_no, general_group_ids: uniqueIds },
    }, transaction);
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return getPurchaseOrder(organizationId, purchaseOrder.id);
}
