import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";

type PosSaleLineInput = {
  stockId: string;
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
  taxMode: "LOCAL" | "INTERSTATE";
  lines: PosSaleLineInput[];
};

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
  const customer = input.customer?.trim() || null;
  if (customer && customer.length > 255) throw new Error("Customer name must be 255 characters or fewer.");

  const normalizedLines = input.lines.map((line) => {
    const stockId = line.stockId.trim();
    if (!stockId) throw new Error("Every invoice item must reference General finished-goods stock.");
    const quantityDecimal = parseDecimal(line.quantity, "Quantity", 0, 2_147_483_647);
    if (quantityDecimal.isZero()) throw new Error("Quantity must be greater than zero.");
    const hsnCode = line.hsnCode?.trim() || null;
    if (hsnCode && hsnCode.length > 100) throw new Error("HSN code must be 100 characters or fewer.");
    return {
      stockId,
      quantity: quantityDecimal.toNumber(),
      rate: parseDecimal(line.rate, "Price", 4),
      gstRate: parseDecimal(line.gstRate, "GST rate", 2, 100),
      discountPercent: parseDecimal(line.discountPercent, "Discount", 2, 100),
      hsnCode,
    };
  });
  if (new Set(normalizedLines.map((line) => line.stockId)).size !== normalizedLines.length) {
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
    const stockRecords = await transaction.finishedGoodsGeneralStockReceipt.findMany({
      where: {
        organization_id: input.organizationId,
        id: { in: normalizedLines.map((line) => line.stockId) },
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
    });
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
    const stockById = new Map(stockRecords.map((stock) => [stock.id, stock]));
    const subtotal = new Prisma.Decimal(0);
    const totals = {
      subtotal,
      cgst: new Prisma.Decimal(0),
      sgst: new Prisma.Decimal(0),
      igst: new Prisma.Decimal(0),
    };

    const invoiceLines = normalizedLines.map((line) => {
      const stock = stockById.get(line.stockId);
      if (!stock) throw new Error("A selected General stock record was not found.");
      if (stock.current_stock < line.quantity) {
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
        general_stock_receipt_id: stock.id,
        style_name: stock.style_name,
        order_no: stock.order_no,
        article_no: stock.article_no ?? "",
        size: stock.size,
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
      const stock = stockById.get(line.stockId);
      if (!stock) throw new Error("A selected General stock record was not found.");
      const deducted = await transaction.finishedGoodsGeneralStockReceipt.updateMany({
        where: {
          id: stock.id,
          organization_id: input.organizationId,
          current_stock: { gte: line.quantity },
        },
        data: {
          current_stock: { decrement: line.quantity },
          quantity_out: { increment: line.quantity },
        },
      });
      if (deducted.count !== 1) {
        throw new Error(`${stock.style_name} no longer has enough General stock. Refresh and retry.`);
      }
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

    await transaction.posSalesInvoiceLine.createMany({
      data: invoiceLines.map((line) => ({ ...line, invoice_id: invoice.id })),
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
          const stock = stockById.get(line.stockId);
          return {
            stockId: line.stockId,
            quantity: line.quantity,
            beforeQuantity: stock?.current_stock ?? null,
            afterQuantity: stock ? stock.current_stock - line.quantity : null,
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
