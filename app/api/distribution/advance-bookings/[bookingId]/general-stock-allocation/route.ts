import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { allocateAdvanceBookingFromGeneralStock } from "@/lib/services/inventory/finished-goods-general-stock-allocation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    const { bookingId } = await context.params;
    if (!bookingId.trim()) throw new Error("A valid advance booking is required.");
    if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > 200) {
      throw new Error("Submit at least one size-wise general-stock quantity.");
    }
    const lines = body.lines.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Each general-stock allocation line must be valid.");
      }
      const line = value as Record<string, unknown>;
      const bookingSizeLineId = typeof line.bookingSizeLineId === "string" ? line.bookingSizeLineId.trim() : "";
      const quantity = typeof line.quantity === "number" ? line.quantity : Number.NaN;
      if (!bookingSizeLineId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2147483647) {
        throw new Error("Each selected size needs a booking size and a positive whole-number quantity.");
      }
      return { bookingSizeLineId, quantity };
    });
    if (new Set(lines.map((line) => line.bookingSizeLineId)).size !== lines.length) {
      throw new Error("Each booking size can only be included once in a general-stock allocation.");
    }

    const result = await allocateAdvanceBookingFromGeneralStock(organization.id, user.id, bookingId, lines);
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2021", "P2022"].includes(error.code)) {
      return NextResponse.json({ error: "General-stock allocation is unavailable until its database schema is deployed." }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      return NextResponse.json({ error: "Booking or general-stock quantities changed concurrently. Reload and try again." }, { status: 409 });
    }
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to allocate general finished-goods stock because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to allocate general finished-goods stock." }, { status: 400 });
  }
}
