import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailableError } from "@/lib/database/database-errors";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import {
  createFinishedGoodsCategoryHierarchy,
  FinishedGoodsCategoryHierarchyError,
} from "@/lib/services/master-data/finished-goods-category-hierarchy-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  try {
    const { organizationId: publicOrganizationId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    if (!user.workspace_id || !workspaceId || user.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });
    }
    const organization = await getOrganizationForUser(user.id, publicOrganizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Finished Goods Category hierarchy details are invalid." }, { status: 400 });
    }
    if (!isRecord(body)
      || Object.keys(body).some((key) => !["productType", "existingCategory", "category", "subcategory"].includes(key))
      || (typeof body.productType !== "string" || body.productType.length > 255)
      || (body.existingCategory !== undefined
        && (typeof body.existingCategory !== "string" || body.existingCategory.length > 255))
      || ["category", "subcategory"].some((key) =>
        typeof body[key] !== "string" || body[key].trim().length === 0 || body[key].length > 255)
      || (!body.productType.trim() && (typeof body.existingCategory !== "string" || !body.existingCategory.trim()))) {
      return NextResponse.json({ error: "Finished Goods Category hierarchy details are invalid." }, { status: 400 });
    }

    const result = await createFinishedGoodsCategoryHierarchy({
      organizationId: organization.id,
      actorUserId: user.id,
      productType: body.productType as string,
      existingCategory: typeof body.existingCategory === "string" ? body.existingCategory : undefined,
      category: body.category as string,
      subcategory: body.subcategory as string,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FinishedGoodsCategoryHierarchyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message.toLowerCase().includes("access denied")) {
      return NextResponse.json({ error: "Organization access denied." }, { status: 403 });
    }
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Unable to create Finished Goods Category hierarchy.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create the Finished Goods Category hierarchy." },
      { status: 500 },
    );
  }
}
