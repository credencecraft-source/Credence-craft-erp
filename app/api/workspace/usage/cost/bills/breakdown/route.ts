import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  getTenantUsageDailyCostBreakdown,
  TenantUsageBillMonthError,
} from "@/lib/services/workspace/tenant-usage-billing-service";

export const maxDuration = 10;

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    const workspaceId = params.get("workspaceId");
    const organizationId = params.get("organizationId");
    const month = params.get("month");
    if (!workspaceId || workspaceId !== user.workspace_id) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    if (!organizationId || !month) {
      return NextResponse.json({ error: "Organization and month are required." }, { status: 400 });
    }

    const result = await getTenantUsageDailyCostBreakdown({
      workspaceUserId: user.id,
      publicOrganizationId: organizationId,
      month,
    });
    if (!result) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof TenantUsageBillMonthError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Unable to load daily server cost breakdown.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to load daily server cost breakdown." }, { status: 500 });
  }
}
