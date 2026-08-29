import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth-session";
import { createOrganization, listOrganizationsForUser } from "@/lib/organizations/service";

export async function GET() {
  const user = await requireSessionUser();

  const organizations = await listOrganizationsForUser(user.id);

  return NextResponse.json({ organizations });
}

export async function POST(request: Request) {
  const user = await requireSessionUser();

  try {
    const body = await request.json();
    const created = await createOrganization({
      workspaceUserId: user.id,
      organizationName: body.organizationName,
      gstNumber: body.gstNumber,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      state: body.state,
      country: body.country,
      pinCode: body.pinCode,
    });

    return NextResponse.json({ ok: true, organization: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create organization.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
