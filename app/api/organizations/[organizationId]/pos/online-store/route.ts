import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getOrganizationOnlineStorePresentation,
  getOrganizationOnlineStoreSettings,
  saveOrganizationOnlineStorePresentation,
  setOrganizationOnlineStoreEnabled,
} from "@/lib/services/pos/public-online-store-service";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organization } = await getAuthorizedOrganization(context, "VIEW_POS_ONLINE_STORE");
    const [settings, presentation] = await Promise.all([
      getOrganizationOnlineStoreSettings(organization),
      getOrganizationOnlineStorePresentation(organization.id),
    ]);
    return NextResponse.json({
      enabled: settings.online_store_enabled,
      publicPath: settings.online_store_enabled && settings.online_store_public_key
        ? `/store/${settings.online_store_public_key}`
        : null,
      presentation,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load online-store settings." },
      { status: error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organization } = await getAuthorizedOrganization(context, "MANAGE_POS_ONLINE_STORE");
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 5_000_000) {
      return NextResponse.json({ error: "Slideshow settings exceed the upload limit." }, { status: 413 });
    }
    const body = await request.json() as Record<string, unknown>;
    if (Object.hasOwn(body, "presentation")) {
      const presentation = await saveOrganizationOnlineStorePresentation(
        organization,
        body.presentation,
      );
      return NextResponse.json({ presentation });
    }
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Select whether the public store is enabled." }, { status: 400 });
    }
    await setOrganizationOnlineStoreEnabled(organization, body.enabled);
    const settings = await getOrganizationOnlineStoreSettings(organization);
    return NextResponse.json({
      enabled: settings.online_store_enabled,
      publicPath: settings.online_store_enabled && settings.online_store_public_key
        ? `/store/${settings.online_store_public_key}`
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update online-store settings." },
      { status: error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400 },
    );
  }
}
