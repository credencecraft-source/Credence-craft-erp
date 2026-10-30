import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  createDistributionQuotationFromBookings,
  createDistributionQuotationFromOrderForms,
  deleteDistributionQuotations,
  listDistributionQuotations,
} from "@/lib/services/distribution/quotation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function quotationErrorResponse(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "Advance Booking quotations are unavailable until their database migration is deployed." }, { status: 503 });
    }
    if (error.code === "P2002" || error.code === "P2034") {
      return NextResponse.json({ error: "Quotation data changed while processing. Reload and try again." }, { status: 409 });
    }
    if (error.code === "P2003") {
      return NextResponse.json({ error: "A quotation dependency changed or prevents this operation. Resolve its dependency and reload." }, { status: 409 });
    }
  }
  if (isDatabaseUnavailableError(error)) {
    console.error("Unable to access distribution quotations because the database is unavailable.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organization = await requireOrganizationContext(
      user.id,
      new URL(request.url).searchParams.get("organizationId") ?? "",
    );
    return NextResponse.json(await listDistributionQuotations(organization.id));
  } catch (error) {
    return quotationErrorResponse(error, "Unable to load Advance Booking quotations.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Submit valid quotation source bookings.");
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    const vendorId = typeof body.vendorId === "string" && body.vendorId.trim() ? body.vendorId.trim() : null;
    const contactId = typeof body.contactId === "string" && body.contactId.trim() ? body.contactId.trim() : null;
    const orderFormIds = body.orderFormIds;
    if (
      Array.isArray(orderFormIds) &&
      orderFormIds.every((id) => typeof id === "string") &&
      !body.bookingIds
    ) {
      const quotation = await createDistributionQuotationFromOrderForms(
        organization.id,
        user.id,
        orderFormIds,
        vendorId,
        contactId,
      );
      return NextResponse.json({ quotation }, { status: 201 });
    }
    if (
      !Array.isArray(body.bookingIds) ||
      body.bookingIds.some((id) => typeof id !== "string") ||
      Boolean(vendorId) === Boolean(contactId)
    ) {
      throw new Error("Select advance bookings and either a Dealer or a Contact Master contact.");
    }
    const quotation = await createDistributionQuotationFromBookings(
      organization.id,
      user.id,
      body.bookingIds,
      vendorId,
      contactId,
    );
    return NextResponse.json({ quotation }, { status: 201 });
  } catch (error) {
    return quotationErrorResponse(error, "Unable to create the Advance Booking quotation.");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit a valid bulk quotation deletion request.");
    }
    if (typeof body.organizationId !== "string" || !body.organizationId.trim()) {
      throw new Error("Select the organization for these quotation deletions.");
    }
    const quotationIds = body.quotationIds;
    if (
      !Array.isArray(quotationIds) ||
      quotationIds.length === 0 ||
      quotationIds.length > 500 ||
      !quotationIds.every((id): id is string => typeof id === "string")
    ) {
      throw new Error("Select between one and 500 quotations to delete.");
    }
    const organization = await requireOrganizationContext(
      user.id,
      body.organizationId,
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    const deleted = await deleteDistributionQuotations(
      organization.id,
      user.id,
      quotationIds,
    );
    return NextResponse.json({ deleted });
  } catch (error) {
    return quotationErrorResponse(error, "Unable to delete the selected quotations.");
  }
}
