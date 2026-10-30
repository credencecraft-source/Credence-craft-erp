import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from "@/lib/database/database-errors";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import {
  getOrderQrTemplate,
  OrderQrTemplatePageSetupNotFoundError,
  updateOrderQrTemplate,
} from "@/lib/services/orders/order-qr-template-service";
import { parseOrderQrTemplateInput } from "@/lib/services/orders/order-qr-template-contract";

const ALLOWED_ROLES = ["OWNER", "ADMIN", "MERCHANDISING"];
const SCHEMA_NOT_READY_MESSAGE =
  "QR template storage is not ready. Apply pending database migrations before using this feature.";

async function authorizeOrganization(request: Request) {
  const user = await requireSessionUser();
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const workspaceId = url.searchParams.get("workspaceId");

  if (!user.workspace_id || !workspaceId || workspaceId !== user.workspace_id) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Workspace access denied." }, { status: 403 }),
    };
  }
  if (!organizationId) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Organization ID is required." }, { status: 400 }),
    };
  }

  try {
    const organization = await requireOrganizationContext(user.id, organizationId, ALLOWED_ROLES);
    return { authorized: true as const, user, organization };
  } catch (error) {
    if (
      error instanceof Error
      && (error.message.startsWith("Access denied:") || error.message.includes("trial has ended"))
    ) {
      return {
        authorized: false as const,
        response: NextResponse.json({ error: "Organization access denied." }, { status: 403 }),
      };
    }
    throw error;
  }
}

function getSchemaNotReadyResponse(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2021" || error.code === "P2022")
  ) {
    console.error("Order QR template schema is not ready.", { prismaCode: error.code });
    return NextResponse.json(
      { error: SCHEMA_NOT_READY_MESSAGE, code: "SCHEMA_NOT_READY" },
      { status: 503 },
    );
  }
  return null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  try {
    const authorization = await authorizeOrganization(request);
    if (!authorization.authorized) return authorization.response;

    const { templateId } = await context.params;
    const template = await getOrderQrTemplate(authorization.organization.id, templateId);
    if (!template) {
      return NextResponse.json({ error: "QR template not found." }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    const schemaResponse = getSchemaNotReadyResponse(error);
    if (schemaResponse) return schemaResponse;
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to load organization order QR template.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load QR template." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> },
): Promise<NextResponse> {
  try {
    const authorization = await authorizeOrganization(request);
    if (!authorization.authorized) return authorization.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = parseOrderQrTemplateInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const { templateId } = await context.params;
    const template = await updateOrderQrTemplate(
      authorization.organization.id,
      authorization.user.id,
      templateId,
      parsed.data,
    );
    if (!template) {
      return NextResponse.json({ error: "QR template not found." }, { status: 404 });
    }
    return NextResponse.json({ template });
  } catch (error) {
    if (error instanceof OrderQrTemplatePageSetupNotFoundError) {
      return NextResponse.json(
        { error: "Select a Page Setup template from this organization." },
        { status: 404 },
      );
    }
    const schemaResponse = getSchemaNotReadyResponse(error);
    if (schemaResponse) return schemaResponse;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A template with this name already exists." },
        { status: 409 },
      );
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to update organization order QR template.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to update QR template." }, { status: 500 });
  }
}
