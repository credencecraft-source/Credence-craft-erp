import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  createDistributionQuotationFromBookings,
  listDistributionQuotations,
} from "@/lib/services/distribution/quotation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function quotationErrorResponse(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "Distribution Quotations are unavailable until their database migration is deployed." }, { status: 503 });
    }
    if (error.code === "P2002" || error.code === "P2034") {
      return NextResponse.json({ error: "Quotation or booking data changed while saving. Reload and try again." }, { status: 409 });
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
    return quotationErrorResponse(error, "Unable to load distribution quotations.");
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
    if (!Array.isArray(body.bookingIds) || body.bookingIds.some((id) => typeof id !== "string") ||
        typeof body.vendorId !== "string" || !body.vendorId.trim()) {
      throw new Error("Select advance bookings and a Vendor Master quotation vendor.");
    }
    const quotation = await createDistributionQuotationFromBookings(organization.id, user.id, body.bookingIds, body.vendorId.trim());
    return NextResponse.json({ quotation }, { status: 201 });
  } catch (error) {
    return quotationErrorResponse(error, "Unable to create the distribution quotation.");
  }
}
