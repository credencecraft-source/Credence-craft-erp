import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailableError,
} from "@/lib/database/database-errors";
import {
  getActiveOrganizationDummyDataBatch,
  getMasterDefinition,
  getMasterValuesForOrganization,
  getSizeGroupSizesForOrganization,
} from "@/lib/master-data/master-data-constants";
import { createMasterRecordsTemplateWorkbook } from "@/lib/master-data/master-records-template-workbook";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ organizationId: string; moduleKey: string }> },
) {
  try {
    const { organizationId: organizationPublicId, moduleKey } = await context.params;
    if (!/^[a-z0-9-]{1,80}$/i.test(moduleKey)) {
      return NextResponse.json({ error: "Master module key is invalid." }, { status: 400 });
    }

    const user = await getSessionUser();
    if (!user?.workspace_id) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }
    const organization = await getOrganizationForUser(user.id, organizationPublicId);
    if (!organization) {
      return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    }
    try {
      await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Access denied:")) {
        return NextResponse.json({ error: "You do not have permission to export master data." }, { status: 403 });
      }
      throw error;
    }

    const definition = getMasterDefinition(moduleKey);
    if (!definition || definition.hidden) {
      return NextResponse.json({ error: "Master module not found." }, { status: 404 });
    }

    const lookupKeys = [...new Set(definition.fields.flatMap((field) => [
      ...(field.lookupModuleKey ? [field.lookupModuleKey] : []),
      ...(field.childFields ?? []).flatMap((child) => child.lookupModuleKey ? [child.lookupModuleKey] : []),
    ]))];
    const activeDummyDataBatch = getActiveOrganizationDummyDataBatch(organization.id);
    const lookupOptions = Object.fromEntries(await Promise.all(lookupKeys.map(async (lookupKey) => {
      if (lookupKey === "article-size") {
        const sizeLinks = await getSizeGroupSizesForOrganization(organization.id, undefined, true);
        return [lookupKey, sizeLinks.map(({ groupId, size }) => ({
          id: `${groupId}:${size.id}`,
          value_id: size.value_id,
          label: size.label,
          parent_id: groupId,
        }))];
      }
      const values = await getMasterValuesForOrganization(organization.id, lookupKey, true, {
        includeDummyData: true,
        activeDummyDataBatch,
      });
      return [lookupKey, values.map(({ id, value_id, label, parent_id }) => ({
        id,
        value_id,
        label,
        parent_id,
      }))];
    })));
    const bytes = await createMasterRecordsTemplateWorkbook({
      records: [],
      fields: definition.fields,
      lookupOptions,
      childRecords: [],
      moduleLabel: definition.label,
    });

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${definition.key}-master-template.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    console.error("Master template generation failed.");
    return NextResponse.json({ error: "Unable to generate the master template." }, { status: 500 });
  }
}
