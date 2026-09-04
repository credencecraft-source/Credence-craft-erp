import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { createMasterValueForOrganization, getMasterDefinition } from "@/lib/master-data/master-data-constants";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId");

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

    const body = await req.json();

    const masterKey = body.masterKey || body.moduleKey || body.masterId || body.key;
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