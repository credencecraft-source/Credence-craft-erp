import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";

const SAVED_STATUS = "SAVED";
const POSTED_STATUS = "POSTED";

export type PurchaseRecordLineInput = {
  itemName?: string | null;
  size?: string | null;
  quantity: number | string;
  purchasePrice?: number | string | null;
  salesPrice?: number | string | null;
  gstId?: string | null;
  hsnCode?: string | null;
};

export type CreatePurchaseRecordInput = {
  itemType: "FINISHED_GOODS" | "RAW_MATERIAL";
  styleName?: string | null;
  brandId?: string | null;
  sizeGroupId?: string | null;
  colorId?: string | null;
  categoryId?: string | null;
  subCategoryId?: string | null;
  lines: PurchaseRecordLineInput[];
};

export type CreatePurchaseBillInput = {
  vendorId: string;
  billNumber: string;
  billDate: string;
  taxMode: "LOCAL" | "INTERSTATE";
  recordIds: string[];
};

const PURCHASE_RECORD_GROUP_PREFIX = "GPR";
const PURCHASE_BILL_PREFIX = "PB";

function formatAutoNumber(sequence: number, prefix: string) {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}

async function reservePosDocumentNumber(
  organizationId: string,
  documentType: "PURCHASE_RECORD_GROUP" | "PURCHASE_BILL",
  prefix: string,
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const counter = await database.procurementDocumentCounter.upsert({
    where: {
      organization_id_document_type: {
        organization_id: organizationId,
        document_type: documentType,
      },
    },
    create: {
      organization_id: organizationId,
      document_type: documentType,
      current_value: 1,
    },
    update: {
      current_value: { increment: 1 },
    },
    select: { current_value: true },
  });

  return formatAutoNumber(counter.current_value, prefix);
}

function decimal(value: unknown, field: string, options: { required?: boolean; positive?: boolean } = {}) {
  if (value === null || value === undefined || value === "") {
    if (options.required) throw new Error(`${field} is required.`);
    return null;
  }
  let parsed: Prisma.Decimal;
  try {
    parsed = new Prisma.Decimal(String(value));
  } catch {
    throw new Error(`${field} must be a valid number.`);
  }
  if (!parsed.isFinite() || parsed.isNegative() || (options.positive && parsed.isZero())) {
    throw new Error(`${field} must be ${options.positive ? "greater than zero" : "zero or greater"}.`);
  }
  return parsed;
}

function cleanText(value: unknown, maxLength: number, fallback: string | null = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : fallback;
}

async function validateMasterReferences(organizationId: string, input: CreatePurchaseRecordInput) {
  const referenceChecks = [
    ["brandId", input.brandId, prisma.masterBrand.findFirst({ where: { id: input.brandId ?? "", organization_id: organizationId, is_active: true }, select: { id: true } })],
    ["sizeGroupId", input.sizeGroupId, prisma.masterSizeGroup.findFirst({ where: { id: input.sizeGroupId ?? "", organization_id: organizationId, is_active: true }, select: { id: true } })],
    ["colorId", input.colorId, prisma.masterColor.findFirst({ where: { id: input.colorId ?? "", organization_id: organizationId, is_active: true }, select: { id: true } })],
    ["categoryId", input.categoryId, prisma.masterCategory.findFirst({ where: { id: input.categoryId ?? "", organization_id: organizationId, is_active: true }, select: { id: true } })],
    ["subCategoryId", input.subCategoryId, prisma.masterSubCategory.findFirst({ where: { id: input.subCategoryId ?? "", organization_id: organizationId, is_active: true }, select: { id: true } })],
  ] as const;
  const referenceValues = await Promise.all(referenceChecks.map(([, id, check]) => id ? check : Promise.resolve(null)));
  for (const [index, [field, id]] of referenceChecks.entries()) {
    if (id && !referenceValues[index]) throw new Error(`${field} is not a valid active master value for this organization.`);
  }

  if (input.categoryId && input.subCategoryId) {
    const subCategory = await prisma.masterSubCategory.findFirst({ where: { id: input.subCategoryId, organization_id: organizationId, category_id: input.categoryId, is_active: true }, select: { id: true } });
    if (!subCategory) throw new Error("The selected product subcategory does not belong to the selected category.");
  }

  if (input.itemType === "FINISHED_GOODS" && (!input.styleName || !input.brandId || !input.sizeGroupId || !input.colorId || !input.categoryId || !input.subCategoryId)) {
    throw new Error("Finished Goods require style, brand, size group, color, category, and subcategory.");
  }

  if (!Array.isArray(input.lines) || input.lines.length === 0) throw new Error("At least one purchase line is required.");
  for (const line of input.lines) {
    decimal(line.quantity, "Quantity", { required: true, positive: true });
    decimal(line.purchasePrice, "Purchase price");
    decimal(line.salesPrice, "Sales price");
    if (line.gstId) {
      const gst = await prisma.masterGst.findFirst({ where: { id: line.gstId, organization_id: organizationId, is_active: true }, select: { id: true } });
      if (!gst) throw new Error("One selected GST value is not valid for this organization.");
    }
    if (line.hsnCode) {
      const hsn = await prisma.masterHsn.findFirst({ where: { organization_id: organizationId, hsn_code: String(line.hsnCode).trim(), is_active: true }, select: { id: true } });
      if (!hsn) throw new Error("One selected HSN value is not valid for this organization.");
    }
  }
}

