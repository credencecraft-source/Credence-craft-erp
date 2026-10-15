import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  deactivateContact,
  getContact,
  updateContact,
} from "@/lib/services/master-data/contact-master-service";
import { ContactValidationError } from "@/lib/services/master-data/contact-master-validation";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

type AuthorizationResult =
  | { authorized: false; response: NextResponse }
  | { authorized: true; userId: string; organizationId: string };

async function authorizedContext(organizationPublicId: string) {
  const user = await getSessionUser();
  if (!user?.workspace_id) return { authorized: false, response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) } satisfies AuthorizationResult;
  const organization = await getOrganizationForUser(user.id, organizationPublicId);
  if (!organization) return { authorized: false, response: NextResponse.json({ error: "Organization not found." }, { status: 404 }) } satisfies AuthorizationResult;
  try {
    await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return { authorized: false, response: NextResponse.json({ error: "You do not have permission to manage contacts." }, { status: 403 }) } satisfies AuthorizationResult;
    }
    throw error;
  }
  return { authorized: true, userId: user.id, organizationId: organization.id } satisfies AuthorizationResult;
}

async function parseJson(request: Request) {
  const text = await request.text();
  if (text.length > 128_000) throw new ContactValidationError("Contact request is too large.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ContactValidationError("Request body must contain valid JSON.");
  }
}

function handleError(error: unknown, operation: string) {
  if (error instanceof ContactValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Contact master request failed.", {
    operation,
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code } : {}),
  });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return NextResponse.json({ error: "A contact code or GSTIN already exists in this organization." }, { status: 409 });
    if (error.code === "P2003" || error.code === "P2014") return NextResponse.json({ error: "This contact detail is still referenced and cannot be changed." }, { status: 409 });
    if (error.code === "P2028") return NextResponse.json({ error: "The contact save took too long while data was being updated. Refresh and try again." }, { status: 409 });
    if (error.code === "P2025") return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "Contact master database migration is pending. Apply the approved migration before using this module." }, { status: 503 });
    }
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: "Unable to complete the contact request." }, { status: 500 });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string }> },
) {
  const { organizationId: organizationPublicId, contactId } = await context.params;
  try {
    const auth = await authorizedContext(organizationPublicId);
    if (!auth.authorized) return auth.response;
    const contact = await getContact(auth.organizationId, contactId);
    return contact
      ? NextResponse.json(contact)
      : NextResponse.json({ error: "Contact not found." }, { status: 404 });
  } catch (error) {
    return handleError(error, "read");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string }> },
) {
  const { organizationId: organizationPublicId, contactId } = await context.params;
  try {
    const auth = await authorizedContext(organizationPublicId);
    if (!auth.authorized) return auth.response;
    const body = await parseJson(request);
    const contact = await updateContact(auth.organizationId, auth.userId, contactId, body);
    return contact
      ? NextResponse.json(contact)
      : NextResponse.json({ error: "Contact not found." }, { status: 404 });
  } catch (error) {
    return handleError(error, "update");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string }> },
) {
  const { organizationId: organizationPublicId, contactId } = await context.params;
  try {
    const auth = await authorizedContext(organizationPublicId);
    if (!auth.authorized) return auth.response;
    const result = await deactivateContact(auth.organizationId, auth.userId, contactId);
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: "Contact not found." }, { status: 404 });
  } catch (error) {
    return handleError(error, "deactivate");
  }
}
