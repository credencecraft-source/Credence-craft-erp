import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { createMasterValueForOrganization, getMasterValuesForOrganization, MASTER_DEFINITIONS } from "@/lib/master-data/master-data-constants";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { ORDER_LOOKUP_FIELDS } from "@/lib/master-data/master-data-definitions";
import { prisma } from "@/lib/database/prisma-client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");
    const includeInactive = searchParams.get("includeInactive") === "true";

    if (!organizationId) {
      return NextResponse.json({ error: "Organization id is required." }, { status: 400 });
    }

    const user = await requireSessionUser();

    if (!user.workspace_id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const organization = await getOrganizationForUser(user.id, organizationId);

    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    const masters = await Promise.all(MASTER_DEFINITIONS.map(async (definition) => ({
      module_key: definition.key,
      module_name: definition.label,
      fields: definition.fields,
      values: await getMasterValuesForOrganization(organization.id, definition.key, includeInactive),
    })));

    return NextResponse.json({ masters, orderLookups: ORDER_LOOKUP_FIELDS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch master data.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const organizationId = String(body.organizationId ?? body.organization_id ?? "");
    const moduleKey = String(body.moduleKey ?? body.masterKey ?? "");
    const label = String(body.label ?? "").trim();
    const code = String(body.code ?? "").trim();
    const description = String(body.description ?? "").trim();
    const rawFields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields as Record<string, unknown> : undefined;
    const fields = rawFields && Object.values(rawFields).every((value) => value === null || ["string", "number", "boolean"].includes(typeof value))
      ? rawFields as Record<string, string | number | boolean | null>
      : undefined;
    const parentValueId = body.parentValueId ? String(body.parentValueId) : null;

    if (!organizationId || !moduleKey || !label) {
      return NextResponse.json({ error: "Organization, master module, and name are required." }, { status: 400 });
    }

    const organization = await getOrganizationForUser(user.id, organizationId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }

    const definitionExists = MASTER_DEFINITIONS.some((definition) => definition.key === moduleKey);
    if (!definitionExists) {
      const dbDefinition = await (prisma as any).masterDefinition?.findFirst?.({
        where: { organizationId, moduleKey }
      });
      if (!dbDefinition) {
        return NextResponse.json({ error: "Master module not found." }, { status: 404 });
      }
    }

    const value = await createMasterValueForOrganization(organization.id, moduleKey, {
      label,
      code: code || null,
      description: description || null,
      fields,
      parentValueId,
    });

    return NextResponse.json({ ok: true, value }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create master value.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}