import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";
import { listFactoryProductionCompletionReport } from "@/lib/services/factory/factory-production-completion-report-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const params = new URL(request.url).searchParams;
    const organization = await requireOrganizationContext(user.id, params.get("organizationId") ?? "");
    const cursor = params.get("cursor")?.trim() || undefined;
    const result = await listFactoryProductionCompletionReport(organization.id, { cursor });
    return NextResponse.json(result);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      console.error("Unable to load the factory production report because the database is unavailable.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load the factory production report." },
      { status: 400 },
    );
  }
}
