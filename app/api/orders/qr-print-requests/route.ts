import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from "@/lib/database/database-errors";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import {
  createOrderQrPrintRequest,
  listOrderQrPrintRequests,
} from "@/lib/services/orders/order-qr-print-request-service";
import { parseCreateOrderQrPrintRequestInput } from "@/lib/services/orders/order-qr-print-request-contract";

const SCHEMA_NOT_READY_MESSAGE =
  "QR print/download request storage is not ready. Apply pending database migrations before using this feature.";

function getSchemaNotReadyResponse(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2021" || error.code === "P2022")
  ) {
    console.error("Order QR print request schema is not ready.", { prismaCode: error.code });
    return NextResponse.json(
      { error: SCHEMA_NOT_READY_MESSAGE, code: "SCHEMA_NOT_READY" },
      { status: 503 },
    );
  }
  return null;
}

async function authorizeOrganization(request: Request, permission: "VIEW_REPORTS" | "CREATE_ORDERS") {
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
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organization.organizationId, permission);
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

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const authorization = await authorizeOrganization(request, "VIEW_REPORTS");
    if (!authorization.authorized) return authorization.response;

    const requests = await listOrderQrPrintRequests(authorization.organization.id);
    return NextResponse.json({ requests });
  } catch (error) {
    const schemaResponse = getSchemaNotReadyResponse(error);
    if (schemaResponse) return schemaResponse;
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to load organization order QR print requests.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load QR print/download requests." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const authorization = await authorizeOrganization(request, "CREATE_ORDERS");
    if (!authorization.authorized) return authorization.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const parsed = parseCreateOrderQrPrintRequestInput(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await createOrderQrPrintRequest(
      authorization.organization.id,
      authorization.user.id,
      parsed.data,
    );
    if (!result.success) {
      return NextResponse.json(
        { error: result.reason === "ORDER_NOT_FOUND"
          ? "The selected order was not found in this organization."
          : "The selected QR template was not found in this organization." },
        { status: 404 },
      );
    }
    return NextResponse.json({ request: result.request }, { status: 201 });
  } catch (error) {
    const schemaResponse = getSchemaNotReadyResponse(error);
    if (schemaResponse) return schemaResponse;
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to create organization order QR print request.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to submit the QR print/download request." }, { status: 500 });
  }
}
