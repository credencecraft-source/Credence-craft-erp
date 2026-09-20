import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listChallanNumberConfigurations, updateChallanNumberConfiguration } from "@/lib/services/organizations/challan-number-configuration-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId);
    return NextResponse.json({ configurations: await listChallanNumberConfigurations(organization.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load challan number settings." }, { status: 403 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const organization = await requireOrganizationContext(user.id, organizationId);
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.documentType !== "string") return NextResponse.json({ error: "Document type is required." }, { status: 400 });
    const configuration = await updateChallanNumberConfiguration(organization.id, user.id, body.documentType, { prefix: body.prefix, startNumber: body.startNumber });
    return NextResponse.json({ configuration });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save challan number settings." }, { status: 400 });
  }
}
