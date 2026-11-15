import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  assignContactToPriceList,
  getPriceListContactErrorResponse,
  listAvailablePriceListContacts,
  listPriceListContactAssignments,
} from "@/lib/services/master-data/price-list-contact-service";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

type RouteParams = Promise<{ organizationId: string; priceListId: string }>;

async function getAuthorizedContext(organizationPublicId: string) {
  const user = await getSessionUser();
  if (!user?.workspace_id) {
    return { response: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) };
  }
  const organization = await getOrganizationForUser(user.id, organizationPublicId);
  if (!organization) {
    return { response: NextResponse.json({ error: "Organization not found." }, { status: 404 }) };
  }
  try {
    await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return { response: NextResponse.json({ error: "You do not have permission to manage Price Lists." }, { status: 403 }) };
    }
    throw error;
  }
  return { userId: user.id, organizationId: organization.id };
}

function handleError(error: unknown, operation: string) {
  const knownResponse = getPriceListContactErrorResponse(error);
  if (knownResponse) return NextResponse.json({ error: knownResponse.message }, { status: knownResponse.status });
  console.error("Price List contact request failed.", {
    operation,
    errorName: error instanceof Error ? error.name : "UnknownError",
    ...(error instanceof Prisma.PrismaClientKnownRequestError ? { code: error.code } : {}),
  });
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: "Unable to complete the Price List contact request." }, { status: 500 });
}

export async function GET(request: Request, context: { params: RouteParams }) {
  const { organizationId: organizationPublicId, priceListId } = await context.params;
  try {
    const auth = await getAuthorizedContext(organizationPublicId);
    if ("response" in auth) return auth.response;
    const query = new URL(request.url).searchParams;
    const take = Number(query.get("limit") ?? 50);
    const skip = Number(query.get("offset") ?? 0);
    const search = query.get("search") ?? undefined;
    if (!Number.isSafeInteger(take) || take < 1 || take > 200
      || !Number.isSafeInteger(skip) || skip < 0
      || (search !== undefined && search.length > 100)) {
      return NextResponse.json({ error: "Contact report search or pagination is invalid." }, { status: 400 });
    }
    const records = query.get("mode") === "available"
      ? await listAvailablePriceListContacts(auth.organizationId, priceListId, search, { skip, take })
      : await listPriceListContactAssignments(auth.organizationId, priceListId, { skip, take });
    return NextResponse.json(records, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleError(error, "list");
  }
}

export async function POST(request: Request, context: { params: RouteParams }) {
  const { organizationId: organizationPublicId, priceListId } = await context.params;
  try {
    const auth = await getAuthorizedContext(organizationPublicId);
    if ("response" in auth) return auth.response;
    const bodyText = await request.text();
    if (bodyText.length > 4_096) {
      return NextResponse.json({ error: "Contact assignment request is too large." }, { status: 400 });
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Request body must contain valid JSON." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)
      || !("contactId" in body) || typeof body.contactId !== "string") {
      return NextResponse.json({ error: "Select a Contact to add." }, { status: 400 });
    }
    const assignment = await assignContactToPriceList(
      auth.organizationId,
      auth.userId,
      priceListId,
      body.contactId,
    );
    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    return handleError(error, "create");
  }
}
