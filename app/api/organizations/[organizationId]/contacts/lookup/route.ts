import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { listContactLookupOptions } from "@/lib/services/master-data/contact-master-service";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const user = await getSessionUser();
    if (!user?.workspace_id) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    const { organizationId: publicOrganizationId } = await context.params;
    const organization = await requireOrganizationContext(
      user.id,
      publicOrganizationId,
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.get("all") === "true") {
      return NextResponse.json(await listContactLookupOptions(
        organization.id,
        undefined,
        { all: true },
      ));
    }
    const rawLimit = Number(searchParams.get("limit") ?? 200);
    const rawOffset = Number(searchParams.get("offset") ?? 0);
    if (
      !Number.isSafeInteger(rawLimit) ||
      rawLimit < 1 ||
      rawLimit > 200 ||
      !Number.isSafeInteger(rawOffset) ||
      rawOffset < 0
    ) {
      return NextResponse.json({ error: "Contact lookup pagination is invalid." }, { status: 400 });
    }

    return NextResponse.json(await listContactLookupOptions(
      organization.id,
      undefined,
      { skip: rawOffset, take: rawLimit },
    ));
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to load contact lookup options because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      return NextResponse.json({ error: "You do not have access to contacts for this organization." }, { status: 403 });
    }
    console.error("Unable to load organization contact lookup options.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load contacts for this organization." }, { status: 500 });
  }
}
