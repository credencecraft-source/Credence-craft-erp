import {
  FGMaterialIssueMovement,
  FGMaterialIssueSource,
  FGMaterialIssueStockType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createFgMaterialIssue } from "@/lib/services/inventory/fg-issued-service";
import { GENERAL_FINISHED_GOODS_SKU_SOURCES } from "@/lib/services/inventory/finished-goods-stock-overview";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";

type PosSaleLineInput = {
  stockId: string;
  stockType?: "SKU" | "GENERAL_GRN";
  quantity: string;
  rate: string;
  gstRate: string;
  discountPercent: string;
  hsnCode?: string | null;
};

type CreatePosSaleInput = {
  organizationId: string;
  actorId: string;
  requestKey: string;
  invoiceDate: string;
  customer?: string | null;
  customerContactId?: string | null;
  taxMode: "LOCAL" | "INTERSTATE";
  lines: PosSaleLineInput[];
};

type PosSaleStockRecord = {
  id: string;
  stockType: "SKU" | "GENERAL_GRN";
  style_name: string;
  order_no: string;
  article_no: string | null;
  size: string | null;
  colour: string | null;
  location_id: string;
  current_stock: number | Prisma.Decimal;
};

function stockKey(stockType: "SKU" | "GENERAL_GRN", stockId: string) {
  return `${stockType}:${stockId}`;
}

function parseDecimal(value: string, field: string, scale: number, maximum?: number) {
  const pattern = scale === 0
    ? /^\d{1,10}$/
    : new RegExp(`^\\d{1,10}(?:\\.\\d{1,${scale}})?$`);
  if (!pattern.test(value.trim())) throw new Error(`${field} must be a valid non-negative number.`);
  const parsed = new Prisma.Decimal(value.trim());
  if (!parsed.isFinite() || (maximum !== undefined && parsed.gt(maximum))) {
    throw new Error(`${field} is outside the allowed range.`);
  }
  return parsed;
}

function money(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function assertMoneyRange(value: Prisma.Decimal, field: string) {
  if (value.gt("999999999999.99")) throw new Error(`${field} exceeds the invoice amount limit.`);
}

function parseInvoiceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid invoice date.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Enter a valid invoice date.");
  }
  return date;
}

