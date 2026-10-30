import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  listDistributorDealers,
  removeDistributorDealer,
  replaceDistributorDealers,
} from "@/lib/services/master-data/distributor-dealer-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

async function authorizedContext(organizationPublicId: string) {
  const user = await getSessionUser();
  if (!user?.workspace_id) return null;
  const organization = await requireOrganizationContext(
    user.id,
    organizationPublicId,
    ["OWNER", "ADMIN", "MERCHANDISING"],
  );
  return { user, organization };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string }> },
) {
  void request;
  try {
    const { organizationId, contactId } = await context.params;
    const auth = await authorizedContext(organizationId);
    if (!auth) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    return NextResponse.json(await listDistributorDealers(auth.organization.id, contactId));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to load Distributor Dealers.",
    }, { status: 400 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string }> },
) {
  try {
    const { organizationId, contactId } = await context.params;
    const auth = await authorizedContext(organizationId);
    if (!auth) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const body = await request.json() as { dealerIds?: unknown };
    if (!Array.isArray(body.dealerIds) || body.dealerIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "Dealer IDs must be provided as an array." }, { status: 400 });
    }
    const result = await replaceDistributorDealers(
      auth.organization.id,
      auth.user.id,
      contactId,
      body.dealerIds,
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to save Distributor Dealers.",
    }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ organizationId: string; contactId: string }> },
) {
  try {
    const { organizationId, contactId } = await context.params;
    const auth = await authorizedContext(organizationId);
    if (!auth) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const body = await request.json() as { dealerId?: unknown };
    if (typeof body.dealerId !== "string" || !body.dealerId.trim()) {
      return NextResponse.json({ error: "Dealer ID is required." }, { status: 400 });
    }
    const result = await removeDistributorDealer(
      auth.organization.id,
      auth.user.id,
      contactId,
      body.dealerId.trim(),
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unable to remove the Distributor Dealer.",
    }, { status: 400 });
  }
}
