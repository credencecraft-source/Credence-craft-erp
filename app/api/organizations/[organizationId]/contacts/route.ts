import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  createContact,
  deactivateContacts,
  deleteUnusedContacts,
  listContacts,
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
    if (error.code === "P2003" || error.code === "P2014") return NextResponse.json({ error: "This contact or one of its linked records is still referenced and cannot be changed or deleted." }, { status: 409 });
    if (error.code === "P2028") return NextResponse.json({ error: "The contact save took too long while data was being updated. Refresh and try again." }, { status: 409 });
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
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId: organizationPublicId } = await context.params;
  try {
    const auth = await authorizedContext(organizationPublicId);
    if (!auth.authorized) return auth.response;
    const searchParams = new URL(request.url).searchParams;
    const search = searchParams.get("search") ?? undefined;
    const rawLimit = searchParams.get("limit");
    const rawOffset = searchParams.get("offset");
    if (rawLimit !== null || rawOffset !== null) {
      const limit = rawLimit === null ? 200 : Number(rawLimit);
      const offset = rawOffset === null ? 0 : Number(rawOffset);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200
        || !Number.isSafeInteger(offset) || offset < 0) {
        return NextResponse.json({ error: "Contact list pagination is invalid." }, { status: 400 });
      }
      return NextResponse.json(await listContacts(auth.organizationId, search, undefined, { skip: offset, take: limit }));
    }
    return NextResponse.json(await listContacts(auth.organizationId, search));
  } catch (error) {
    return handleError(error, "list");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId: organizationPublicId } = await context.params;
  try {
    const auth = await authorizedContext(organizationPublicId);
    if (!auth.authorized) return auth.response;
    const body = await parseJson(request);
    return NextResponse.json(
      await createContact(auth.organizationId, auth.userId, body),
      { status: 201 },
    );
  } catch (error) {
    return handleError(error, "create");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId: organizationPublicId } = await context.params;
  try {
    const auth = await authorizedContext(organizationPublicId);
    if (!auth.authorized) return auth.response;
    const body = await parseJson(request);
    if (
      !body
      || typeof body !== "object"
      || Array.isArray(body)
      || !("contactIds" in body)
      || !Array.isArray(body.contactIds)
    ) {
      throw new ContactValidationError("Contact IDs must be provided as an array.");
    }
    const operation = "operation" in body ? body.operation : "deactivate";
    if (operation !== "deactivate" && operation !== "delete-unused") {
      throw new ContactValidationError("Contact bulk operation is invalid.");
    }
    const result = operation === "delete-unused"
      ? await deleteUnusedContacts(auth.organizationId, auth.userId, body.contactIds)
      : await deactivateContacts(auth.organizationId, auth.userId, body.contactIds);
    return result
      ? NextResponse.json(result)
      : NextResponse.json({ error: "One or more contacts were not found." }, { status: 404 });
  } catch (error) {
    return handleError(error, "bulk-contact-operation");
  }
}
