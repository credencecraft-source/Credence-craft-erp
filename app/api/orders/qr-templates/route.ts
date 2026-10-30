import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import {
  createOrderQrTemplate,
  deleteOrderQrTemplates,
  listOrderQrTemplates,
  OrderQrTemplateDeleteConflictError,
  OrderQrTemplatePageSetupNotFoundError,
} from "@/lib/services/orders/order-qr-template-service";
import { parseOrderQrTemplateInput } from "@/lib/services/orders/order-qr-template-contract";

const ALLOWED_ROLES = ["OWNER", "ADMIN", "MERCHANDISING"];
const SCHEMA_NOT_READY_MESSAGE =
  "QR template storage is not ready. Apply pending database migrations before using this feature.";

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

type AuthorizationResult =
  | {
      authorized: true;
      user: Awaited<ReturnType<typeof requireSessionUser>>;
      organization: Awaited<ReturnType<typeof requireOrganizationContext>>;
    }
  | { authorized: false; response: NextResponse };

async function getAuthorizedOrganization(request: Request): Promise<AuthorizationResult> {
  const user = await requireSessionUser();
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const workspaceId = url.searchParams.get("workspaceId");

  if (!user.workspace_id || !workspaceId || workspaceId !== user.workspace_id) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Workspace access denied." }, { status: 403 }),
    };
  }
  if (!organizationId) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Organization ID is required." }, { status: 400 }),
    };
  }

  try {
    const organization = await requireOrganizationContext(
      user.id,
      organizationId,
      ALLOWED_ROLES,
    );
    return { authorized: true, user, organization };
  } catch (error) {
    if (
      error instanceof Error
      && (error.message.startsWith("Access denied:") || error.message.includes("trial has ended"))
    ) {
      return {
        authorized: false,
        response: NextResponse.json({ error: "Organization access denied." }, { status: 403 }),
      };
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const authorization = await getAuthorizedOrganization(request);
    if (!authorization.authorized) return authorization.response;

    const templates = await listOrderQrTemplates(authorization.organization.id);
    return NextResponse.json({ templates });
  } catch (error) {
    const schemaResponse = getSchemaNotReadyResponse(error);
    if (schemaResponse) return schemaResponse;
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to load organization order QR templates.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load QR templates." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const authorization = await getAuthorizedOrganization(request);
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

    const template = await createOrderQrTemplate(
      authorization.organization.id,
      authorization.user.id,
      parsed.data,
    );
    return NextResponse.json({ template }, { status: 201 });
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
    console.error("Unable to create organization order QR template.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to save QR template." }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const authorization = await getAuthorizedOrganization(request);
    if (!authorization.authorized) return authorization.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const ids = typeof body === "object" && body !== null && "ids" in body
      ? body.ids
      : undefined;
    if (
      !Array.isArray(ids)
      || ids.length < 1
      || ids.length > 100
      || ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 100)
      || new Set(ids).size !== ids.length
    ) {
      return NextResponse.json(
        { error: "Select between 1 and 100 unique QR templates." },
        { status: 400 },
      );
    }

    const result = await deleteOrderQrTemplates(
      authorization.organization.id,
      authorization.user.id,
      ids,
    );
    if (!result.success) {
      return NextResponse.json(
        { error: "One or more QR templates were not found in this organization." },
        { status: 404 },
      );
    }
    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (error) {
    if (error instanceof OrderQrTemplateDeleteConflictError) {
      return NextResponse.json(
        { error: "The selection changed during deletion. Refresh the report and try again." },
        { status: 409 },
      );
    }
    const schemaResponse = getSchemaNotReadyResponse(error);
    if (schemaResponse) return schemaResponse;
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to delete organization order QR templates.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to delete QR templates." }, { status: 500 });
  }
}