export async function createPosGeneralStockSale(input: CreatePosSaleInput) {
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    throw new Error("A POS invoice must contain between 1 and 100 items.");
  }
  if (input.taxMode !== "LOCAL" && input.taxMode !== "INTERSTATE") {
    throw new Error("Select a valid tax mode.");
  }
  const requestKey = input.requestKey.trim();
  if (!requestKey || requestKey.length > 100) throw new Error("A valid POS sale request key is required.");
  const invoiceDate = parseInvoiceDate(input.invoiceDate);
  const requestedCustomerContactId = input.customerContactId?.trim() || null;
  if (input.customerContactId !== undefined && input.customerContactId !== null
    && (!requestedCustomerContactId || requestedCustomerContactId.length > 100)) {
    throw new Error("Select a valid customer contact.");
  }
  const requestedCustomer = input.customer?.trim() || null;
  if (requestedCustomer && requestedCustomer.length > 255) {
    throw new Error("Customer name must be 255 characters or fewer.");
  }

  const normalizedLines = input.lines.map((line) => {
    const stockId = line.stockId.trim();
    if (!stockId) throw new Error("Every invoice item must reference General finished-goods stock.");
    const stockType = line.stockType ?? "GENERAL_GRN";
    if (stockType !== "SKU" && stockType !== "GENERAL_GRN") {
      throw new Error("Every invoice item must reference a supported General stock type.");
    }
    const quantityDecimal = parseDecimal(line.quantity, "Quantity", 0, 2_147_483_647);
    if (quantityDecimal.isZero()) throw new Error("Quantity must be greater than zero.");
    const hsnCode = line.hsnCode?.trim() || null;
    if (hsnCode && hsnCode.length > 100) throw new Error("HSN code must be 100 characters or fewer.");
    return {
      stockId,
      stockType,
      quantity: quantityDecimal.toNumber(),
      rate: parseDecimal(line.rate, "Price", 4),
      gstRate: parseDecimal(line.gstRate, "GST rate", 2, 100),
      discountPercent: parseDecimal(line.discountPercent, "Discount", 2, 100),
      hsnCode,
    };
  });
  if (new Set(normalizedLines.map((line) => stockKey(line.stockType, line.stockId))).size !== normalizedLines.length) {
    throw new Error("A General stock record can only appear once per invoice.");
  }

  return prisma.$transaction(async (transaction) => {
    const existingInvoice = await transaction.posSalesInvoice.findFirst({
      where: { organization_id: input.organizationId, request_key: requestKey },
      select: { id: true, invoice_no: true, invoice_date: true, customer: true, tax_mode: true, subtotal: true, cgst_amount: true, sgst_amount: true, igst_amount: true, tax_amount: true, total_amount: true },
    });
    if (existingInvoice) {
      return {
        id: existingInvoice.id,
        invoiceNo: existingInvoice.invoice_no,
        invoiceDate: existingInvoice.invoice_date,
        customer: existingInvoice.customer,
        taxMode: existingInvoice.tax_mode as "LOCAL" | "INTERSTATE",
        subtotal: existingInvoice.subtotal.toFixed(2),
        cgstAmount: existingInvoice.cgst_amount.toFixed(2),
        sgstAmount: existingInvoice.sgst_amount.toFixed(2),
        igstAmount: existingInvoice.igst_amount.toFixed(2),
        taxAmount: existingInvoice.tax_amount.toFixed(2),
        totalAmount: existingInvoice.total_amount.toFixed(2),
      };
    }
    const customerContact = requestedCustomerContactId
      ? await transaction.contact.findFirst({
          where: {
            organization_id: input.organizationId,
            id: requestedCustomerContactId,
            is_active: true,
            roles: { some: { role_code: "CUSTOMER", is_active: true } },
          },
          select: { id: true, legal_name: true, display_name: true },
        })
      : null;
    if (requestedCustomerContactId && !customerContact) {
      throw new Error("Select an active contact with the Customer role.");
    }
    const customer = customerContact
      ? customerContact.display_name || customerContact.legal_name
      : requestedCustomer;
    const generalReceiptIds = normalizedLines
      .filter((line) => line.stockType === "GENERAL_GRN")
      .map((line) => line.stockId);
    const skuStockIds = normalizedLines
      .filter((line) => line.stockType === "SKU")
      .map((line) => line.stockId);
    const [generalReceiptRecords, skuStockRecords] = await Promise.all([
      generalReceiptIds.length
        ? transaction.finishedGoodsGeneralStockReceipt.findMany({
            where: { organization_id: input.organizationId, id: { in: generalReceiptIds } },
            select: {
              id: true,
              style_name: true,
              order_no: true,
              article_no: true,
              size: true,
              colour: true,
              location_id: true,
              current_stock: true,
            },
          })
        : Promise.resolve([]),
      skuStockIds.length
        ? transaction.finishedGoodsSkuStock.findMany({
            where: {
              organization_id: input.organizationId,
              id: { in: skuStockIds },
              source: { in: [...GENERAL_FINISHED_GOODS_SKU_SOURCES] },
            },
            select: {
              id: true,
              style_name: true,
              order_no: true,
              article_no: true,
              size: true,
              colour: true,
              location_id: true,
              current_stock: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const stockRecords: PosSaleStockRecord[] = [
      ...generalReceiptRecords.map((record) => ({ ...record, stockType: "GENERAL_GRN" as const })),
      ...skuStockRecords.map((record) => ({ ...record, stockType: "SKU" as const })),
    ];
    const requestedGstRates = [...new Set(normalizedLines.map((line) => line.gstRate.toFixed(2)))];
    const configuredGstRates = await transaction.masterGst.findMany({
      where: {
        organization_id: input.organizationId,
        is_active: true,
        gst: { in: requestedGstRates.map((rate) => new Prisma.Decimal(rate)) },
      },
      select: { gst: true, cgst_rate: true, sgst_rate: true, igst_rate: true },
    });
    const gstByRate = new Map(configuredGstRates.map((rate) => [
      rate.gst?.toFixed(2) ?? "0.00",
      rate,
    ]));
    if (stockRecords.length !== normalizedLines.length) {
      throw new Error("One or more selected items are not General stock in this organization.");
    }
    const stockByKey = new Map(stockRecords.map((stock) => [stockKey(stock.stockType, stock.id), stock]));
    const subtotal = new Prisma.Decimal(0);
    const totals = {
      subtotal,
      cgst: new Prisma.Decimal(0),
      sgst: new Prisma.Decimal(0),
      igst: new Prisma.Decimal(0),
    };

    const invoiceLines = normalizedLines.map((line) => {
      const stock = stockByKey.get(stockKey(line.stockType, line.stockId));
      if (!stock) throw new Error("A selected General stock record was not found.");
      const availableStock = new Prisma.Decimal(stock.current_stock);
      if (availableStock.lt(line.quantity)) {
        throw new Error(`${stock.style_name} has only ${stock.current_stock} General units available.`);
      }
      const taxableAmount = money(
        new Prisma.Decimal(line.quantity)
          .mul(line.rate)
          .mul(new Prisma.Decimal(100).minus(line.discountPercent).div(100)),
      );
      const taxAmount = money(taxableAmount.mul(line.gstRate).div(100));
      assertMoneyRange(taxableAmount, "Line amount");
      assertMoneyRange(taxAmount, "Line tax");
      const configuredRate = gstByRate.get(line.gstRate.toFixed(2));
      if (!configuredRate && !line.gstRate.isZero()) {
        throw new Error(`GST ${line.gstRate.toFixed(2)}% is not configured as active for this organization.`);
      }
      const componentRate = input.taxMode === "LOCAL"
        ? (configuredRate?.cgst_rate && configuredRate.sgst_rate
          ? configuredRate.cgst_rate.plus(configuredRate.sgst_rate)
          : new Prisma.Decimal(0))
        : configuredRate?.igst_rate ?? new Prisma.Decimal(0);
      if (!line.gstRate.isZero() && !componentRate.equals(line.gstRate)) {
        throw new Error(`GST component rates for ${line.gstRate.toFixed(2)}% are not configured correctly.`);
      }
      const cgstAmount = input.taxMode === "LOCAL"
        ? money(taxableAmount.mul(configuredRate?.cgst_rate ?? 0).div(100))
        : new Prisma.Decimal(0);
      const sgstAmount = input.taxMode === "LOCAL"
        ? taxAmount.minus(cgstAmount)
        : new Prisma.Decimal(0);
      const igstAmount = input.taxMode === "INTERSTATE" ? taxAmount : new Prisma.Decimal(0);
      const lineTotal = taxableAmount.plus(taxAmount);
      assertMoneyRange(lineTotal, "Line total");
      totals.subtotal = totals.subtotal.plus(taxableAmount);
      totals.cgst = totals.cgst.plus(cgstAmount);
      totals.sgst = totals.sgst.plus(sgstAmount);
      totals.igst = totals.igst.plus(igstAmount);
      assertMoneyRange(totals.subtotal, "Invoice subtotal");
      assertMoneyRange(totals.cgst.plus(totals.sgst).plus(totals.igst), "Invoice tax");

      return {
        organization_id: input.organizationId,
        general_stock_receipt_id: stock.stockType === "GENERAL_GRN" ? stock.id : null,
        sku_stock_id: stock.stockType === "SKU" ? stock.id : null,
        style_name: stock.style_name,
        order_no: stock.order_no,
        article_no: stock.article_no ?? "",
        size: stock.size ?? "",
        colour: stock.colour,
        quantity: line.quantity,
        unit_rate: line.rate,
        gst_rate: line.gstRate,
        discount_percent: line.discountPercent,
        hsn_code: line.hsnCode,
        taxable_amount: taxableAmount,
        cgst_amount: cgstAmount,
        sgst_amount: sgstAmount,
        igst_amount: igstAmount,
        total_amount: lineTotal,
      };
    });
    assertMoneyRange(totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst), "Invoice total");

    const invoiceNo = await reserveProcurementDocumentNumber(
      input.organizationId,
      "POS_SALES_INVOICE",
      transaction,
    );
    const invoice = await transaction.posSalesInvoice.create({
      data: {
        organization_id: input.organizationId,
        invoice_no: invoiceNo,
        request_key: requestKey,
        invoice_date: invoiceDate,
        customer,
        customer_contact_id: customerContact?.id ?? null,
        tax_mode: input.taxMode,
        status: "POSTED",
        subtotal: totals.subtotal,
        cgst_amount: totals.cgst,
        sgst_amount: totals.sgst,
        igst_amount: totals.igst,
        tax_amount: totals.cgst.plus(totals.sgst).plus(totals.igst),
        total_amount: totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst),
        created_by: input.actorId,
      },
      select: { id: true },
    });

    for (const line of normalizedLines) {
      const stock = stockByKey.get(stockKey(line.stockType, line.stockId));
      if (!stock) throw new Error("A selected General stock record was not found.");
      const stockWhere = {
        id: stock.id,
        organization_id: input.organizationId,
        current_stock: { gte: line.quantity },
      };
      const deducted = stock.stockType === "SKU"
        ? await transaction.finishedGoodsSkuStock.updateMany({
            where: stockWhere,
            data: {
              current_stock: { decrement: line.quantity },
              qty_out: { increment: line.quantity },
            },
          })
        : await transaction.finishedGoodsGeneralStockReceipt.updateMany({
            where: stockWhere,
            data: {
              current_stock: { decrement: line.quantity },
              quantity_out: { increment: line.quantity },
            },
          });
      if (deducted.count !== 1) {
        throw new Error(`${stock.style_name} no longer has enough General stock. Refresh and retry.`);
      }
      if (stock.stockType === "GENERAL_GRN") {
        const summaryUpdated = await transaction.finishedGoodsStock.updateMany({
          where: {
            organization_id: input.organizationId,
            location_id: stock.location_id,
            style_name: stock.style_name,
            size: stock.size,
            quantity_on_hand: { gte: line.quantity },
          },
          data: {
            quantity_on_hand: { decrement: line.quantity },
            quantity_issued: { increment: line.quantity },
          },
        });
        if (summaryUpdated.count !== 1) {
          throw new Error("Finished-goods summary does not match General stock; sale was not posted.");
        }
      }
    }

    const createdInvoiceLines = await transaction.posSalesInvoiceLine.createManyAndReturn({
      data: invoiceLines.map((line) => ({ ...line, invoice_id: invoice.id })),
      select: { id: true, general_stock_receipt_id: true, sku_stock_id: true },
    });
    const invoiceLineIdByStockId = new Map(
      createdInvoiceLines.map((line) => [
        stockKey(line.sku_stock_id ? "SKU" : "GENERAL_GRN", line.sku_stock_id ?? line.general_stock_receipt_id ?? ""),
        line.id,
      ]),
    );
    await createFgMaterialIssue(transaction, {
      organizationId: input.organizationId,
      sourceType: FGMaterialIssueSource.POS_INVOICE,
      movement: FGMaterialIssueMovement.ISSUE,
      posInvoiceId: invoice.id,
      idempotencyKey: `pos-invoice:${invoice.id}:issue`,
      sourceReference: invoiceNo,
      issuedBy: input.actorId,
      lines: invoiceLines.map((line) => {
        const stockType = line.sku_stock_id ? "SKU" : "GENERAL_GRN";
        const sourceId = line.sku_stock_id ?? line.general_stock_receipt_id;
        if (!sourceId) throw new Error("A posted POS invoice line has no matching General stock record.");
        const stock = stockByKey.get(stockKey(stockType, sourceId));
        if (!stock) throw new Error("A posted POS invoice line has no matching General stock record.");
        const stockBefore = new Prisma.Decimal(stock.current_stock);
        const quantity = new Prisma.Decimal(line.quantity);
        const posInvoiceLineId = invoiceLineIdByStockId.get(stockKey(stockType, sourceId));
        if (!posInvoiceLineId) throw new Error("A posted POS invoice line could not be linked to its stock movement.");
        return {
          stockType: stockType === "SKU" ? FGMaterialIssueStockType.SKU : FGMaterialIssueStockType.GENERAL,
          skuStockId: stockType === "SKU" ? stock.id : null,
          generalReceiptId: stockType === "GENERAL_GRN" ? stock.id : null,
          posInvoiceLineId,
          styleName: line.style_name,
          articleNo: line.article_no,
          size: line.size,
          colour: line.colour,
          quantity,
          uomCode: "PCS",
          stockBefore,
          stockAfter: stockBefore.minus(quantity),
        };
      }),
    });
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "POS",
      action: "POST_GENERAL_FG_SALE",
      entityType: "pos_sales_invoice",
      entityId: invoice.id,
      details: {
        invoiceNo,
        lineCount: invoiceLines.length,
        totalAmount: totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst).toFixed(2),
        stockMovements: normalizedLines.map((line) => {
          const stock = stockByKey.get(stockKey(line.stockType, line.stockId));
          return {
            stockId: line.stockId,
            stockType: line.stockType,
            quantity: line.quantity,
            beforeQuantity: stock ? new Prisma.Decimal(stock.current_stock).toString() : null,
            afterQuantity: stock ? new Prisma.Decimal(stock.current_stock).minus(line.quantity).toString() : null,
          };
        }),
      },
    }, transaction);

    return {
      id: invoice.id,
      invoiceNo,
      invoiceDate,
      customer,
      taxMode: input.taxMode,
      subtotal: totals.subtotal.toFixed(2),
      cgstAmount: totals.cgst.toFixed(2),
      sgstAmount: totals.sgst.toFixed(2),
      igstAmount: totals.igst.toFixed(2),
      taxAmount: totals.cgst.plus(totals.sgst).plus(totals.igst).toFixed(2),
      totalAmount: totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst).toFixed(2),
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
}
