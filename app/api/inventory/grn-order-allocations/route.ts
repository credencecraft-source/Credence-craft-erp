import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  getRmGrnOrderAllocationLines,
  InvalidRmGrnOrderAllocationError,
  RmGrnOrderAllocationNotFoundError,
  saveRmGrnOrderAllocations,
} from "@/lib/services/inventory/rm-grn-order-allocation-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof RmGrnOrderAllocationNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvalidRmGrnOrderAllocationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return NextResponse.json({ error: "GRN order allocation is unavailable until its database migration is deployed." }, { status: 503 });
    }
    if (error.code === "P2002" || error.code === "P2034") {
      return NextResponse.json({ error: "This allocation changed while it was being saved. Reload and try again." }, { status: 409 });
    }
  }
  if (error instanceof Error && !(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const searchParams = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, searchParams.get("organizationId") ?? "");
    const allocationId = searchParams.get("allocationId")?.trim() ?? "";
    if (!allocationId) return NextResponse.json({ error: "GRN allocation is required." }, { status: 400 });

    const result = await getRmGrnOrderAllocationLines(organization.id, allocationId);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Unable to load GRN order allocation lines.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json() as Record<string, unknown>;
    const organization = await requireOrganizationContext(
      user.id,
      String(body.organizationId ?? ""),
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    const allocationId = String(body.allocationId ?? "").trim();
    if (!allocationId) return NextResponse.json({ error: "GRN allocation is required." }, { status: 400 });

    const result = await saveRmGrnOrderAllocations(organization.id, allocationId, body.lines, user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error, "Unable to save GRN order allocation.");
  }
}