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
import { advanceOrderQrPrintRequestStatus } from "@/lib/services/orders/order-qr-print-request-service";
import {
  isOrderQrPrintRequestStatus,
  type OrderQrPrintRequestStatus,
} from "@/lib/services/orders/order-qr-print-request-contract";

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
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organization.organizationId, "MANAGE_MASTER_DATA");
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
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
    const targetStatus = typeof body === "object" && body !== null && "status" in body
      ? body.status
      : undefined;
    if (!isOrderQrPrintRequestStatus(targetStatus)) {
      return NextResponse.json({ error: "Select a valid request status." }, { status: 400 });
    }

    const { requestId } = await context.params;
    const result = await advanceOrderQrPrintRequestStatus(
      authorization.organization.id,
      authorization.user.id,
      requestId,
      targetStatus as OrderQrPrintRequestStatus,
    );
    if (!result.success) {
      return NextResponse.json(
        { error: result.reason === "NOT_FOUND"
          ? "QR print/download request not found."
          : "The request status has changed or this transition is not allowed." },
        { status: result.reason === "NOT_FOUND" ? 404 : 409 },
      );
    }
    return NextResponse.json({ request: result.request });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError
      && (error.code === "P2021" || error.code === "P2022")
    ) {
      console.error("Order QR print request schema is not ready.", { prismaCode: error.code });
      return NextResponse.json(
        { error: "QR print/download request storage is not ready. Apply pending database migrations before using this feature.", code: "SCHEMA_NOT_READY" },
        { status: 503 },
      );
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to update organization order QR print request.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to update the QR print/download request." }, { status: 500 });
  }
}
