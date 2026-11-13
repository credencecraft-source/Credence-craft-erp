import {
  FGMaterialIssueMovement,
  FGMaterialIssueSource,
  FGMaterialIssueStockType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/database/prisma-client";
import { createFgMaterialIssue } from "@/lib/services/inventory/fg-issued-service";
import { createAuditEvent } from "@/lib/services/organizations/audit-event-service";
import { reserveProcurementDocumentNumber } from "@/lib/services/orders/procurement-document-number-service";
import { normalizeUppercase } from "@/lib/utilities/text-case";

const POS_RETURN_INVOICE_SELECT = {
  id: true,
  invoice_no: true,
  invoice_date: true,
  customer: true,
  customer_contact_id: true,
  customer_contact: { select: { phone: true } },
  entity_name_snapshot: true,
  entity: { select: { entity_name: true } },
  status: true,
  subtotal: true,
  cgst_amount: true,
  sgst_amount: true,
  igst_amount: true,
  tax_amount: true,
  total_amount: true,
  posted_at: true,
  lines: {
    select: {
      id: true,
      sku_stock_id: true,
      general_stock_receipt_id: true,
      style_name: true,
      order_no: true,
      article_no: true,
      size: true,
      colour: true,
      quantity: true,
      returned_quantity: true,
      unit_rate: true,
      gst_rate: true,
      discount_percent: true,
      taxable_amount: true,
      cgst_amount: true,
      sgst_amount: true,
      igst_amount: true,
      total_amount: true,
    },
    orderBy: [{ id: "asc" }],
  },
} satisfies Prisma.PosSalesInvoiceSelect;

type PosReturnInvoice = Prisma.PosSalesInvoiceGetPayload<{ select: typeof POS_RETURN_INVOICE_SELECT }>;
type PosReturnSelection = { invoiceLineId: string; quantity: number };

export class PosSalesReturnError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "PosSalesReturnError";
  }
}

export type PosSalesReturnCursor = { id: string; postedAt: Date };

export function encodePosSalesReturnCursor(cursor: PosSalesReturnCursor) {
  return Buffer.from(JSON.stringify({
    id: cursor.id,
    postedAt: cursor.postedAt.toISOString(),
  })).toString("base64url");
}

export function parsePosSalesReturnCursor(value: string): PosSalesReturnCursor | null {
  if (!value || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      postedAt?: unknown;
    };
    if (
      typeof parsed.id !== "string"
      || parsed.id.length === 0
      || parsed.id.length > 100
      || typeof parsed.postedAt !== "string"
    ) return null;
    const postedAt = new Date(parsed.postedAt);
    if (Number.isNaN(postedAt.getTime()) || postedAt.toISOString() !== parsed.postedAt) return null;
    return { id: parsed.id, postedAt };
  } catch {
    return null;
  }
}

function mapReturnInvoice(invoice: PosReturnInvoice, returnableLineIds?: Set<string>) {
  const hasMissingStockIssue = returnableLineIds
    ? invoice.lines.some((line) => !returnableLineIds.has(line.id))
    : false;
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_no,
    invoiceDate: invoice.invoice_date.toISOString().slice(0, 10),
    customer: invoice.customer ?? "",
    customerContactId: invoice.customer_contact_id,
    customerPhone: invoice.customer_contact?.phone ?? "",
    entityName: invoice.entity_name_snapshot ?? invoice.entity?.entity_name ?? "",
    status: invoice.status,
    subtotal: invoice.subtotal.toFixed(2),
    taxAmount: invoice.tax_amount.toFixed(2),
    totalAmount: invoice.total_amount.toFixed(2),
    postedAt: invoice.posted_at.toISOString(),
    returnBlockedReason: hasMissingStockIssue
      ? "Some invoice items have no original stock movement. Ask an administrator to reconcile this invoice."
      : null,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      stockType: line.sku_stock_id ? "SKU" : "GENERAL_GRN",
      styleName: line.style_name,
      orderNo: line.order_no,
      articleNo: line.article_no,
      size: line.size,
      colour: line.colour ?? "",
      quantity: line.quantity,
      returnedQuantity: line.returned_quantity,
      returnableQuantity: returnableLineIds && !returnableLineIds.has(line.id)
        ? 0
        : line.quantity - line.returned_quantity,
      unitRate: line.unit_rate.toFixed(4),
      gstRate: line.gst_rate.toFixed(2),
      discountPercent: line.discount_percent.toFixed(2),
      taxableAmount: line.taxable_amount.toFixed(2),
      cgstAmount: line.cgst_amount.toFixed(2),
      sgstAmount: line.sgst_amount.toFixed(2),
      igstAmount: line.igst_amount.toFixed(2),
      totalAmount: line.total_amount.toFixed(2),
    })),
  };
}

