import { NextResponse } from "next/server";
import { Prisma, type OrganizationPrintDocumentType } from "@prisma/client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { isDatabaseUnavailableError, DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/database/database-errors";
import {
  createOrganizationPrintTemplate,
  getOrganizationPrintTemplateForDocument,
  listOrganizationPrintTemplates,
} from "@/lib/services/distribution/organization-print-template-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

const DOCUMENT_TYPES: readonly OrganizationPrintDocumentType[] = ["SALES_ORDER", "QUOTATION"];

type AuthorizationResult =
  | { authorized: true; user: Awaited<ReturnType<typeof requireSessionUser>>; organization: Awaited<ReturnType<typeof requireOrganizationContext>> }
  | { authorized: false; response: NextResponse };

function isDocumentType(value: string | null): value is OrganizationPrintDocumentType {
  return value !== null && DOCUMENT_TYPES.includes(value as OrganizationPrintDocumentType);
}

async function authorize(request: Request): Promise<AuthorizationResult> {
  const user = await requireSessionUser();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const organizationId = url.searchParams.get("organizationId");
  if (!workspaceId || workspaceId !== user.workspace_id) {
    return { authorized: false, response: NextResponse.json({ error: "Workspace access denied." }, { status: 403 }) };
  }
  if (!organizationId) {
    return { authorized: false, response: NextResponse.json({ error: "Organization ID is required." }, { status: 400 }) };
  }
  try {
    const organization = await requireOrganizationContext(user.id, organizationId);
    return { authorized: true, user, organization };
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("Access denied:") || error.message.includes("trial has ended"))) {
      return { authorized: false, response: NextResponse.json({ error: "Organization access denied." }, { status: 403 }) };
    }
    throw error;
  }
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "A template with this name already exists for the selected document type." }, { status: 409 });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: "You do not have permission to manage or view these print templates." }, { status: 403 });
  }
  if (error instanceof Error && /^(Submit|Provide|Choose|Select|Use|Each|Font|Header|Template name|An inactive)/.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (isDatabaseUnavailableError(error)) {
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  console.error("Organization print-template request failed.", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const authorization = await authorize(request);
    if (!authorization.authorized) return authorization.response;
    const url = new URL(request.url);
    const defaultFor = url.searchParams.get("defaultFor");
    if (defaultFor !== null) {
      if (!isDocumentType(defaultFor)) {
        return NextResponse.json({ error: "Select Sales Order or Quotation." }, { status: 400 });
      }
      const designConfig = await getOrganizationPrintTemplateForDocument(
        authorization.user.id,
        authorization.organization.organizationId,
        defaultFor,
      );
      return NextResponse.json({ designConfig });
    }
    const documentType = url.searchParams.get("documentType");
    if (documentType !== null && !isDocumentType(documentType)) {
      return NextResponse.json({ error: "Select Sales Order or Quotation." }, { status: 400 });
    }
    const templates = await listOrganizationPrintTemplates(
      authorization.user.id,
      authorization.organization.organizationId,
      documentType ?? undefined,
    );
    return NextResponse.json({ templates });
  } catch (error) {
    return errorResponse(error, "Unable to load organization print templates.");
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const authorization = await authorize(request);
    if (!authorization.authorized) return authorization.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const template = await createOrganizationPrintTemplate(
      authorization.user.id,
      authorization.organization.organizationId,
      body,
    );
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create the organization print template.");
  }
}
