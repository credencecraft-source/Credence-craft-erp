import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  createDivisionLocation,
  EntityMasterArchitectureError,
  listDivisionLocations,
} from "@/lib/services/organizations/entity-master-architecture-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type RouteContext = {
  params: Promise<{ organizationId: string; entityId: string; divisionId: string }>;
};

function handleError(error: unknown, fallback: string) {
  if (error instanceof EntityMasterArchitectureError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "A Location with that name already exists in this organization." }, { status: 409 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { organizationId, entityId, divisionId } = await context.params;
    const locations = await listDivisionLocations(user.id, organizationId, entityId, divisionId);
    return NextResponse.json({ locations });
  } catch (error) {
    return handleError(error, "Unable to load Division Locations.");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { organizationId, entityId, divisionId } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    }
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Location details are invalid." }, { status: 400 });
    }
    const location = await createDivisionLocation(user.id, organizationId, entityId, divisionId, {
      locationName: body.locationName,
    });
    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    return handleError(error, "Unable to create the Location.");
  }
}
