import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";
import { listWorkInProgress } from "@/lib/services/factory/production-wip-service";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const params = new URL(request.url).searchParams;
    const organizationId = params.get("organizationId") ?? "";
    const organization = await requireOrganizationContext(user.id, organizationId);
    await requireOrganizationPermission(user.id, organization.id, "VIEW_FACTORY_PRODUCTION");
    const limitValue = params.get("limit");
    const limit = limitValue ? Number(limitValue) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) throw new Error("WIP page size must be between 1 and 200.");
    const cursor = params.get("cursor")?.trim() || undefined;
    const processName = params.get("process")?.trim() || undefined;
    const result = await listWorkInProgress(organization.id, { cursor, limit, processName });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load work in progress.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Access denied:") ? 403 : 400 });
  }
}
