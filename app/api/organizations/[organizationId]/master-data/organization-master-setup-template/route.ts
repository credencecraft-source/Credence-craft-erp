import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { createOrganizationMasterSetupWorkbook } from "@/lib/services/master-data/organization-master-setup-workbook-service";
import type { OrganizationMasterSetupStage } from "@/lib/master-data/organization-master-setup-stages";

const ALLOWED_STAGES = new Set<OrganizationMasterSetupStage>(["independent", "related", "third"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    if (!user.workspace_id || !workspaceId || user.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
    }
    const stage = url.searchParams.get("step") as OrganizationMasterSetupStage | null;
    if (!stage || !ALLOWED_STAGES.has(stage)) {
      return NextResponse.json({ error: "A valid setup step is required." }, { status: 400 });
    }
    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

    const workbook = await createOrganizationMasterSetupWorkbook(organization.id, stage);
    const stepNumber = stage === "independent" ? "1" : stage === "related" ? "2" : "3";
    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="organization-master-setup-step-${stepNumber}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    if (error instanceof Error && error.message.toLowerCase().includes("access denied")) {
      return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
    }
    console.error("Unable to create organization master setup workbook.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Unable to create the Excel template. Please try again." }, { status: 500 });
  }
}
