import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { listWorkspaceOrganizationPage } from "@/lib/services/organizations/organization-service";
import { getMobileOrganizationModules } from "@/lib/services/organizations/mobile-organization-modules";
import { listActiveBusinessTypes } from "@/lib/services/platform/business-type-service";

export async function GET(request: Request) {
  const user = await requireSessionUser();
  const cursor = new URL(request.url).searchParams.get("cursor") || undefined;

  try {
    const [page, activeBusinessTypes] = await Promise.all([
      listWorkspaceOrganizationPage(user.id, cursor),
      listActiveBusinessTypes(),
    ]);
    return NextResponse.json({
      ...page,
      organizations: page.organizations.map((organization) => ({
        ...organization,
        business_types: activeBusinessTypes.map(({ name }) => name),
        business_modules: getMobileOrganizationModules(activeBusinessTypes),
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to load organizations." }, { status: 400 });
  }
}
