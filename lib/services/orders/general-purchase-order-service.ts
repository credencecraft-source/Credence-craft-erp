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
} as const;

export type GeneralPurchaseOrderRequestInput = {
  rawMaterialId: string;
  quantity: number | string;
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

export async function listGeneralPurchaseOrderRequests(
  organizationId: string,
  statuses?: string[],
  input: { cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
  const where = {
    organization_id: organizationId,
    ...(statuses?.length ? { status: { in: statuses } } : {}),
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
    select: generalPurchaseOrderRequestSelect,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = requests.length > limit;
  const pageRequests = hasNextPage ? requests.slice(0, limit) : requests;
  const materialIds = [...new Set(pageRequests.map((request) => request.raw_material_id))];
  const vendorIds = [...new Set(pageRequests.flatMap((request) => request.vendor_id ? [request.vendor_id] : []))];
  const purchaseOrderIds = [...new Set(pageRequests.flatMap((request) => request.purchase_order_id ? [request.purchase_order_id] : []))];
  const [materials, vendors, purchaseOrders] = await Promise.all([
    prisma.masterRawMaterial.findMany({
    where: { organization_id: organizationId, id: { in: materialIds } },
    select: {
      id: true,
      raw_material_name: true,
      raw_material_category_id: true,
      raw_material_sub_category_id: true,
      stock_uom_id: true,
    },
    }),
    prisma.masterVendor.findMany({
    where: { organization_id: organizationId, id: { in: vendorIds } },
    select: { id: true, vendor: true },
    }),
    prisma.purchaseOrder.findMany({
    where: { organization_id: organizationId, id: { in: purchaseOrderIds } },
    select: { id: true, display_no: true, purchase_order_no: true, status: true },
    }),
  ]);
  if (materials.length !== materialIds.length || vendors.length !== vendorIds.length || purchaseOrders.length !== purchaseOrderIds.length) {
    throw new Error("A General PO request references unavailable organization data.");
  }
  const categoryIds = [...new Set(materials.map((material) => material.raw_material_category_id))];
  const subCategoryIds = [...new Set(materials.map((material) => material.raw_material_sub_category_id))];
  const uomIds = [...new Set(materials.map((material) => material.stock_uom_id))];
  const [categories, subCategories, uoms] = await Promise.all([
    prisma.masterRawMaterialCategory.findMany({
    where: { organization_id: organizationId, id: { in: categoryIds } },
    select: { id: true, raw_material_category: true },
    }),
    prisma.masterRawMaterialSubCategory.findMany({
    where: { organization_id: organizationId, id: { in: subCategoryIds } },
    select: { id: true, raw_material_sub_category: true },
    }),
    prisma.masterUom.findMany({
    where: { organization_id: organizationId, id: { in: uomIds } },
    select: { id: true, uom: true },
    }),
  ]);
  if (categories.length !== categoryIds.length || subCategories.length !== subCategoryIds.length || uoms.length !== uomIds.length) {
    throw new Error("A General PO raw material references unavailable organization master data.");
  }
  const materialsById = new Map(materials.map((material) => [material.id, material]));
  const categoriesById = new Map(categories.map((category) => [category.id, category.raw_material_category]));
  const subCategoriesById = new Map(subCategories.map((category) => [category.id, category.raw_material_sub_category]));
  const uomsById = new Map(uoms.map((uom) => [uom.id, uom.uom]));
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor.vendor]));
  const purchaseOrdersById = new Map(purchaseOrders.map((order) => [order.id, order]));
  return {
    requests: pageRequests.map((request) => {
    const material = materialsById.get(request.raw_material_id);
    const purchaseOrder = request.purchase_order_id
      ? purchaseOrdersById.get(request.purchase_order_id)
      : null;
    if (!material || !categoriesById.has(material.raw_material_category_id)
      || !subCategoriesById.has(material.raw_material_sub_category_id)
      || !uomsById.has(material.stock_uom_id)) {
      throw new Error("A General PO raw material references unavailable organization master data.");
    }
    return {
    id: request.id,
    status: request.status,
    rawMaterial: material.raw_material_name,
    rawMaterialId: request.raw_material_id,
    category: categoriesById.get(material.raw_material_category_id) ?? null,
    subCategory: subCategoriesById.get(material.raw_material_sub_category_id) ?? null,
    stockUom: uomsById.get(material.stock_uom_id) ?? "",
    quantity: Number(request.quantity),
    vendor: request.vendor_id ? { id: request.vendor_id, name: vendorsById.get(request.vendor_id) ?? "" } : null,
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
    const rawMaterialId = String(input.rawMaterialId ?? "").trim();
    if (!rawMaterialId) throw new Error("Select a raw material for every request.");
    return { rawMaterialId, quantity: parseQuantity(input.quantity) };
  });

  return prisma.$transaction(async (transaction) => {
    const ids = [...new Set(normalized.map((input) => input.rawMaterialId))];
    const materials = await transaction.masterRawMaterial.findMany({
      where: { organization_id: organizationId, id: { in: ids }, is_active: true },
      select: { id: true },
    });
    if (materials.length !== ids.length) {
      throw new Error("One or more selected raw materials are unavailable in this organization.");
    }

    const requests = [];
    for (const input of normalized) {
      const request = await transaction.generalPurchaseOrderRequest.create({
        data: {
          organization_id: organizationId,
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
        details: { raw_material_id: input.rawMaterialId, quantity: input.quantity.toString() },
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

export async function createGeneralPurchaseOrder(
  organizationId: string,
  requestIds: string[],
  createdBy: string,
  createdByUserId: string,
  poDate?: string | null,
  deliveryDate?: string | null,
) {
  const uniqueIds = [...new Set(requestIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new Error("Select at least one price-approved General PO request.");
  if (uniqueIds.length !== requestIds.length) throw new Error("A General PO request cannot be selected more than once.");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const parsedPoDate = parseDate(poDate, "PO date", today);
  const parsedDeliveryDate = parseDate(deliveryDate, "Delivery date");
  if (parsedDeliveryDate && parsedDeliveryDate < parsedPoDate!) {
    throw new Error("Delivery date cannot be before the PO date.");
  }

  const purchaseOrder = await prisma.$transaction(async (transaction) => {
    const requests = await transaction.generalPurchaseOrderRequest.findMany({
      where: {
        id: { in: uniqueIds },
        organization_id: organizationId,
        status: "PRICE_APPROVED",
        purchase_order_id: null,
      },
      select: {
        id: true,
        raw_material_id: true,
        quantity: true,
        vendor_id: true,
        vendor_price: true,
        gst: true,
        hsn_code: true,
      },
    });
    if (requests.length !== uniqueIds.length) {
      throw new Error("One or more selected requests are unavailable, already used, or not price-approved.");
    }
    const vendorId = requests[0].vendor_id;
    if (!vendorId || requests.some((request) => request.vendor_id !== vendorId)) {
      throw new Error("Select approved requests for one active vendor.");
    }
    if (requests.some((request) => request.vendor_price === null)) {
      throw new Error("Every selected request must have a saved vendor price.");
    }

    const rawMaterialIds = [...new Set(requests.map((request) => request.raw_material_id))];
    const [organization, vendor, materials] = await Promise.all([
      transaction.organization.findUnique({
        where: { id: organizationId },
        select: { gst_number: true, state: true, country: true },
      }),
      transaction.masterVendor.findFirst({
        where: { id: vendorId, organization_id: organizationId, is_active: true },
        select: { id: true, gst_number: true, registered_state: true, registered_state_id: true },
      }),
      transaction.masterRawMaterial.findMany({
        where: { organization_id: organizationId, id: { in: rawMaterialIds }, is_active: true },
        select: {
          id: true,
          raw_material_name: true,
          raw_material_category_id: true,
          raw_material_sub_category_id: true,
          stock_uom_id: true,
        },
      }),
    ]);
    if (!organization) throw new Error("Organization not found.");
    if (!vendor) throw new Error("The selected vendor is no longer active in this organization.");
    if (materials.length !== rawMaterialIds.length) throw new Error("A selected raw material is no longer active in this organization.");
    const registeredState = vendor.registered_state_id
      ? await transaction.masterState.findFirst({
          where: { id: vendor.registered_state_id, organization_id: organizationId },
          select: { state: true },
        })
      : null;
    if (vendor.registered_state_id && !registeredState) {
      throw new Error("The vendor’s registered state is unavailable in this organization.");
    }
    const categoryIds = [...new Set(materials.map((material) => material.raw_material_category_id))];
    const subCategoryIds = [...new Set(materials.map((material) => material.raw_material_sub_category_id))];
    const uomIds = [...new Set(materials.map((material) => material.stock_uom_id))];
    const [categories, subCategories, uoms] = await Promise.all([
      transaction.masterRawMaterialCategory.findMany({
        where: { organization_id: organizationId, id: { in: categoryIds } },
        select: { id: true, raw_material_category: true },
      }),
      transaction.masterRawMaterialSubCategory.findMany({
        where: { organization_id: organizationId, id: { in: subCategoryIds } },
        select: { id: true, raw_material_sub_category: true },
      }),
      transaction.masterUom.findMany({
        where: { organization_id: organizationId, id: { in: uomIds } },
        select: { id: true, uom: true },
      }),
    ]);
    if (categories.length !== categoryIds.length || subCategories.length !== subCategoryIds.length || uoms.length !== uomIds.length) {
      throw new Error("A selected raw material references unavailable organization master data.");
    }
    const materialsById = new Map(materials.map((material) => [material.id, material]));
    const categoriesById = new Map(categories.map((category) => [category.id, category.raw_material_category]));
    const subCategoriesById = new Map(subCategories.map((category) => [category.id, category.raw_material_sub_category]));
    const uomsById = new Map(uoms.map((uom) => [uom.id, uom.uom]));
    const vendorState = registeredState?.state ?? vendor.registered_state;
    const vendorGstin = vendor.gst_number;
    const defaultTaxProfile = await transaction.organizationTaxProfile.findFirst({
      where: { organization_id: organizationId, is_active: true, is_default: true },
      orderBy: { updated_at: "desc" },
    });
    const gstRates = await transaction.masterGst.findMany({
      where: { organization_id: organizationId, is_active: true },
      select: { gst: true, cgst_rate: true, sgst_rate: true, igst_rate: true },
    });
    const displayNumber = await reserveProcurementDocumentNumber(organizationId, "PURCHASE_ORDER", transaction);
    const displayNo = Number(displayNumber.replace("PO-", ""));
    const taxRegime = defaultTaxProfile?.tax_regime ?? "GST";
    const lines = requests.map((request) => {
      const material = materialsById.get(request.raw_material_id);
      if (!material || !categoriesById.has(material.raw_material_category_id)
        || !subCategoriesById.has(material.raw_material_sub_category_id)
        || !uomsById.has(material.stock_uom_id)) {
        throw new Error("A selected raw material references unavailable organization master data.");
      }
      const taxableAmount = request.quantity.mul(request.vendor_price!);
      if (taxableAmount.gt("99999999.9999")) {
        throw new Error("A General PO line total exceeds the supported range.");
      }
      const rate = request.gst;
      const configuredRate = gstRates.find(
        (gstRate) => gstRate.gst?.equals(rate ?? new Prisma.Decimal(0)),
      );
      const tax = calculateTax({
        taxableAmount: 0,
        totalRate: rate?.toNumber() ?? 0,
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
        vendorGstin,
      });
      const amountForRate = (taxRate: number) =>
        taxableAmount.mul(new Prisma.Decimal(taxRate)).div(100);
      return {
        source_master_line_id: request.id,
        raw_material: material.raw_material_name,
        category: categoriesById.get(material.raw_material_category_id) ?? null,
        sub_category: subCategoriesById.get(material.raw_material_sub_category_id) ?? null,
        quantity: request.quantity,
        price: request.vendor_price,
        gst: request.gst,
        tax_type: tax.taxType,
        cgst_rate: new Prisma.Decimal(tax.cgstRate),
        sgst_rate: new Prisma.Decimal(tax.sgstRate),
        igst_rate: new Prisma.Decimal(tax.igstRate),
        cgst_amount: amountForRate(tax.cgstRate),
        sgst_amount: amountForRate(tax.sgstRate),
        igst_amount: amountForRate(tax.igstRate),
        hsn_code: request.hsn_code,
        stock_uom: uomsById.get(material.stock_uom_id) ?? null,
        total: taxableAmount,
      };
    });

    const created = await transaction.purchaseOrder.create({
      data: {
        organization_id: organizationId,
        vendor_id: vendorId,
        purchase_order_no: `PO-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        display_no: displayNo,
        created_by: createdBy,
        po_date: parsedPoDate!,
        delivery_date: parsedDeliveryDate,
        lines: { create: lines },
      },
      select: { id: true, purchase_order_no: true },
    });

    const linked = await transaction.generalPurchaseOrderRequest.updateMany({
      where: {
        id: { in: uniqueIds },
        organization_id: organizationId,
        status: "PRICE_APPROVED",
        purchase_order_id: null,
      },
      data: { status: "PO_CREATED", purchase_order_id: created.id },
    });
    if (linked.count !== uniqueIds.length) {
      throw new Error("One or more General PO requests changed before the Purchase Order could be created.");
    }
    await createAuditEvent({
      organizationId,
      userId: createdByUserId,
      module: "Procurement",
      action: "CREATE_GENERAL_PURCHASE_ORDER",
      entityType: "PurchaseOrder",
      entityId: created.id,
      details: { purchase_order_no: created.purchase_order_no, request_ids: uniqueIds },
    }, transaction);
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return getPurchaseOrder(organizationId, purchaseOrder.id);
}
