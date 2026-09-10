import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { createMasterValueForOrganization, getMasterValuesForOrganization, getMasterDefinition } from "@/lib/master-data/master-data-constants";
import { ORDER_LOOKUP_FIELDS } from "@/lib/master-data/master-data-definitions";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; moduleKey: string }> }
) {
  try {
    const { organizationId, moduleKey } = await context.params;
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";

    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    const user = await requireSessionUser();
    if (!user.workspace_id) {
      return NextResponse.json({ error: "Unauthorized user workspace" }, { status: 401 });
    }

    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    if (moduleKey === "order-lookups") {
      const [buyers, seasons, brands, articles, colors, sizeGroups] = await Promise.all([
        getMasterValuesForOrganization(organization.id, "buyer", includeInactive),
        getMasterValuesForOrganization(organization.id, "season", includeInactive),
        getMasterValuesForOrganization(organization.id, "brand", includeInactive),
        getMasterValuesForOrganization(organization.id, "article", includeInactive),
        getMasterValuesForOrganization(organization.id, "color", includeInactive),
        getMasterValuesForOrganization(organization.id, "size-group", includeInactive),
      ]);

      return NextResponse.json({
        buyers,
        seasons,
        brands,
        articles,
        colors,
        sizeGroups,
        orderLookups: ORDER_LOOKUP_FIELDS,
      });
    }

    const values = await getMasterValuesForOrganization(organization.id, moduleKey, includeInactive);
    return NextResponse.json(values);
  } catch (error: any) {
    console.error("Error fetching master data:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; moduleKey: string }> }
) {
  try {
    const { organizationId: routeOrgId, moduleKey: routeModuleKey } = await context.params;
    const url = new URL(request.url);
    const organizationId = routeOrgId || url.searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    const user = await requireSessionUser();
    if (!user.workspace_id) {
      return NextResponse.json({ error: "Unauthorized user workspace" }, { status: 401 });
    }

    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const body = await request.json();
    const masterKey = routeModuleKey || body.masterKey || body.moduleKey || body.masterId || body.key;
    const label = body.label || body.name;
    const code = body.code;
    const description = body.description;
    const parentId = body.parentId || body.parentValueId;

    if (!masterKey || !label) {
      return NextResponse.json({ error: "Master key and label are required", received: body }, { status: 400 });
    }

    const definition = getMasterDefinition(masterKey);
    if (!definition) {
      return NextResponse.json({ error: `Invalid master definition for key: ${masterKey}` }, { status: 400 });
    }

    const newMasterValue = await createMasterValueForOrganization(organization.id, masterKey, {
      label: String(label).trim(),
      code: code ? String(code).trim() : null,
      description: description ? String(description).trim() : null,
      parentValueId: parentId || null,
      fields: body.fields || {},
    });

    return NextResponse.json(newMasterValue, { status: 201 });
  } catch (error: any) {
    console.error("Error creating master value:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}