export async function searchPosSalesReturnInvoices(input: {
  organizationId: string;
  search: string;
  take: number;
  cursor?: PosSalesReturnCursor | null;
}) {
  const search = input.search.trim();
  const invoices = await prisma.posSalesInvoice.findMany({
    where: {
      organization_id: input.organizationId,
      status: "POSTED",
      OR: [
        { invoice_no: { contains: search, mode: "insensitive" } },
        { customer: { contains: search, mode: "insensitive" } },
        {
          customer_contact: {
            is: { phone: { contains: search, mode: "insensitive" } },
          },
        },
      ],
      ...(input.cursor ? {
        AND: [{
          OR: [
            { posted_at: { lt: input.cursor.postedAt } },
            { posted_at: input.cursor.postedAt, id: { lt: input.cursor.id } },
          ],
        }],
      } : {}),
    },
    select: POS_RETURN_INVOICE_SELECT,
    orderBy: [{ posted_at: "desc" }, { id: "desc" }],
    take: input.take + 1,
  });
  const hasMore = invoices.length > input.take;
  const page = invoices.slice(0, input.take);
  return {
    invoices: page.map((invoice) => mapReturnInvoice(invoice)),
    nextCursor: hasMore
      ? encodePosSalesReturnCursor({
          id: page[page.length - 1].id,
          postedAt: page[page.length - 1].posted_at,
        })
      : null,
  };
}

export async function getPosSalesReturnInvoice(organizationId: string, invoiceNumber: string) {
  const invoice = await prisma.posSalesInvoice.findFirst({
    where: {
      organization_id: organizationId,
      invoice_no: invoiceNumber,
      status: "POSTED",
    },
    select: POS_RETURN_INVOICE_SELECT,
  });
  if (!invoice) return null;
  const issue = await prisma.fGMaterialIssue.findFirst({
    where: {
      organization_id: organizationId,
      pos_invoice_id: invoice.id,
      source_type: FGMaterialIssueSource.POS_INVOICE,
      movement: FGMaterialIssueMovement.ISSUE,
    },
    select: { lines: { select: { pos_invoice_line_id: true } } },
  });
  const returnableLineIds = new Set(
    issue?.lines.flatMap((line) => line.pos_invoice_line_id ? [line.pos_invoice_line_id] : []) ?? [],
  );
  return mapReturnInvoice(invoice, returnableLineIds);
}

export async function listPosSalesReturns(input: {
  organizationId: string;
  search: string;
  take: number;
  cursor?: PosSalesReturnCursor | null;
}) {
  const search = input.search.trim();
  const returns = await prisma.posSalesReturn.findMany({
    where: {
      organization_id: input.organizationId,
      ...(search ? {
        OR: [
          { return_no: { contains: search, mode: "insensitive" } },
          { invoice: { invoice_no: { contains: search, mode: "insensitive" } } },
          { invoice: { customer: { contains: search, mode: "insensitive" } } },
          {
            invoice: {
              customer_contact: {
                is: { phone: { contains: search, mode: "insensitive" } },
              },
            },
          },
        ],
      } : {}),
      ...(input.cursor ? {
        AND: [{
          OR: [
            { posted_at: { lt: input.cursor.postedAt } },
            { posted_at: input.cursor.postedAt, id: { lt: input.cursor.id } },
          ],
        }],
      } : {}),
    },
    select: {
      id: true,
      return_no: true,
      return_date: true,
      reason: true,
      status: true,
      subtotal: true,
      tax_amount: true,
      total_credit_amount: true,
      settlement_type: true,
      refund_method: true,
      refund_status: true,
      store_credit_balance_amount: true,
      posted_at: true,
      entity_name_snapshot: true,
      invoice: {
        select: {
          invoice_no: true,
          entity_name_snapshot: true,
          customer: true,
          customer_contact: { select: { phone: true } },
          entity: { select: { entity_name: true } },
        },
      },
      _count: { select: { lines: true } },
    },
    orderBy: [{ posted_at: "desc" }, { id: "desc" }],
    take: input.take + 1,
  });
  const hasMore = returns.length > input.take;
  const page = returns.slice(0, input.take);
  return {
    returns: page.map((record) => ({
      id: record.id,
      returnNumber: record.return_no,
      returnDate: record.return_date.toISOString().slice(0, 10),
      invoiceNumber: record.invoice.invoice_no,
      customer: record.invoice.customer ?? "",
      customerPhone: record.invoice.customer_contact?.phone ?? "",
      entityName: record.entity_name_snapshot
        ?? record.invoice.entity_name_snapshot
        ?? record.invoice.entity?.entity_name
        ?? "",
      reason: record.reason,
      status: record.status,
      lineCount: record._count.lines,
      subtotal: record.subtotal.toFixed(2),
      taxAmount: record.tax_amount.toFixed(2),
      totalCreditAmount: record.total_credit_amount.toFixed(2),
      settlementType: record.settlement_type,
      refundMethod: record.refund_method,
      refundStatus: record.refund_status,
      storeCreditBalanceAmount: record.store_credit_balance_amount?.toFixed(2) ?? null,
      postedAt: record.posted_at.toISOString(),
    })),
    nextCursor: hasMore
      ? encodePosSalesReturnCursor({
          id: page[page.length - 1].id,
          postedAt: page[page.length - 1].posted_at,
        })
      : null,
  };
}

