import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import {
  createEntityGstRegistration,
  EntityMasterArchitectureError,
  listEntityGstRegistrations,
} from "@/lib/services/organizations/entity-master-architecture-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; entityId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, entityId } = await context.params;
    return NextResponse.json({
      registrations: await listEntityGstRegistrations(user.id, organizationId, entityId),
    });
  } catch (error) {
    if (error instanceof EntityMasterArchitectureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unable to load Entity GST registrations." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; entityId: string }> },
) {
  try {
    const user = await requireSessionUser();
    const { organizationId, entityId } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "A valid JSON request body is required." }, { status: 400 });
    }
    if (!isRecord(body)) {
      return NextResponse.json({ error: "A GST registration is required." }, { status: 400 });
    }
    const registration = await createEntityGstRegistration(user.id, organizationId, entityId, {
      gstin: body.gstin,
      registrationState: body.registrationState,
      registrationType: body.registrationType,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo,
      isActive: body.isActive,
    });
    return NextResponse.json({ registration }, { status: 201 });
  } catch (error) {
    if (error instanceof EntityMasterArchitectureError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This GSTIN is already registered for that effective-from date." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "GST registration data changed while saving. Reload and try again." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create the Entity GST registration." }, { status: 500 });
  }
}
