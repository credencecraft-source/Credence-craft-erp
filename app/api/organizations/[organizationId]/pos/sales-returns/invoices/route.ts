import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getPosSalesReturnInvoice,
  parsePosSalesReturnCursor,
  PosSalesReturnError,
  searchPosSalesReturnInvoices,
} from "@/lib/services/pos/pos-sales-return-service";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

const MAX_PAGE_SIZE = 50;

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
    );
    await requireOrganizationPermission(user.id, organization.id, "VIEW_POS_SALES_RETURNS");
    const params = new URL(request.url).searchParams;
    const invoiceNumber = params.get("invoiceNumber")?.trim();
    if (invoiceNumber) {
      if (invoiceNumber.length > 100) {
        return NextResponse.json({ error: "Invoice number must contain 100 characters or fewer." }, { status: 400 });
      }
      const invoice = await getPosSalesReturnInvoice(organization.id, invoiceNumber);
      if (!invoice) return NextResponse.json({ error: "Posted POS invoice was not found." }, { status: 404 });
      return NextResponse.json({ invoice });
    }

    const search = params.get("search")?.trim() ?? "";
    if (search.length < 2 || search.length > 100) {
      return NextResponse.json({ error: "Search with 2 to 100 characters using an invoice number, customer, or mobile." }, { status: 400 });
    }
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? 25 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return NextResponse.json({ error: `Page size must be between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }
    const rawCursor = params.get("cursor");
    const cursor = rawCursor ? parsePosSalesReturnCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: "Invalid invoice search cursor." }, { status: 400 });
    }
    const result = await searchPosSalesReturnInvoices({
      organizationId: organization.id,
      search,
      take: limit,
      cursor,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PosSalesReturnError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to search POS invoices for returns." }, { status: 500 });
  }
}
