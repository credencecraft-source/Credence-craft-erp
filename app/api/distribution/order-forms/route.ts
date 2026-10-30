import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  createDistributionOrderFormFromBookings,
  listDistributionOrderForms,
} from "@/lib/services/distribution/quotation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organization = await requireOrganizationContext(
      user.id,
      new URL(request.url).searchParams.get("organizationId") ?? "",
    );
    return NextResponse.json({ orderForms: await listDistributionOrderForms(organization.id) });
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
      { status: 400 },
    );
  }
}
