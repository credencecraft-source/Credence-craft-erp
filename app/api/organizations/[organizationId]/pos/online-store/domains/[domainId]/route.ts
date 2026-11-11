import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import {
  deleteOrganizationOnlineStoreDomain,
  OnlineStoreDomainError,
  setOrganizationOnlineStorePrimaryDomain,
} from "@/lib/services/pos/public-online-store-service";

const MANAGEMENT_ROLES = ["OWNER", "ADMIN"];

async function getAuthorizedOrganization(
  context: { params: Promise<{ organizationId: string }> },
) {
  const user = await requireSessionUser();
  const { organizationId } = await context.params;
  const organization = await requireOrganizationContext(user.id, organizationId, MANAGEMENT_ROLES);
  await requireOrganizationPermission(user.id, organization.id, "MANAGE_POS_ONLINE_STORE");
  return { organization, user };
}

function errorResponse(error: unknown) {
  if (error instanceof OnlineStoreDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  }
  if (error instanceof Error && error.message === "Authentication required.") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  return NextResponse.json({ error: "Unable to update this custom domain." }, { status: 500 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; domainId: string }> },
) {
  try {
    const [{ organization, user }, { domainId }] = await Promise.all([
      getAuthorizedOrganization(context),
      context.params,
    ]);
    const body = await request.json().catch(() => null) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Enter a valid domain action." }, { status: 400 });
    }
    if ((body as Record<string, unknown>).action === "make-primary") {
      const domain = await setOrganizationOnlineStorePrimaryDomain({
        organization,
        actorId: user.id,
        domainId,
      });
      return NextResponse.json({ domain });
    }
    return NextResponse.json({ error: "Choose a valid domain action." }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ organizationId: string; domainId: string }> },
) {
  try {
    const [{ organization, user }, { domainId }] = await Promise.all([
      getAuthorizedOrganization(context),
      context.params,
    ]);
    await deleteOrganizationOnlineStoreDomain({ organization, actorId: user.id, domainId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
