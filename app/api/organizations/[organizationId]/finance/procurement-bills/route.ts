import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";
import {
  createProcurementVendorBill,
  listProcurementVendorBills,
} from "@/lib/services/finance/procurement-vendor-bill-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBillDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Bill date must use YYYY-MM-DD.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Bill date is invalid.");
  }
  return date;
}

function parseLines(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1000) {
    throw new Error("Provide between 1 and 1,000 bill lines.");
  }
  return value.map((line) => {
    if (!isRecord(line)
      || typeof line.purchaseOrderLineId !== "string"
      || line.purchaseOrderLineId.length > 100
      || typeof line.inventoryReceiptLineId !== "string"
      || line.inventoryReceiptLineId.length > 100
      || typeof line.quantity !== "string"
      || line.quantity.length > 40) {
      throw new Error("A bill line has invalid source identifiers or quantity.");
    }
    return {
      purchaseOrderLineId: line.purchaseOrderLineId,
      inventoryReceiptLineId: line.inventoryReceiptLineId,
      quantity: String(line.quantity),
    };
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
    return NextResponse.json({ bills: await listProcurementVendorBills(organization.id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Procurement vendor bill list failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load procurement vendor bills." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: "A vendor bill request is required." }, { status: 400 });
    const input = {
      purchaseOrderId: typeof body.purchaseOrderId === "string" ? body.purchaseOrderId.trim() : "",
      vendorInvoiceNumber: typeof body.vendorInvoiceNumber === "string" ? body.vendorInvoiceNumber : "",
      billDate: parseBillDate(body.billDate),
      lines: parseLines(body.lines),
    };
    const bill = await createProcurementVendorBill(organization.id, user.id, input);
    return NextResponse.json({ bill }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.name === "Error") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Procurement vendor bill creation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to create procurement vendor bill." }, { status: 500 });
  }
}
