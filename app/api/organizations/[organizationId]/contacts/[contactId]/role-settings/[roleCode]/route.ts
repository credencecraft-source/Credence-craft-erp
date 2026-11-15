import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  ContactRoleSettingsError,
  getContactRoleSettings,
  saveContactRoleSettings,
} from "@/lib/services/master-data/contact-role-settings-service";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

type AuthorizationResult =
  | { authorized: false; response: NextResponse }
  | { authorized: true; userId: string; organizationId: string };

async function authorizedContext(organizationPublicId: string): Promise<AuthorizationResult> {
  const user = await getSessionUser();
  if (!user?.workspace_id) {
    return { authorized: false, response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) };
  }
  const organization = await getOrganizationForUser(user.id, organizationPublicId);
  if (!organization) {
    return { authorized: false, response: NextResponse.json({ error: "Organization not found." }, { status: 404 }) };
  }
  try {
    await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return { authorized: false, response: NextResponse.json({ error: "You do not have permission to manage role settings." }, { status: 403 }) };
    }
    throw error;
  }
  return { authorized: true, userId: user.id, organizationId: organization.id };
}

async function parseJson(request: Request) {
  const text = await request.text();
  if (text.length > 16_000) throw new ContactRoleSettingsError("Role settings request is too large.", 413);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ContactRoleSettingsError("Request body must contain valid JSON.", 400);
  }
}

function handleError(error: unknown, operation: string) {
  if (error instanceof ContactRoleSettingsError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Contact role settings request failed.", {
    operation,
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code } : {}),
  });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "These contact role settings were saved by another request. Refresh and retry." }, { status: 409 });
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "Contact role settings migration is pending. Apply the approved migration before using this feature." }, { status: 503 });
    }
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: "Unable to complete the contact role settings request." }, { status: 500 });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string; roleCode: string }> },
) {
  const { organizationId: organizationPublicId, contactId, roleCode } = await context.params;
  try {
    const auth = await authorizedContext(organizationPublicId);
    if (!auth.authorized) return auth.response;
    const searchParams = new URL(request.url).searchParams;
    const scope = searchParams.get("scope");
    const mappedContactId = searchParams.get("mappedContactId") ?? undefined;
    return NextResponse.json(await getContactRoleSettings(
      auth.organizationId,
      contactId,
      roleCode.toUpperCase(),
      scope,
      mappedContactId,
    ));
  } catch (error) {
    return handleError(error, "read");
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string; roleCode: string }> },
) {
  const { organizationId: organizationPublicId, contactId, roleCode } = await context.params;
  try {
    const auth = await authorizedContext(organizationPublicId);
    if (!auth.authorized) return auth.response;
    return NextResponse.json(await saveContactRoleSettings(
      auth.organizationId,
      auth.userId,
      contactId,
      roleCode.toUpperCase(),
      await parseJson(request),
    ));
  } catch (error) {
    return handleError(error, "save");
  }
}
