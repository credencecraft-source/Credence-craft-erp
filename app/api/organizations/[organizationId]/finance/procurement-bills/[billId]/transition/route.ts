import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";
import { transitionProcurementVendorBill } from "@/lib/services/finance/procurement-vendor-bill-service";

const BILL_ACTIONS = ["SUBMIT", "APPROVE", "POST", "CANCEL"] as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; billId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, billId } = await context.params;
    const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
    const body: unknown = await request.json();
    if (
      typeof body !== "object"
      || body === null
      || Array.isArray(body)
      || !("action" in body)
      || typeof body.action !== "string"
      || !BILL_ACTIONS.includes(body.action as (typeof BILL_ACTIONS)[number])
    ) {
      return NextResponse.json({ error: "Select a valid vendor bill action." }, { status: 400 });
    }
    const bill = await transitionProcurementVendorBill(
      organization.id,
      user.id,
      billId,
      body.action as (typeof BILL_ACTIONS)[number],
    );
    return NextResponse.json({ bill }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.name === "Error") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Procurement vendor bill transition failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to update procurement vendor bill." }, { status: 500 });
  }
}