export async function getPosSalesReturn(organizationId: string, returnNumber: string) {
  const record = await prisma.posSalesReturn.findFirst({
    where: { organization_id: organizationId, return_no: returnNumber },
    select: {
      id: true,
      return_no: true,
      return_date: true,
      reason: true,
      status: true,
      subtotal: true,
      cgst_amount: true,
      sgst_amount: true,
      igst_amount: true,
      tax_amount: true,
      total_credit_amount: true,
      settlement_type: true,
      refund_method: true,
      refund_status: true,
      refund_reference: true,
      refunded_by: true,
      refunded_at: true,
      store_credit_balance_amount: true,
      posted_at: true,
      created_by: true,
      entity_name_snapshot: true,
      invoice: {
        select: {
          invoice_no: true,
          invoice_date: true,
          entity_name_snapshot: true,
          customer: true,
          customer_contact: { select: { phone: true } },
          entity: { select: { entity_name: true } },
        },
      },
      lines: {
        select: {
          quantity: true,
          taxable_amount: true,
          cgst_amount: true,
          sgst_amount: true,
          igst_amount: true,
          total_amount: true,
          invoiceLine: {
            select: {
              style_name: true,
              order_no: true,
              article_no: true,
              size: true,
              colour: true,
              unit_rate: true,
              gst_rate: true,
            },
          },
        },
        orderBy: [{ id: "asc" }],
      },
    },
  });
  if (!record) return null;
  return {
    id: record.id,
    returnNumber: record.return_no,
    returnDate: record.return_date.toISOString().slice(0, 10),
    reason: record.reason,
    status: record.status,
    invoiceNumber: record.invoice.invoice_no,
    invoiceDate: record.invoice.invoice_date.toISOString().slice(0, 10),
    customer: record.invoice.customer ?? "",
    customerPhone: record.invoice.customer_contact?.phone ?? "",
    entityName: record.entity_name_snapshot
      ?? record.invoice.entity_name_snapshot
      ?? record.invoice.entity?.entity_name
      ?? "",
    subtotal: record.subtotal.toFixed(2),
    cgstAmount: record.cgst_amount.toFixed(2),
    sgstAmount: record.sgst_amount.toFixed(2),
    igstAmount: record.igst_amount.toFixed(2),
    taxAmount: record.tax_amount.toFixed(2),
    totalCreditAmount: record.total_credit_amount.toFixed(2),
    settlementType: record.settlement_type,
    refundMethod: record.refund_method,
    refundStatus: record.refund_status,
    refundReference: record.refund_reference,
    refundedBy: record.refunded_by,
    refundedAt: record.refunded_at?.toISOString() ?? null,
    storeCreditBalanceAmount: record.store_credit_balance_amount?.toFixed(2) ?? null,
    postedAt: record.posted_at.toISOString(),
    lines: record.lines.map((line) => ({
      styleName: line.invoiceLine.style_name,
      orderNo: line.invoiceLine.order_no,
      articleNo: line.invoiceLine.article_no,
      size: line.invoiceLine.size,
      colour: line.invoiceLine.colour ?? "",
      quantity: line.quantity,
      unitRate: line.invoiceLine.unit_rate.toFixed(4),
      gstRate: line.invoiceLine.gst_rate.toFixed(2),
      taxableAmount: line.taxable_amount.toFixed(2),
      cgstAmount: line.cgst_amount.toFixed(2),
      sgstAmount: line.sgst_amount.toFixed(2),
      igstAmount: line.igst_amount.toFixed(2),
      totalAmount: line.total_amount.toFixed(2),
    })),
  };
}

