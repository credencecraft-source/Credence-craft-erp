import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listBomItemsPage } from "@/lib/services/orders/order-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });
    }

    const organization = await requireOrganizationContext(user.id, organizationId);
    const searchParams = new URL(request.url).searchParams;
    const limit = Number(searchParams.get("limit") || 100);

    const page = await listBomItemsPage(organization.id, {
      cursor: searchParams.get("cursor") || undefined,
      limit: Number.isFinite(limit) ? limit : 100,
    });
    return NextResponse.json(page);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch BOM report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}