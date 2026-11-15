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
  deletePendingOrderQrPrintRequests,
  createOrderQrPrintRequest,
  listOrderQrPrintRequests,
  OrderQrPrintRequestDeleteConflictError,
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

async function authorizeOrganization(
  request: Request,
  permission: "VIEW_REPORTS" | "CREATE_ORDERS" | "MANAGE_MASTER_DATA" | "CREATE_POS_QR_REQUEST",
) {
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
    const organization = permission === "CREATE_POS_QR_REQUEST"
      ? await requireOrganizationContext(
        user.id,
        organizationId,
        ["OWNER", "ADMIN", "FINANCE", "INVENTORY"],
      )
      : await requireOrganizationContext(user.id, organizationId);
    if (permission !== "CREATE_POS_QR_REQUEST") {
      await requireOrganizationPermission(user.id, organization.organizationId, permission);
    }
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
    const sourceType = new URL(request.url).searchParams.get("sourceType");
    const authorization = await authorizeOrganization(
      request,
      sourceType === "POS_PURCHASE_BILL" ? "CREATE_POS_QR_REQUEST" : "CREATE_ORDERS",
    );
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
    if (
      Boolean(parsed.data.purchaseBillId)
      !== (sourceType === "POS_PURCHASE_BILL")
    ) {
      return NextResponse.json({ error: "Request source does not match the authorized workflow." }, { status: 400 });
    }

    const result = await createOrderQrPrintRequest(
      authorization.organization.id,
      authorization.user.id,
      parsed.data,
    );
    if (!result.success) {
      if (result.reason === "INVALID_QUANTITY") {
        return NextResponse.json(
          { error: parsed.data.purchaseBillId
            ? "A purchase bill QR request must contain between 1 and 10,000 labels in total."
            : "A QR request must contain between 1 and 10,000 labels in total." },
          { status: 400 },
        );
      }
      if (result.reason === "QR_FIELD_VALUE_MISSING") {
        return NextResponse.json(
          { error: parsed.data.purchaseBillId
            ? "The selected QR field has no value on one of the selected purchase bill lines."
            : parsed.data.finishedGoodsRows || parsed.data.finishedGoodsItems
              ? "The selected QR field has no value on one of the selected finished-goods sizes."
              : "The selected QR field has no value on this order." },
          { status: 400 },
        );
      }
      if (result.reason === "FG_VARIANT_NOT_FOUND") {
        return NextResponse.json(
          { error: "One or more selected finished-goods sizes do not belong to their selected orders." },
          { status: 404 },
        );
      }
      if (result.reason === "FG_IDENTIFIERS_MISSING") {
        return NextResponse.json(
          { error: "Every selected finished-goods size must have its order-assigned SKU and barcode before labels can be requested." },
          { status: 409 },
        );
      }
      if (result.reason === "PAGE_SETUP_REQUIRED") {
        return NextResponse.json(
          { error: "Assign a Page Setup to the QR template before creating a print request." },
          { status: 409 },
        );
      }
      if (result.reason === "PURCHASE_BILL_NOT_READY") {
        return NextResponse.json(
          { error: "Only posted or approved purchase bills can request QR labels." },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: result.reason === "ORDER_NOT_FOUND"
          ? "The selected order was not found in this organization."
          : result.reason === "PURCHASE_BILL_NOT_FOUND"
            ? "The selected purchase bill or one of its lines was not found in this organization."
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

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const authorization = await authorizeOrganization(request, "MANAGE_MASTER_DATA");
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
      || ids.length > 200
      || ids.some((id) => typeof id !== "string" || !id.trim() || id.length > 100)
      || new Set(ids).size !== ids.length
    ) {
      return NextResponse.json(
        { error: "Select between 1 and 200 unique QR print/download requests." },
        { status: 400 },
      );
    }

    const result = await deletePendingOrderQrPrintRequests(
      authorization.organization.id,
      authorization.user.id,
      ids,
    );
    if (!result.success) {
      if (result.reason === "NOT_FOUND") {
        return NextResponse.json(
          { error: "One or more requests were not found in this organization." },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: "Only pending QR print/download requests can be deleted." },
        { status: 409 },
      );
    }
    return NextResponse.json({ deletedCount: result.deletedCount });
  } catch (error) {
    if (error instanceof OrderQrPrintRequestDeleteConflictError) {
      return NextResponse.json(
        { error: "A request changed while deletion was in progress. Refresh the report and try again." },
        { status: 409 },
      );
    }
    const schemaResponse = getSchemaNotReadyResponse(error);
    if (schemaResponse) return schemaResponse;
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to delete organization order QR print requests.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to delete QR print/download requests." }, { status: 500 });
  }
}