function serializeRecord(record: Prisma.PosPurchaseRecordGetPayload<{ include: { lines: true } }>) {
  return {
    id: record.id,
    recordNumber: record.record_number,
    itemType: record.item_type,
    styleName: record.style_name,
    brandId: record.brand_id,
    sizeGroupId: record.size_group_id,
    colorId: record.color_id,
    categoryId: record.category_id,
    subCategoryId: record.sub_category_id,
    status: record.status,
    savedAt: record.created_at,
    lines: record.lines.map((line) => ({
      id: line.id,
      itemName: line.item_name ?? "",
      size: line.size ?? "",
      quantity: line.quantity.toString(),
      purchasePrice: line.purchase_price?.toString() ?? "",
      salesPrice: line.sales_price?.toString() ?? "",
      gstId: line.gst_id ?? "",
      hsnCode: line.hsn_code ?? "",
    })),
  };
}

export async function createPurchaseRecord(organizationId: string, actorId: string, input: CreatePurchaseRecordInput) {
  await validateMasterReferences(organizationId, input);
  const record = await prisma.$transaction(async (transaction) => {
    const recordNumber = await reservePosDocumentNumber(
      organizationId,
      "PURCHASE_RECORD_GROUP",
      PURCHASE_RECORD_GROUP_PREFIX,
      transaction,
    );
    const created = await transaction.posPurchaseRecord.create({
      data: {
        organization_id: organizationId,
        record_number: recordNumber,
        item_type: input.itemType,
        style_name: cleanText(input.styleName, 255),
        brand_id: cleanText(input.brandId, 255),
        size_group_id: cleanText(input.sizeGroupId, 255),
        color_id: cleanText(input.colorId, 255),
        category_id: cleanText(input.categoryId, 255),
        sub_category_id: cleanText(input.subCategoryId, 255),
        status: SAVED_STATUS,
        created_by: actorId,
        lines: {
          create: input.lines.map((line) => ({
            item_name: cleanText(line.itemName, 255),
            size: cleanText(line.size, 100),
            quantity: decimal(line.quantity, "Quantity", { required: true, positive: true })!,
            purchase_price: decimal(line.purchasePrice, "Purchase price"),
            sales_price: decimal(line.salesPrice, "Sales price"),
            gst_id: cleanText(line.gstId, 255),
            hsn_code: cleanText(line.hsnCode, 100),
          })),
        },
      },
      include: { lines: true },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organizationId,
        user_id: actorId,
        module: "POS_PURCHASE_BILL",
        action: "CREATE_RECORD",
        entity_type: "pos_purchase_record",
        entity_id: created.id,
        details: {
          lineCount: created.lines.length,
          itemType: created.item_type,
          recordNumber,
        },
      },
    });
    return { created, recordNumber };
  });
  return serializeRecord(record.created);
}

export async function listPurchaseRecords(organizationId: string) {
  const records = await prisma.posPurchaseRecord.findMany({
    where: { organization_id: organizationId, status: SAVED_STATUS },
    include: { lines: { orderBy: { created_at: "asc" } } },
    orderBy: { created_at: "asc" },
  });
  return records.map(serializeRecord);
}

