import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import {
  OnlineStoreDomainError,
  verifyOrganizationOnlineStoreDomain,
} from "@/lib/services/pos/public-online-store-service";

const MANAGEMENT_ROLES = ["OWNER", "ADMIN"];

export async function POST(
  _request: Request,
  context: { params: Promise<{ organizationId: string; domainId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, domainId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId, MANAGEMENT_ROLES);
    const domain = await verifyOrganizationOnlineStoreDomain({
      organization,
      actorId: user.id,
      domainId,
    });
    return NextResponse.json({ domain });
  } catch (error) {
    if (error instanceof OnlineStoreDomainError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "Authentication required.") {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to verify this custom domain." }, { status: 500 });
  }
}
