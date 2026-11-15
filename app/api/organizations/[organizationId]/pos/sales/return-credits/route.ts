import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { listAvailablePosSalesReturnCredits } from "@/lib/services/pos/pos-sales-return-service";

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
    const customerContactId = new URL(request.url).searchParams.get("customerContactId")?.trim() ?? "";
    if (!customerContactId || customerContactId.length > 100) {
      return NextResponse.json({ error: "Select a valid customer to load available return credits." }, { status: 400 });
    }
    const credits = await listAvailablePosSalesReturnCredits(organization.id, customerContactId);
    return NextResponse.json({ credits });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load sales-return credits." }, { status: 500 });
  }
}
