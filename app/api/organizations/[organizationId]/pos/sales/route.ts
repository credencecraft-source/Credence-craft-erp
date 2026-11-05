import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { createPosGeneralStockSale } from "@/lib/services/pos/pos-general-stock-sale-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function encodeInvoiceCursor(invoice: { id: string; posted_at: Date }) {
  return Buffer.from(JSON.stringify({
    id: invoice.id,
    postedAt: invoice.posted_at.toISOString(),
  })).toString("base64url");
}

function parseInvoiceCursor(value: string) {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      id?: unknown;
      postedAt?: unknown;
    };
    if (
      typeof parsed.id !== "string" ||
      parsed.id.length === 0 ||
      parsed.id.length > 100 ||
      typeof parsed.postedAt !== "string"
    ) {
      return null;
    }
    const postedAt = new Date(parsed.postedAt);
    if (Number.isNaN(postedAt.getTime()) || postedAt.toISOString() !== parsed.postedAt) {
      return null;
    }
    return { id: parsed.id, postedAt };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    const searchParams = new URL(request.url).searchParams;
    const invoiceNumber = searchParams.get("invoiceNumber")?.trim();
    if (invoiceNumber) {
      const [invoice, issuer] = await Promise.all([
        prisma.posSalesInvoice.findFirst({
          where: { organization_id: organization.id, invoice_no: invoiceNumber },
          include: { lines: true },
        }),
        prisma.organization.findFirst({
          where: { id: organization.id },
          select: {
            organization_name: true,
            gst_number: true,
            address_line_1: true,
            address_line_2: true,
            city: true,
            state: true,
            pin_code: true,
          },
        }),
      ]);
      if (!invoice) {
        return NextResponse.json({ error: "POS invoice was not found." }, { status: 404 });
      }
      if (!issuer) {
        return NextResponse.json({ error: "POS invoice issuer details are unavailable." }, { status: 500 });
      }
      return NextResponse.json({
        invoices: [{
          invoiceNumber: invoice.invoice_no,
          invoiceDate: invoice.invoice_date.toISOString().slice(0, 10),
          customer: invoice.customer ?? "",
          status: invoice.status,
          issuer: {
            name: issuer.organization_name,
            gstNumber: issuer.gst_number,
            address: [issuer.address_line_1, issuer.address_line_2, issuer.city, issuer.state, issuer.pin_code]
              .filter(Boolean)
              .join(", "),
          },
          lines: invoice.lines.map((line) => ({
            record: {
              id: line.sku_stock_id ?? line.general_stock_receipt_id ?? "",
              stock_type: line.sku_stock_id ? "SKU" : "GENERAL_GRN",
              style_name: line.style_name,
              order_no: line.order_no,
              article_no: line.article_no,
              size: line.size,
              colour: line.colour,
              hsn_code: line.hsn_code,
            },
            quantity: Number(line.quantity),
            rate: Number(line.unit_rate),
            gstRate: Number(line.gst_rate),
            discountPercent: Number(line.discount_percent),
            amount: Number(line.taxable_amount),
            taxAmount: Number(line.cgst_amount) + Number(line.sgst_amount) + Number(line.igst_amount),
            totalAmount: Number(line.total_amount),
          })),
          subtotal: Number(invoice.subtotal),
          cgstAmount: Number(invoice.cgst_amount),
          sgstAmount: Number(invoice.sgst_amount),
          igstAmount: Number(invoice.igst_amount),
          taxRate: Number(invoice.subtotal) > 0 ? Number(invoice.tax_amount) / Number(invoice.subtotal) * 100 : 0,
          taxAmount: Number(invoice.tax_amount),
          grandTotal: Number(invoice.total_amount),
          savedAt: invoice.posted_at.toISOString(),
        }],
      });
    }

    const search = searchParams.get("search")?.trim() ?? "";
    if (search.length > 100) {
      return NextResponse.json({ error: "Invoice search must contain 100 characters or fewer." }, { status: 400 });
    }
    const rawLimit = searchParams.get("limit");
    const limit = rawLimit === null ? DEFAULT_PAGE_SIZE : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawCursor = searchParams.get("cursor");
    const cursor = rawCursor ? parseInvoiceCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: "Invalid invoice pagination cursor." }, { status: 400 });
    }

    const invoices = await prisma.posSalesInvoice.findMany({
      where: {
        organization_id: organization.id,
        ...(search ? {
          OR: [
            { invoice_no: { contains: search, mode: "insensitive" as const } },
            { customer: { contains: search, mode: "insensitive" as const } },
          ],
        } : {}),
        ...(cursor ? {
          AND: [{
            OR: [
              { posted_at: { lt: cursor.postedAt } },
              { posted_at: cursor.postedAt, id: { lt: cursor.id } },
            ],
          }],
        } : {}),
      },
      select: {
        id: true,
        invoice_no: true,
        invoice_date: true,
        customer: true,
        subtotal: true,
        cgst_amount: true,
        sgst_amount: true,
        igst_amount: true,
        tax_amount: true,
        total_amount: true,
        posted_at: true,
      },
      orderBy: [{ posted_at: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = invoices.length > limit;
    const pageInvoices = invoices.slice(0, limit);
    return NextResponse.json({
      invoices: pageInvoices.map((invoice) => ({
        invoiceNumber: invoice.invoice_no,
        invoiceDate: invoice.invoice_date.toISOString().slice(0, 10),
        customer: invoice.customer ?? "",
        lines: [],
        subtotal: Number(invoice.subtotal),
        cgstAmount: Number(invoice.cgst_amount),
        sgstAmount: Number(invoice.sgst_amount),
        igstAmount: Number(invoice.igst_amount),
        taxRate: Number(invoice.subtotal) > 0 ? Number(invoice.tax_amount) / Number(invoice.subtotal) * 100 : 0,
        taxAmount: Number(invoice.tax_amount),
        grandTotal: Number(invoice.total_amount),
        savedAt: invoice.posted_at.toISOString(),
      })),
      nextCursor: hasMore
        ? encodeInvoiceCursor(pageInvoices[pageInvoices.length - 1])
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load POS invoices." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    const body = await request.json() as Record<string, unknown>;
    if (!Array.isArray(body.lines)) {
      return NextResponse.json({ error: "Invoice lines are required." }, { status: 400 });
    }
    const lines = body.lines.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Each invoice line must be a valid object.");
      }
      const line = value as Record<string, unknown>;
      if (line.stockType !== undefined && line.stockType !== "SKU" && line.stockType !== "GENERAL_GRN") {
        throw new Error("Every invoice item must reference a supported General stock type.");
      }
      const stockType: "SKU" | "GENERAL_GRN" = line.stockType === "SKU" ? "SKU" : "GENERAL_GRN";
      return {
        stockId: typeof line.stockId === "string" ? line.stockId : "",
        stockType,
        quantity: String(line.quantity ?? ""),
        rate: String(line.rate ?? ""),
        gstRate: String(line.gstRate ?? ""),
        discountPercent: String(line.discountPercent ?? ""),
        hsnCode: typeof line.hsnCode === "string" ? line.hsnCode : null,
      };
    });
    const taxMode = body.taxMode === "INTERSTATE" ? "INTERSTATE" : body.taxMode === "LOCAL" ? "LOCAL" : null;
    if (!taxMode) return NextResponse.json({ error: "Select a valid tax mode." }, { status: 400 });
    if (body.customerContactId !== undefined && body.customerContactId !== null
      && typeof body.customerContactId !== "string") {
      return NextResponse.json({ error: "Select a valid customer contact." }, { status: 400 });
    }

    const invoice = await createPosGeneralStockSale({
      organizationId: organization.id,
      actorId: user.id,
      requestKey: typeof body.requestKey === "string" ? body.requestKey : "",
      invoiceDate: String(body.invoiceDate ?? ""),
      customer: typeof body.customer === "string" ? body.customer : null,
      customerContactId: typeof body.customerContactId === "string" ? body.customerContactId : null,
      taxMode,
      lines,
    });
    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to post POS sale." },
      { status: 400 },
    );
  }
}
