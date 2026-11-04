import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { isDatabaseUnavailableError, DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/database/database-errors";
import {
  getOrganizationPrintTemplate,
  updateOrganizationPrintTemplate,
} from "@/lib/services/distribution/organization-print-template-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type RouteContext = { params: Promise<{ templateId: string }> };
type AuthorizationResult =
  | { authorized: true; user: Awaited<ReturnType<typeof requireSessionUser>>; organization: Awaited<ReturnType<typeof requireOrganizationContext>> }
  | { authorized: false; response: NextResponse };

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
  if (error instanceof Error && /^(Submit|Provide|Choose|Select|Use|Each|Font|Header|Template name|An inactive|A template)/.test(error.message)) {
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

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const authorization = await authorize(request);
    if (!authorization.authorized) return authorization.response;
    const { templateId } = await context.params;
    const template = await getOrganizationPrintTemplate(
      authorization.user.id,
      authorization.organization.organizationId,
      templateId,
    );
    if (!template) return NextResponse.json({ error: "Print template not found." }, { status: 404 });
    return NextResponse.json({ template });
  } catch (error) {
    return errorResponse(error, "Unable to load the organization print template.");
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const authorization = await authorize(request);
    if (!authorization.authorized) return authorization.response;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const { templateId } = await context.params;
    const template = await updateOrganizationPrintTemplate(
      authorization.user.id,
      authorization.organization.organizationId,
      templateId,
      body,
    );
    if (!template) return NextResponse.json({ error: "Print template not found." }, { status: 404 });
    return NextResponse.json({ template });
  } catch (error) {
    return errorResponse(error, "Unable to update the organization print template.");
  }
}
