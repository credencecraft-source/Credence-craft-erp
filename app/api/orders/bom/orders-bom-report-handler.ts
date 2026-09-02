import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listBomItemsForOrganization } from "@/lib/services/orders/order-service";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    const bomItems = await listBomItemsForOrganization(organization.id);
    return NextResponse.json({ bomItems });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch BOM report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
