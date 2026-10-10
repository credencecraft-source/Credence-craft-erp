import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/database/prisma-client";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { listRawMaterialGeneralInventory } from "@/lib/services/inventory/rm-general-inventory-service";
import { addRawMaterialStockManually, ManualStockError } from "@/lib/services/inventory/rm-manual-stock-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const url = new URL(request.url);
    const organization = await requireOrganizationContext(user.id, url.searchParams.get("organizationId") ?? "");
    const type = url.searchParams.get("type") === "FG" ? "FG" : "RM";
    const stock = type === "FG"
      ? await prisma.finishedGoodsStock.findMany({
        where: { organization_id: organization.id },
        orderBy: [{ location_id: "asc" }, { style_name: "asc" }],
        include: { location: { select: { location_name: true } } },
      })
      : await listRawMaterialGeneralInventory(organization.id);
    return NextResponse.json({ type, stock });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load stock." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireSessionUser();
  } catch {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A valid stock request is required." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const readText = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const organizationId = readText(input.organizationId);
  if (!organizationId) return NextResponse.json({ error: "Organization ID is required." }, { status: 400 });

  let organization;
  try {
    organization = await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "INVENTORY"]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to verify organization access." }, { status: 500 });
  }

  try {
    const stock = await addRawMaterialStockManually({
      organizationId: organization.id,
      userId: user.id,
      rawMaterialId: readText(input.rawMaterialId),
      locationId: readText(input.locationId),
      quantity: readText(input.quantity),
      reason: readText(input.reason),
    });
    return NextResponse.json({ stock }, { status: 201 });
  } catch (error) {
    if (error instanceof ManualStockError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Stock changed while this addition was being saved. Try again." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to add raw material stock." }, { status: 500 });
  }
}