export async function listAvailablePosSalesReturnCredits(
  organizationId: string,
  customerContactId: string,
) {
  const credits = await prisma.posSalesReturn.findMany({
    where: {
      organization_id: organizationId,
      settlement_type: "STORE_CREDIT",
      store_credit_balance_amount: { gt: 0 },
      invoice: {
        is: {
          organization_id: organizationId,
          customer_contact_id: customerContactId,
        },
      },
    },
    select: {
      id: true,
      return_no: true,
      return_date: true,
      store_credit_balance_amount: true,
      invoice: { select: { invoice_no: true } },
    },
    orderBy: [{ return_date: "asc" }, { id: "asc" }],
    take: 50,
  });
  return credits.map((credit) => ({
    id: credit.id,
    returnNumber: credit.return_no,
    returnDate: credit.return_date.toISOString().slice(0, 10),
    invoiceNumber: credit.invoice.invoice_no,
    availableAmount: credit.store_credit_balance_amount?.toFixed(2) ?? "0.00",
  }));
}

export async function markPosSalesReturnRefunded(input: {
  organizationId: string;
  actorId: string;
  returnNumber: string;
  reference?: string | null;
}) {
  const reference = input.reference?.trim() || null;
  if (reference && reference.length > 100) {
    throw new PosSalesReturnError("Refund reference must be 100 characters or fewer.");
  }
  return prisma.$transaction(async (transaction) => {
    const record = await transaction.posSalesReturn.findFirst({
      where: { organization_id: input.organizationId, return_no: input.returnNumber },
      select: { id: true, refund_status: true, settlement_type: true, refund_method: true },
    });
    if (!record) throw new PosSalesReturnError("Sales return was not found.", 404);
    if (record.settlement_type !== "REFUND" || !record.refund_method) {
      throw new PosSalesReturnError("This sales return is not configured for a customer refund.", 409);
    }
    if (record.refund_status === "REFUNDED") {
      return { duplicate: true };
    }
    if (record.refund_status !== "PENDING") {
      throw new PosSalesReturnError("This refund is not awaiting settlement.", 409);
    }
    const now = new Date();
    const updated = await transaction.posSalesReturn.updateMany({
      where: {
        id: record.id,
        organization_id: input.organizationId,
        settlement_type: "REFUND",
        refund_status: "PENDING",
      },
      data: {
        refund_status: "REFUNDED",
        refund_reference: reference ? normalizeUppercase(reference) : null,
        refunded_by: input.actorId,
        refunded_at: now,
      },
    });
    if (updated.count !== 1) {
      throw new PosSalesReturnError("The refund status changed. Refresh and retry.", 409);
    }
    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "POS",
      action: "SETTLE_SALES_RETURN_REFUND",
      entityType: "pos_sales_return",
      entityId: record.id,
      details: {
        returnNumber: input.returnNumber,
        refundMethod: record.refund_method,
        refundReference: reference ? normalizeUppercase(reference) : null,
      },
    }, transaction);
    return { duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function money(value: Prisma.Decimal) {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function normalizeSelections(lines: PosReturnSelection[]) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    throw new PosSalesReturnError("Select between 1 and 100 invoice items to return.");
  }
  const normalized = lines.map((line) => {
    if (
      !line
      || typeof line.invoiceLineId !== "string"
      || line.invoiceLineId.length < 1
      || line.invoiceLineId.length > 100
      || !Number.isInteger(line.quantity)
      || line.quantity < 1
      || line.quantity > 1_000_000
    ) {
      throw new PosSalesReturnError("Each returned item must have a valid invoice line and positive whole quantity.");
    }
    return { invoiceLineId: line.invoiceLineId, quantity: line.quantity };
  });
  if (new Set(normalized.map((line) => line.invoiceLineId)).size !== normalized.length) {
    throw new PosSalesReturnError("An invoice item can only be selected once per sales return.");
  }
  return normalized.sort((a, b) => a.invoiceLineId.localeCompare(b.invoiceLineId));
}

function amountsForReturn(
  original: { taxable_amount: Prisma.Decimal; cgst_amount: Prisma.Decimal; sgst_amount: Prisma.Decimal; igst_amount: Prisma.Decimal },
  invoiceQuantity: number,
  previouslyReturnedQuantity: number,
  previouslyReturned: { taxable: Prisma.Decimal; cgst: Prisma.Decimal; sgst: Prisma.Decimal; igst: Prisma.Decimal },
  quantity: number,
) {
  const isFinalQuantity = previouslyReturnedQuantity + quantity === invoiceQuantity;
  const portion = (total: Prisma.Decimal, alreadyReturned: Prisma.Decimal) =>
    isFinalQuantity
      ? money(total.minus(alreadyReturned))
      : money(total.mul(quantity).div(invoiceQuantity));
  const taxable = portion(original.taxable_amount, previouslyReturned.taxable);
  const cgst = portion(original.cgst_amount, previouslyReturned.cgst);
  const sgst = portion(original.sgst_amount, previouslyReturned.sgst);
  const igst = portion(original.igst_amount, previouslyReturned.igst);
  return {
    taxable,
    cgst,
    sgst,
    igst,
    total: taxable.plus(cgst).plus(sgst).plus(igst),
  };
}

export async function createPosSalesReturn(input: {
  organizationId: string;
  actorId: string;
  invoiceNumber: string;
  requestKey: string;
  reason: string;
  settlementType: "STORE_CREDIT" | "REFUND";
  refundMethod?: "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER" | null;
  lines: PosReturnSelection[];
}) {
  const invoiceNumber = input.invoiceNumber.trim();
  const requestKey = input.requestKey.trim();
  const reason = normalizeUppercase(input.reason.trim());
  if (!invoiceNumber || invoiceNumber.length > 100) {
    throw new PosSalesReturnError("Select a valid POS invoice.");
  }
  if (!requestKey || requestKey.length > 100) {
    throw new PosSalesReturnError("A valid request key is required. Refresh and retry.");
  }
  if (!reason || reason.length > 1000) {
    throw new PosSalesReturnError("Enter a return reason with no more than 1,000 characters.");
  }
  const settlementType = input.settlementType;
  const refundMethod = input.refundMethod ?? null;
  if (settlementType !== "STORE_CREDIT" && settlementType !== "REFUND") {
    throw new PosSalesReturnError("Select store credit or a customer refund.");
  }
  if (settlementType === "REFUND") {
    if (!refundMethod || !["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"].includes(refundMethod)) {
      throw new PosSalesReturnError("Select a valid refund payment method.");
    }
  } else if (refundMethod) {
    throw new PosSalesReturnError("A refund payment method is only valid for a refund.");
  }
  const selections = normalizeSelections(input.lines);

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.posSalesReturn.findFirst({
      where: { organization_id: input.organizationId, request_key: requestKey },
      select: {
        id: true,
        return_no: true,
        reason: true,
        settlement_type: true,
        refund_method: true,
        invoice: { select: { invoice_no: true } },
        lines: { select: { invoice_line_id: true, quantity: true } },
      },
    });
    if (existing) {
      const existingLines = existing.lines
        .map((line) => ({ invoiceLineId: line.invoice_line_id, quantity: line.quantity }))
        .sort((a, b) => a.invoiceLineId.localeCompare(b.invoiceLineId));
      const sameRequest = existing.invoice.invoice_no === invoiceNumber
        && existing.reason === reason
        && existing.settlement_type === settlementType
        && existing.refund_method === refundMethod
        && existingLines.length === selections.length
        && existingLines.every((line, index) =>
          line.invoiceLineId === selections[index].invoiceLineId
          && line.quantity === selections[index].quantity,
        );
      if (!sameRequest) {
        throw new PosSalesReturnError("This request key was already used for a different return. Refresh and retry.", 409);
      }
      return { id: existing.id, returnNumber: existing.return_no, duplicate: true };
    }

    const invoice = await transaction.posSalesInvoice.findFirst({
      where: {
        organization_id: input.organizationId,
        invoice_no: invoiceNumber,
        status: "POSTED",
      },
      select: POS_RETURN_INVOICE_SELECT,
    });
    if (!invoice) throw new PosSalesReturnError("A posted POS invoice with that number was not found.", 404);
    if (settlementType === "STORE_CREDIT" && !invoice.customer_contact_id) {
      throw new PosSalesReturnError("Store credit requires a registered customer.");
    }

    const invoiceLines = new Map(invoice.lines.map((line) => [line.id, line]));
    const selectedLines = selections.map((selection) => {
      const invoiceLine = invoiceLines.get(selection.invoiceLineId);
      if (!invoiceLine) {
        throw new PosSalesReturnError("One or more selected items do not belong to this invoice.");
      }
      if (selection.quantity > invoiceLine.quantity - invoiceLine.returned_quantity) {
        throw new PosSalesReturnError(
          `${invoiceLine.style_name} has only ${invoiceLine.quantity - invoiceLine.returned_quantity} unit(s) remaining to return.`,
          409,
        );
      }
      return { ...selection, invoiceLine };
    });

    const originalIssue = await transaction.fGMaterialIssue.findFirst({
      where: {
        organization_id: input.organizationId,
        pos_invoice_id: invoice.id,
        source_type: FGMaterialIssueSource.POS_INVOICE,
        movement: FGMaterialIssueMovement.ISSUE,
      },
      select: {
        id: true,
        lines: {
          select: {
            id: true,
            pos_invoice_line_id: true,
            stock_type: true,
            sku_stock_id: true,
            general_receipt_id: true,
            item_code: true,
            style_name: true,
            article_no: true,
            size: true,
            colour: true,
            quantity: true,
          },
        },
      },
    });
    if (!originalIssue) {
      throw new PosSalesReturnError(
        "This invoice has no matching finished-goods issue record. Ask an administrator to reconcile its stock before returning it.",
        409,
      );
    }
    const originalIssueLineByInvoiceLineId = new Map(
      originalIssue.lines.flatMap((line) =>
        line.pos_invoice_line_id ? [[line.pos_invoice_line_id, line] as const] : [],
      ),
    );
    for (const selected of selectedLines) {
      const issueLine = originalIssueLineByInvoiceLineId.get(selected.invoiceLine.id);
      const expectedStockType = selected.invoiceLine.sku_stock_id
        ? FGMaterialIssueStockType.SKU
        : FGMaterialIssueStockType.GENERAL;
      if (
        !issueLine
        || issueLine.stock_type !== expectedStockType
        || !new Prisma.Decimal(issueLine.quantity).eq(selected.invoiceLine.quantity)
      ) {
        throw new PosSalesReturnError(
          `${selected.invoiceLine.style_name} has no matching original stock movement. Ask an administrator to reconcile the invoice.`,
          409,
        );
      }
    }

    const previouslyReturnedLines = await transaction.posSalesReturnLine.findMany({
      where: {
        organization_id: input.organizationId,
        invoice_id: invoice.id,
        invoice_line_id: { in: selections.map((line) => line.invoiceLineId) },
        salesReturn: { status: "POSTED" },
      },
      select: {
        invoice_line_id: true,
        quantity: true,
        taxable_amount: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
      },
    });
    const returnedAmountsByLineId = new Map<string, {
      quantity: number;
      taxable: Prisma.Decimal;
      cgst: Prisma.Decimal;
      sgst: Prisma.Decimal;
      igst: Prisma.Decimal;
    }>();
    for (const line of previouslyReturnedLines) {
      const current = returnedAmountsByLineId.get(line.invoice_line_id) ?? {
        quantity: 0,
        taxable: new Prisma.Decimal(0),
        cgst: new Prisma.Decimal(0),
        sgst: new Prisma.Decimal(0),
        igst: new Prisma.Decimal(0),
      };
      current.quantity += line.quantity;
      current.taxable = current.taxable.plus(line.taxable_amount);
      current.cgst = current.cgst.plus(line.cgst_amount);
      current.sgst = current.sgst.plus(line.sgst_amount);
      current.igst = current.igst.plus(line.igst_amount);
      returnedAmountsByLineId.set(line.invoice_line_id, current);
    }

    for (const selected of selectedLines) {
      const updated = await transaction.posSalesInvoiceLine.updateMany({
        where: {
          id: selected.invoiceLineId,
          organization_id: input.organizationId,
          invoice_id: invoice.id,
          returned_quantity: { lte: selected.invoiceLine.quantity - selected.quantity },
        },
        data: { returned_quantity: { increment: selected.quantity } },
      });
      if (updated.count !== 1) {
        throw new PosSalesReturnError(
          `${selected.invoiceLine.style_name} was returned by another user. Refresh the invoice and try again.`,
          409,
        );
      }
    }

    const skuIds = selectedLines.flatMap(({ invoiceLine }) =>
      invoiceLine.sku_stock_id ? [invoiceLine.sku_stock_id] : [],
    );
    const receiptIds = selectedLines.flatMap(({ invoiceLine }) =>
      invoiceLine.general_stock_receipt_id ? [invoiceLine.general_stock_receipt_id] : [],
    );
    const [skuStocks, generalReceipts] = await Promise.all([
      transaction.finishedGoodsSkuStock.findMany({
        where: { organization_id: input.organizationId, id: { in: skuIds } },
        select: { id: true, current_stock: true, qty_out: true },
      }),
      transaction.finishedGoodsGeneralStockReceipt.findMany({
        where: { organization_id: input.organizationId, id: { in: receiptIds } },
        select: {
          id: true,
          entity_id: true,
          location_id: true,
          style_name: true,
          size: true,
          current_stock: true,
          quantity_out: true,
        },
      }),
    ]);
    const skuById = new Map(skuStocks.map((stock) => [stock.id, stock]));
    const receiptById = new Map(generalReceipts.map((stock) => [stock.id, stock]));
    const returnAmountsByLineId = new Map<string, ReturnType<typeof amountsForReturn>>();
    const totals = {
      subtotal: new Prisma.Decimal(0),
      cgst: new Prisma.Decimal(0),
      sgst: new Prisma.Decimal(0),
      igst: new Prisma.Decimal(0),
    };
    for (const selected of selectedLines) {
      const prior = returnedAmountsByLineId.get(selected.invoiceLineId) ?? {
        quantity: 0,
        taxable: new Prisma.Decimal(0),
        cgst: new Prisma.Decimal(0),
        sgst: new Prisma.Decimal(0),
        igst: new Prisma.Decimal(0),
      };
      const amounts = amountsForReturn(
        selected.invoiceLine,
        selected.invoiceLine.quantity,
        prior.quantity,
        prior,
        selected.quantity,
      );
      returnAmountsByLineId.set(selected.invoiceLineId, amounts);
      totals.subtotal = totals.subtotal.plus(amounts.taxable);
      totals.cgst = totals.cgst.plus(amounts.cgst);
      totals.sgst = totals.sgst.plus(amounts.sgst);
      totals.igst = totals.igst.plus(amounts.igst);

      const stockId = selected.invoiceLine.sku_stock_id ?? selected.invoiceLine.general_stock_receipt_id;
      if (!stockId) {
        throw new PosSalesReturnError(`${selected.invoiceLine.style_name} has no linked stock record.`, 409);
      }
      if (selected.invoiceLine.sku_stock_id) {
        if (!skuById.has(stockId)) {
          throw new PosSalesReturnError(`${selected.invoiceLine.style_name} stock is unavailable for return.`, 409);
        }
      } else if (!receiptById.has(stockId)) {
        throw new PosSalesReturnError(`${selected.invoiceLine.style_name} stock receipt is unavailable for return.`, 409);
      }
    }

    const totalCreditAmount = totals.subtotal.plus(totals.cgst).plus(totals.sgst).plus(totals.igst);
    const returnNumber = await reserveProcurementDocumentNumber(
      input.organizationId,
      "POS_SALES_RETURN",
      transaction,
    );
    const salesReturn = await transaction.posSalesReturn.create({
      data: {
        organization_id: input.organizationId,
        invoice_id: invoice.id,
        entity_name_snapshot: invoice.entity_name_snapshot ?? invoice.entity?.entity_name ?? null,
        return_no: returnNumber,
        request_key: requestKey,
        reason,
        status: "POSTED",
        subtotal: totals.subtotal,
        cgst_amount: totals.cgst,
        sgst_amount: totals.sgst,
        igst_amount: totals.igst,
        tax_amount: totals.cgst.plus(totals.sgst).plus(totals.igst),
        total_credit_amount: totalCreditAmount,
        settlement_type: settlementType,
        refund_method: refundMethod,
        refund_status: settlementType === "REFUND" ? "PENDING" : null,
        store_credit_balance_amount: settlementType === "STORE_CREDIT" ? totalCreditAmount : new Prisma.Decimal(0),
        created_by: input.actorId,
      },
      select: { id: true },
    });

    const stockBeforeByInvoiceLineId = new Map<string, Prisma.Decimal>();
    for (const selected of selectedLines) {
      const invoiceLine = selected.invoiceLine;
      const stockId = invoiceLine.sku_stock_id ?? invoiceLine.general_stock_receipt_id;
      if (!stockId) throw new PosSalesReturnError("A returned invoice line has no stock reference.", 409);
      if (invoiceLine.sku_stock_id) {
        const stock = skuById.get(stockId);
        if (!stock) throw new PosSalesReturnError("Returned SKU stock is unavailable.", 409);
        const updated = await transaction.finishedGoodsSkuStock.updateMany({
          where: {
            id: stock.id,
            organization_id: input.organizationId,
            qty_out: { gte: selected.quantity },
          },
          data: {
            current_stock: { increment: selected.quantity },
            qty_out: { decrement: selected.quantity },
          },
        });
        if (updated.count !== 1) {
          throw new PosSalesReturnError("SKU issue balance changed. Refresh and try again.", 409);
        }
        stockBeforeByInvoiceLineId.set(invoiceLine.id, new Prisma.Decimal(stock.current_stock));
      } else {
        const receipt = receiptById.get(stockId);
        if (!receipt) throw new PosSalesReturnError("Returned stock receipt is unavailable.", 409);
        const updated = await transaction.finishedGoodsGeneralStockReceipt.updateMany({
          where: {
            id: receipt.id,
            organization_id: input.organizationId,
            quantity_out: { gte: selected.quantity },
          },
          data: {
            current_stock: { increment: selected.quantity },
            quantity_out: { decrement: selected.quantity },
          },
        });
        if (updated.count !== 1) {
          throw new PosSalesReturnError("Finished-goods issue balance changed. Refresh and try again.", 409);
        }
        const summaryUpdated = await transaction.finishedGoodsStock.updateMany({
          where: {
            organization_id: input.organizationId,
            location_id: receipt.location_id,
            style_name: receipt.style_name,
            size: receipt.size,
            quantity_issued: { gte: selected.quantity },
          },
          data: {
            quantity_on_hand: { increment: selected.quantity },
            quantity_issued: { decrement: selected.quantity },
          },
        });
        if (summaryUpdated.count !== 1) {
          throw new PosSalesReturnError("Finished-goods summary does not match the return receipt.", 409);
        }
        stockBeforeByInvoiceLineId.set(invoiceLine.id, new Prisma.Decimal(receipt.current_stock));
      }
    }

    const issue = await createFgMaterialIssue(transaction, {
      organizationId: input.organizationId,
      sourceType: FGMaterialIssueSource.POS_INVOICE,
      movement: FGMaterialIssueMovement.REVERSAL,
      posInvoiceId: invoice.id,
      reversalOfId: originalIssue.id,
      idempotencyKey: `pos-sales-return:${salesReturn.id}:reversal`,
      sourceReference: returnNumber,
      issuedBy: input.actorId,
      reason,
      lines: selectedLines.map(({ invoiceLine, quantity }) => {
        const originalIssueLine = originalIssueLineByInvoiceLineId.get(invoiceLine.id);
        const stockBefore = stockBeforeByInvoiceLineId.get(invoiceLine.id);
        if (!originalIssueLine || !stockBefore) {
          throw new PosSalesReturnError("The original finished-goods issue could not be matched to the return.", 409);
        }
        return {
          stockType: originalIssueLine.stock_type,
          skuStockId: originalIssueLine.sku_stock_id,
          generalReceiptId: originalIssueLine.general_receipt_id,
          posInvoiceLineId: invoiceLine.id,
          reversalOfLineId: originalIssueLine.id,
          itemCode: originalIssueLine.item_code,
          styleName: originalIssueLine.style_name,
          articleNo: originalIssueLine.article_no,
          size: originalIssueLine.size,
          colour: originalIssueLine.colour,
          quantity: new Prisma.Decimal(quantity),
          uomCode: "PCS",
          stockBefore,
          stockAfter: stockBefore.plus(quantity),
        };
      }),
    });
    const reversalLines = await transaction.fGMaterialIssueLine.findMany({
      where: { organization_id: input.organizationId, issue_id: issue.id },
      select: { id: true, reversal_of_line_id: true },
    });
    const reversalLineByOriginalId = new Map(
      reversalLines.flatMap((line) =>
        line.reversal_of_line_id ? [[line.reversal_of_line_id, line.id] as const] : [],
      ),
    );
    await transaction.posSalesReturnLine.createMany({
      data: selectedLines.map(({ invoiceLine, quantity }) => {
        const originalIssueLine = originalIssueLineByInvoiceLineId.get(invoiceLine.id);
        const stockIssueLineId = originalIssueLine
          ? reversalLineByOriginalId.get(originalIssueLine.id)
          : null;
        const amounts = returnAmountsByLineId.get(invoiceLine.id);
        if (!stockIssueLineId || !amounts) {
          throw new PosSalesReturnError("A return line could not be linked to its stock reversal.", 409);
        }
        return {
          organization_id: input.organizationId,
          return_id: salesReturn.id,
          invoice_id: invoice.id,
          invoice_line_id: invoiceLine.id,
          stock_issue_line_id: stockIssueLineId,
          quantity,
          taxable_amount: amounts.taxable,
          cgst_amount: amounts.cgst,
          sgst_amount: amounts.sgst,
          igst_amount: amounts.igst,
          total_amount: amounts.total,
        };
      }),
    });

    await createAuditEvent({
      organizationId: input.organizationId,
      userId: input.actorId,
      module: "POS",
      action: "POST_SALES_RETURN",
      entityType: "pos_sales_return",
      entityId: salesReturn.id,
      details: {
        returnNumber,
        invoiceNumber: invoice.invoice_no,
        lineCount: selectedLines.length,
        totalCreditAmount: totalCreditAmount.toFixed(2),
        settlementType,
        refundMethod,
        stockReversalIssueNumber: issue.issue_no,
      },
    }, transaction);

    return { id: salesReturn.id, returnNumber, duplicate: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
