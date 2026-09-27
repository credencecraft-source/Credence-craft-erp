import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listWorkspaceOrganizationPage } from "@/lib/services/organizations/organization-service";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  const cursor = new URL(request.url).searchParams.get("cursor") || undefined;

  try {
    const page = await listWorkspaceOrganizationPage(user.id, cursor);
    return NextResponse.json(page, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load organizations." }, { status: 400 });
  }
}
