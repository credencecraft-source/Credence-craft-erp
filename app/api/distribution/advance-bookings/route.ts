import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  createAdvanceBooking,
  listAdvanceBookings,
  listAssignableWorkOrders,
} from "@/lib/services/distribution/advance-booking-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "Advance Booking is unavailable until its database migration is deployed." }, { status: 503 });
    }
    if (error.code === "P2002" || error.code === "P2034") {
      return NextResponse.json({ error: "Advance booking quantities changed while saving. Reload and try again." }, { status: 409 });
    }
  }
  if (isDatabaseUnavailableError(error)) {
    console.error("Unable to access advance bookings because the database is unavailable.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const search = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, search.get("organizationId") ?? "");
    const bookingId = search.get("assignableWorkOrdersFor")?.trim();
    if (bookingId) {
      return NextResponse.json(await listAssignableWorkOrders(organization.id, bookingId));
    }
    return NextResponse.json(await listAdvanceBookings(organization.id));
  } catch (error) {
    return errorResponse(error, "Unable to load advance bookings.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit a valid advance booking.");
    }
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    if (!Array.isArray(body.sizes)) throw new Error("Submit size-wise advance booking quantities.");
    const sizes = body.sizes.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Each advance booking size quantity must be valid.");
      }
      const line = value as Record<string, unknown>;
      const size = String(line.size ?? "").trim();
      const quantity = typeof line.quantity === "number" ? line.quantity : Number.NaN;
      if (!size || !Number.isSafeInteger(quantity) || quantity < 0) {
        throw new Error("Each size needs a whole-number quantity of zero or more.");
      }
      return { size, quantity };
    });
    const booking = await createAdvanceBooking(organization.id, user.id, {
      orderId: String(body.orderId ?? "").trim(),
      vendorId: String(body.vendorId ?? "").trim(),
      sizes,
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create advance booking.");
  }
}
