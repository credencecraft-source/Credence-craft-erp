import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { measureDatabaseQueries } from "@/lib/database/prisma-query-timing";
import {
  createDistributionOrderFormFromBookings,
  deleteDistributionOrderForms,
  listDistributionOrderForms,
} from "@/lib/services/distribution/quotation-service";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const quotationStatus = url.searchParams.get("quotationStatus");
    if (quotationStatus && quotationStatus !== "created" && quotationStatus !== "not-created") {
      return NextResponse.json({ error: "Select a valid Order Form quotation status." }, { status: 400 });
    }
    const authorization = await measureDatabaseQueries(async () => {
      const user = await requireSessionUser();
      const organization = await requireOrganizationContext(
        user.id,
        url.searchParams.get("organizationId") ?? "",
      );
      await requireOrganizationPermission(user.id, organization.id, "VIEW_ORDERS");
      return organization.id;
    });
    const list = await measureDatabaseQueries(() => listDistributionOrderForms(
      authorization.value,
      url.searchParams.get("cursor") ?? undefined,
      ...(quotationStatus ? [quotationStatus as "created" | "not-created"] : []),
    ));
    const response = NextResponse.json(list.value);
    if (process.env.NODE_ENV === "development") {
      response.headers.set("Server-Timing", [
        `auth;dur=${authorization.durationMs.toFixed(1)}`,
        `authdb;dur=${authorization.databaseDurationMs.toFixed(1)}`,
        `list;dur=${list.durationMs.toFixed(1)}`,
        `listdb;dur=${list.databaseDurationMs.toFixed(1)}`,
        `listqueries;desc="${list.queryCount}"`,
      ].join(", "));
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Order Forms." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit valid Order Form source bookings.");
    }
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    await requireOrganizationPermission(user.id, organization.id, "CREATE_ORDERS");
    const bookingIds = body.bookingIds;
    if (!Array.isArray(bookingIds) || !bookingIds.every((id) => typeof id === "string")) {
      throw new Error("Select one or more advance bookings.");
    }
    const vendorId = typeof body.vendorId === "string" && body.vendorId.trim() ? body.vendorId.trim() : null;
    const contactId = typeof body.contactId === "string" && body.contactId.trim() ? body.contactId.trim() : null;
    const orderForm = await createDistributionOrderFormFromBookings(
      organization.id,
      user.id,
      bookingIds,
      vendorId,
      contactId,
    );
    return NextResponse.json({ orderForm }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "Order Forms are unavailable until their database migration is deployed." }, { status: 503 });
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the Order Form." },
      { status: error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit a valid bulk Order Form deletion request.");
    }
    if (typeof body.organizationId !== "string" || !body.organizationId.trim()) {
      throw new Error("Select the organization for these Order Form deletions.");
    }
    const orderFormIds = body.orderFormIds;
    if (
      !Array.isArray(orderFormIds) ||
      orderFormIds.length === 0 ||
      orderFormIds.length > 500 ||
      !orderFormIds.every((id): id is string => typeof id === "string")
    ) {
      throw new Error("Select between one and 500 Order Forms to delete.");
    }
    const organization = await requireOrganizationContext(
      user.id,
      body.organizationId,
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    await requireOrganizationPermission(user.id, organization.id, "CREATE_ORDERS");
    const deleted = await deleteDistributionOrderForms(
      organization.id,
      user.id,
      orderFormIds,
    );
    return NextResponse.json({ deleted });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "Order Forms are unavailable until their database migration is deployed." }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2003", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "Order Form data changed while processing. Reload and try again." }, { status: 409 });
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete the selected Order Forms." },
      { status: error instanceof Error && error.message.startsWith("Access denied:") ? 403 : 400 },
    );
  }
}
