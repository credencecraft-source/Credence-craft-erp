import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { createMasterValueForOrganization, getMasterValuesForOrganization, getMasterDefinition } from "@/lib/master-data/master-data-constants";
import { ORDER_LOOKUP_FIELDS } from "@/lib/master-data/master-data-definitions";

export async function GET(
  request: Request,
  context: { params: Promise<{ organizationId: string; moduleKey: string }> }
) {
  try {
    const { organizationId, moduleKey } = await context.params;
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") !== "false";
    const search = searchParams.get("search") || undefined;
    const requestedLimit = Number(searchParams.get("limit") || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 100;

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
      const lookupKeys = ["article", "entity", "category", "sub-category", "season", "color", "buyer", "brand", "size-group", "size", "raw-material-type", "raw-material-category", "raw-material-sub-category", "raw-material"];
      const lookupValues = await Promise.all(
        lookupKeys.map(async (key) => [
          key,
          await getMasterValuesForOrganization(organization.id, key, includeInactive, { limit }),
        ] as const),
      );
      const masterOptions = Object.fromEntries(lookupValues);
      const buyers = masterOptions.buyer;
      const seasons = masterOptions.season;
      const brands = masterOptions.brand;
      const articles = masterOptions.article;
      const colors = masterOptions.color;
      const sizes = masterOptions.size;
      const sizeGroups = masterOptions["size-group"].map((group) => ({
        ...group,
        sizes: sizes.filter((size) => size.parent_id === group.value_id || size.parent_id === group.id),
      }));
      const enrichedMasterOptions = { ...masterOptions, "size-group": sizeGroups };

      return NextResponse.json({
        masterOptions: enrichedMasterOptions,
        buyers,
        seasons,
        brands,
        articles,
        colors,
        sizeGroups,
        orderLookups: ORDER_LOOKUP_FIELDS,
      });
    }

    const values = await getMasterValuesForOrganization(organization.id, moduleKey, includeInactive, { search, limit });
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
    await requireOrganizationAccess(user.id, organization.id, ["OWNER", "ADMIN", "MERCHANDISING"]);
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

    const fields = body.fields && typeof body.fields === "object" ? body.fields : {};
    const missingRequiredField = definition.fields.some((field) => {
      if (!field.required) return false;
      const value = fields[field.key];
      return Array.isArray(value) ? value.length === 0 : value === null || value === undefined || String(value).trim() === "";
    });
    if (missingRequiredField) {
      return NextResponse.json({ error: `${definition.label} is missing a required field.` }, { status: 400 });
    }

    const newMasterValue = await createMasterValueForOrganization(organization.id, masterKey, {
      label: String(label).trim(),
      code: code ? String(code).trim() : null,
      description: description ? String(description).trim() : null,
      parentValueId: parentId || null,
      fields,
    });

    const multiLookupField = definition.fields.find((field) => field.type === "lookup" && field.multiple && field.lookupModuleKey);
    const selectedValues = multiLookupField ? fields[multiLookupField.key] : [];
    if (multiLookupField?.lookupModuleKey && Array.isArray(selectedValues)) {
      for (const selectedValue of [...new Set(selectedValues.map((value: unknown) => String(value).trim()).filter(Boolean))]) {
        await createMasterValueForOrganization(organization.id, multiLookupField.lookupModuleKey, {
          label: selectedValue,
          fields: { Size: selectedValue },
          parentValueId: newMasterValue.value_id,
        });
      }
    }

    return NextResponse.json(newMasterValue, { status: 201 });
  } catch (error: any) {
    console.error("Error creating master value:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}