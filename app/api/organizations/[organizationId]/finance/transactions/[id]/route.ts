import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";
import { getCentralFinanceTransaction } from "@/lib/services/finance/central-finance-query-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; id: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, id } = await context.params;
    const organization = await requireFinanceOrganizationAccess(user.id, organizationId);
    if (!id || id.length > 100) {
      return NextResponse.json({ error: "Select a valid finance transaction." }, { status: 400 });
    }
    const transaction = await getCentralFinanceTransaction(organization.id, id);
    if (!transaction) {
      return NextResponse.json({ error: "Finance transaction was not found." }, { status: 404 });
    }
    return NextResponse.json({ transaction });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("Finance transaction detail request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load finance transaction." }, { status: 500 });
  }
}
