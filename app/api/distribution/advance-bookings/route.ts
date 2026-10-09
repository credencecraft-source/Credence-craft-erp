import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import {
  createAdvanceBooking,
  deleteAdvanceBookings,
  getAdvanceBookingById,
  listAdvanceBookings,
  listAssignableWorkOrders,
} from "@/lib/services/distribution/advance-booking-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "Advance Booking is unavailable until its database migration is deployed." }, { status: 503 });
    }
    if (error.code === "P2003") {
      return NextResponse.json({ error: "Booking dependencies changed while deleting. Reload and follow the required deletion order." }, { status: 409 });
    }
    if (error.code === "P2002" || error.code === "P2034") {
      return NextResponse.json({ error: "Advance booking data changed while saving or deleting. Reload and try again." }, { status: 409 });
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
    const bookingRecordId = search.get("bookingId")?.trim();
    if (bookingRecordId) {
      return NextResponse.json(await getAdvanceBookingById(organization.id, bookingRecordId));
    }
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
    if (body.vendorId !== undefined && body.vendorId !== null && typeof body.vendorId !== "string") {
      throw new Error("Select a valid optional booking vendor.");
    }
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
      vendorId: typeof body.vendorId === "string" && body.vendorId.trim() ? body.vendorId.trim() : null,
      sizes,
    });
    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Unable to create advance booking.");
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Submit a valid advance booking deletion request.");
    }
    if (typeof body.organizationId !== "string" || !body.organizationId.trim()) {
      throw new Error("Select the organization for this booking deletion.");
    }
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    if (!Array.isArray(body.bookingIds) || body.bookingIds.some((id) => typeof id !== "string")) {
      throw new Error("Select advance bookings to delete.");
    }
    const result = await deleteAdvanceBookings(organization.id, user.id, body.bookingIds);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to delete advance bookings.");
  }
}
