import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  createSubSubLocation,
  EntityMasterArchitectureError,
  listSubSubLocations,
} from "@/lib/services/organizations/entity-master-architecture-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type RouteContext = {
  params: Promise<{
    organizationId: string;
    entityId: string;
    divisionId: string;
    locationId: string;
    subLocationId: string;
  }>;
};

function handleError(error: unknown, fallback: string) {
  if (error instanceof EntityMasterArchitectureError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof Error && error.message.startsWith("Access denied:")) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return NextResponse.json({ error: "That storage code is already in use in this organization." }, { status: 409 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { organizationId, entityId, divisionId, locationId, subLocationId } = await context.params;
    const subSubLocations = await listSubSubLocations(
      user.id, organizationId, entityId, divisionId, locationId, subLocationId,
    );
    return NextResponse.json({ subSubLocations });
  } catch (error) {
    return handleError(error, "Unable to load Sub-sub-locations.");
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { organizationId, entityId, divisionId, locationId, subLocationId } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    }
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Sub-sub-location details are invalid." }, { status: 400 });
    }
    const subSubLocation = await createSubSubLocation(
      user.id, organizationId, entityId, divisionId, locationId, subLocationId, {
        name: body.name,
        code: body.code,
      },
    );
    return NextResponse.json({ subSubLocation }, { status: 201 });
  } catch (error) {
    return handleError(error, "Unable to create the Sub-sub-location.");
  }
}
