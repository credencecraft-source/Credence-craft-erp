import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";

export async function getPageSetupTemplateRequestContext(request: Request) {
  const user = await requireSessionUser();
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId");
  const organizationId = url.searchParams.get("organizationId");

  if (!user.workspace_id || !workspaceId || workspaceId !== user.workspace_id) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Workspace access denied." }, { status: 403 }),
    };
  }
  if (!organizationId) {
    return {
      authorized: false as const,
      response: NextResponse.json({ error: "Organization ID is required." }, { status: 400 }),
    };
  }
  return { authorized: true as const, user, organizationId };
}