export async function updatePurchaseRecord(organizationId: string, actorId: string, recordId: string, input: CreatePurchaseRecordInput) {
  await validateMasterReferences(organizationId, input);
  const existing = await prisma.posPurchaseRecord.findFirst({ where: { id: recordId, organization_id: organizationId, status: SAVED_STATUS }, select: { id: true } });
  if (!existing) throw new Error("Saved purchase record was not found or is already posted.");

  const record = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.posPurchaseRecord.update({
      where: { id: recordId },
      data: {
        item_type: input.itemType,
        style_name: cleanText(input.styleName, 255),
        brand_id: cleanText(input.brandId, 255),
        size_group_id: cleanText(input.sizeGroupId, 255),
        color_id: cleanText(input.colorId, 255),
        category_id: cleanText(input.categoryId, 255),
        sub_category_id: cleanText(input.subCategoryId, 255),
        lines: {
          deleteMany: {},
          create: input.lines.map((line) => ({
            item_name: cleanText(line.itemName, 255),
            size: cleanText(line.size, 100),
            quantity: decimal(line.quantity, "Quantity", { required: true, positive: true })!,
            purchase_price: decimal(line.purchasePrice, "Purchase price"),
            sales_price: decimal(line.salesPrice, "Sales price"),
            gst_id: cleanText(line.gstId, 255),
            hsn_code: cleanText(line.hsnCode, 100),
          })),
        },
      },
      include: { lines: true },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organizationId,
        user_id: actorId,
        module: "POS_PURCHASE_BILL",
        action: "UPDATE_RECORD",
        entity_type: "pos_purchase_record",
        entity_id: recordId,
        details: { lineCount: updated.lines.length, itemType: updated.item_type },
      },
    });
    return updated;
  });
  return serializeRecord(record);
}

export async function deletePurchaseRecords(organizationId: string, actorId: string, recordIds: string[]) {
  const ids = [...new Set(recordIds.filter(Boolean))];
  if (ids.length === 0) throw new Error("Select at least one saved record to delete.");
  const records = await prisma.posPurchaseRecord.findMany({ where: { id: { in: ids }, organization_id: organizationId, status: SAVED_STATUS }, select: { id: true } });
  if (records.length !== ids.length) throw new Error("Only unposted saved records can be deleted.");
  await prisma.$transaction(async (transaction) => {
    await transaction.posPurchaseRecord.deleteMany({ where: { id: { in: ids }, organization_id: organizationId, status: SAVED_STATUS } });
    await transaction.auditEvent.create({
      data: {
        organization_id: organizationId,
        user_id: actorId,
        module: "POS_PURCHASE_BILL",
        action: "DELETE_RECORDS",
        entity_type: "pos_purchase_record",
        details: { recordIds: ids },
      },
    });
  });
  return { deletedCount: ids.length };
}

