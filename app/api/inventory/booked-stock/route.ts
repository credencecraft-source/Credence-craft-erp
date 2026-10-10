import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { createRawMaterialStockBookings, listRawMaterialStockBookings } from "@/lib/services/inventory/rm-stock-booking-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    return NextResponse.json({ bookings: await listRawMaterialStockBookings(organization.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load booked stock." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as { organizationId?: unknown; currentStoreVendorId?: unknown; lines?: unknown };
    const organization = await requireOrganizationContext(user.id, String(body.organizationId ?? ""), ["OWNER", "ADMIN", "MERCHANDISING"]);
    const lines = Array.isArray(body.lines) ? body.lines.map((line: unknown) => {
      const value = line && typeof line === "object" ? line as Record<string, unknown> : {};
      return {
        bomItemId: String(value.bomItemId ?? ""),
        takeFromStockId: String(value.takeFromStockId ?? ""),
        bookedQuantity: value.bookedQuantity as number | string,
      };
    }) : [];
    const result = await createRawMaterialStockBookings({
      organizationId: organization.id,
      bookedBy: user.full_name,
      currentStoreVendorId: String(body.currentStoreVendorId ?? ""),
      lines,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to book raw-material stock." }, { status: 400 });
  }
}