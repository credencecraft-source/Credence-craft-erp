import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { createPosGeneralStockSale } from "@/lib/services/pos/pos-general-stock-sale-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "FINANCE", "INVENTORY"]);
    const invoices = await prisma.posSalesInvoice.findMany({
      where: { organization_id: organization.id },
      include: { lines: true },
      orderBy: [{ posted_at: "desc" }, { id: "desc" }],
    });
    return NextResponse.json({
      invoices: invoices.map((invoice) => ({
        invoiceNumber: invoice.invoice_no,
        invoiceDate: invoice.invoice_date.toISOString().slice(0, 10),
        customer: invoice.customer ?? "",
        lines: invoice.lines.map((line) => ({
          record: {
            id: line.general_stock_receipt_id,
            style_name: line.style_name,
            order_no: line.order_no,
            article_no: line.article_no,
            size: line.size,
            colour: line.colour,
            hsn_code: line.hsn_code,
          },
          quantity: line.quantity,
          rate: Number(line.unit_rate),
          gstRate: Number(line.gst_rate),
          discountPercent: Number(line.discount_percent),
          amount: Number(line.taxable_amount),
        })),
        subtotal: Number(invoice.subtotal),
        taxRate: Number(invoice.subtotal) > 0 ? Number(invoice.tax_amount) / Number(invoice.subtotal) * 100 : 0,
        taxAmount: Number(invoice.tax_amount),
        grandTotal: Number(invoice.total_amount),
        savedAt: invoice.posted_at.toISOString(),
      })),
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
      return {
        stockId: typeof line.stockId === "string" ? line.stockId : "",
        quantity: String(line.quantity ?? ""),
        rate: String(line.rate ?? ""),
        gstRate: String(line.gstRate ?? ""),
        discountPercent: String(line.discountPercent ?? ""),
        hsnCode: typeof line.hsnCode === "string" ? line.hsnCode : null,
      };
    });
    const taxMode = body.taxMode === "INTERSTATE" ? "INTERSTATE" : body.taxMode === "LOCAL" ? "LOCAL" : null;
    if (!taxMode) return NextResponse.json({ error: "Select a valid tax mode." }, { status: 400 });

    const invoice = await createPosGeneralStockSale({
      organizationId: organization.id,
      actorId: user.id,
      requestKey: typeof body.requestKey === "string" ? body.requestKey : "",
      invoiceDate: String(body.invoiceDate ?? ""),
      customer: typeof body.customer === "string" ? body.customer : null,
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