export async function createPurchaseBill(organizationId: string, actorId: string, input: CreatePurchaseBillInput) {
  const billNumber = input.billNumber.trim();
  if (!input.recordIds.length) throw new Error("Save at least one purchase record before posting the bill.");
  const billDate = new Date(input.billDate);
  if (Number.isNaN(billDate.getTime())) throw new Error("Bill date is invalid.");

  const vendor = await prisma.masterVendor.findFirst({ where: { id: input.vendorId, organization_id: organizationId, is_active: true }, select: { id: true } });
  if (!vendor) throw new Error("Select a valid active vendor from this organization.");

  const result = await prisma.$transaction(async (transaction) => {
    const documentNumber = await reservePosDocumentNumber(
      organizationId,
      "PURCHASE_BILL",
      PURCHASE_BILL_PREFIX,
      transaction,
    );
    const records = await transaction.posPurchaseRecord.findMany({
      where: { id: { in: [...new Set(input.recordIds)] }, organization_id: organizationId, status: SAVED_STATUS },
      include: { lines: true },
      orderBy: { created_at: "asc" },
    });
    if (records.length !== new Set(input.recordIds).size) throw new Error("One or more saved purchase records are unavailable or already posted.");

    const gstIds = [...new Set(records.flatMap((record) => record.lines.map((line) => line.gst_id).filter((id): id is string => Boolean(id))))];
    const gstValues = await transaction.masterGst.findMany({ where: { organization_id: organizationId, id: { in: gstIds }, is_active: true }, select: { id: true, gst: true } });
    const gstById = new Map(gstValues.map((gst) => [gst.id, new Prisma.Decimal(gst.gst ?? 0)]));
    if (gstById.size !== gstIds.length) throw new Error("One or more GST values are unavailable.");

    let totalQuantity = new Prisma.Decimal(0);
    let subtotal = new Prisma.Decimal(0);
    let tax = new Prisma.Decimal(0);
    const lineData = records.flatMap((record) => record.lines.map((line) => {
      const quantity = line.quantity;
      const price = line.purchase_price ?? new Prisma.Decimal(0);
      const lineSubtotal = quantity.mul(price);
      const gstRate = line.gst_id ? gstById.get(line.gst_id) ?? new Prisma.Decimal(0) : new Prisma.Decimal(0);
      const lineTax = lineSubtotal.mul(gstRate).div(100);
      totalQuantity = totalQuantity.add(quantity);
      subtotal = subtotal.add(lineSubtotal);
      tax = tax.add(lineTax);
      return {
        source_record_id: record.id,
        item_name: line.item_name,
        size: line.size,
        quantity,
        purchase_price: line.purchase_price,
        sales_price: line.sales_price,
        gst_id: line.gst_id,
        gst_rate: gstRate,
        hsn_code: line.hsn_code,
        tax_amount: lineTax,
        total: lineSubtotal.add(lineTax),
      };
    }));

    const bill = await transaction.posPurchaseBill.create({
      data: {
        organization_id: organizationId,
        document_number: documentNumber,
        vendor_id: vendor.id,
        bill_number: billNumber || documentNumber,
        bill_date: billDate,
        tax_mode: input.taxMode,
        status: POSTED_STATUS,
        total_quantity: totalQuantity,
        subtotal,
        tax,
        total: subtotal.add(tax),
        created_by: actorId,
        posted_at: new Date(),
        lines: { create: lineData },
      },
      include: { lines: true },
    });
    await transaction.posPurchaseRecord.updateMany({ where: { id: { in: records.map((record) => record.id) }, organization_id: organizationId }, data: { status: POSTED_STATUS, purchase_bill_id: bill.id } });
    await transaction.auditEvent.create({
      data: {
        organization_id: organizationId,
        user_id: actorId,
        module: "POS_PURCHASE_BILL",
        action: "POST_BILL",
        entity_type: "pos_purchase_bill",
        entity_id: bill.id,
        details: {
          recordCount: records.length,
          lineCount: lineData.length,
          documentNumber,
          supplierInvoiceNumber: billNumber || null,
        },
      },
    });
    return { bill, documentNumber };
  });

  return {
    id: result.bill.id,
    documentNumber: result.documentNumber,
    billNumber: result.bill.bill_number,
    status: result.bill.status,
    totalQuantity: result.bill.total_quantity.toString(),
    subtotal: result.bill.subtotal.toString(),
    tax: result.bill.tax.toString(),
    total: result.bill.total.toString(),
  };
}

export async function listPurchaseBills(organizationId: string) {
  const bills = await prisma.posPurchaseBill.findMany({
    where: { organization_id: organizationId },
    include: { lines: { orderBy: { created_at: "asc" } } },
    orderBy: { created_at: "desc" },
  });
  const vendorIds = [...new Set(bills.map((bill) => bill.vendor_id))];
  const vendors = await prisma.masterVendor.findMany({ where: { organization_id: organizationId, id: { in: vendorIds } }, select: { id: true, vendor: true } });
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor.vendor]));
  return bills.map((bill) => ({
    id: bill.id,
    documentType: "Purchase Invoice",
    documentNumber: bill.document_number,
    supplierInvoiceNumber: bill.bill_number,
    sourceModule: "POS",
    date: bill.bill_date,
    party: vendorById.get(bill.vendor_id) ?? bill.vendor_id,
    amount: Number(bill.subtotal),
    tax: Number(bill.tax),
    net: Number(bill.total),
    status: bill.status,
    paymentStatus: "Pending",
    totalQuantity: Number(bill.total_quantity),
    lines: bill.lines.map((line) => ({
      id: line.id,
      size: line.size,
      itemName: line.item_name,
      quantity: Number(line.quantity),
      purchasePrice: Number(line.purchase_price ?? 0),
      salesPrice: Number(line.sales_price ?? 0),
      gst: Number(line.gst_rate ?? 0),
      hsnCode: line.hsn_code,
      total: Number(line.total),
    })),
  }));
}
