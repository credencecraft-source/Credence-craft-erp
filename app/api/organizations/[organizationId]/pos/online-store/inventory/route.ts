import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import {
  listOrganizationOnlineStoreInventory,
  OnlineStoreInventoryError,
  setOnlineStoreLocationEnabled,
} from "@/lib/services/pos/online-store-inventory-service";

const MANAGEMENT_ROLES = ["OWNER", "ADMIN"];

async function getAuthorizedOrganization(
  context: { params: Promise<{ organizationId: string }> },
  permission: "VIEW_POS_ONLINE_STORE" | "MANAGE_POS_ONLINE_STORE",
) {
  const user = await requireSessionUser();
  const { organizationId } = await context.params;
  const organization = await requireOrganizationContext(user.id, organizationId, MANAGEMENT_ROLES);
  await requireOrganizationPermission(user.id, organization.id, permission);
  return { organization, user };
}

function errorResponse(error: unknown, operation: string) {
  if (error instanceof OnlineStoreInventoryError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message === "Authentication required.") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  }
  console.error("Online-store inventory operation failed", { operation });
  return NextResponse.json({ error: "Unable to update online-store inventory." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organization } = await getAuthorizedOrganization(context, "VIEW_POS_ONLINE_STORE");
    const locations = await listOrganizationOnlineStoreInventory(organization.id);
    return NextResponse.json({ locations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "list");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organization, user } = await getAuthorizedOrganization(context, "MANAGE_POS_ONLINE_STORE");
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 8_000) {
      return NextResponse.json({ error: "The location update is too large." }, { status: 413 });
    }
    const body = await request.json().catch(() => null) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Enter valid online-store location details." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    await setOnlineStoreLocationEnabled({
      organization,
      actorId: user.id,
      locationId: input.locationId,
      enabled: input.enabled,
    });
    const locations = await listOrganizationOnlineStoreInventory(organization.id);
    return NextResponse.json({ locations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "update");
  }
}
