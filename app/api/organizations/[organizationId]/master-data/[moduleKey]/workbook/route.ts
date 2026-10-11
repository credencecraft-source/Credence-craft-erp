import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import { createMasterRecordsTemplateWorkbook } from "@/lib/master-data/master-records-template-workbook";
import type {
  MasterWorkbookChildRecord,
  MasterWorkbookLookupOption,
  MasterWorkbookRecord,
} from "@/lib/master-data/master-records-template-workbook";
import type { MasterFieldDefinition } from "@/lib/master-data/master-data-models";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_ROWS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkbookRequest(value: unknown): value is {
  includeRecords: boolean;
  records: MasterWorkbookRecord[];
  fields: MasterFieldDefinition[];
  lookupOptions: Record<string, MasterWorkbookLookupOption[]>;
  childRecords: MasterWorkbookChildRecord[];
  moduleLabel: string;
} {
  if (!isRecord(value)
    || typeof value.includeRecords !== "boolean"
    || !Array.isArray(value.records)
    || !Array.isArray(value.fields)
    || !isRecord(value.lookupOptions)
    || !Array.isArray(value.childRecords)
    || typeof value.moduleLabel !== "string") return false;
  if (value.records.length > MAX_ROWS || value.fields.length > 100 || value.childRecords.length > MAX_ROWS) return false;
  if (!value.records.every(isRecord)
    || !value.fields.every((field) => isRecord(field)
      && typeof field.key === "string"
      && typeof field.label === "string"
      && typeof field.type === "string")
    || !value.childRecords.every(isRecord)) return false;
  return Object.values(value.lookupOptions).every((options) =>
    Array.isArray(options) && options.length <= MAX_ROWS && options.every(isRecord),
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string; moduleKey: string }> },
) {
  const { organizationId: organizationPublicId, moduleKey } = await context.params;
  try {
    const user = await getSessionUser();
    if (!user?.workspace_id) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    if (!/^[a-z0-9-]{1,80}$/i.test(moduleKey)) {
      return NextResponse.json({ error: "Master module key is invalid." }, { status: 400 });
    }
    const organization = await getOrganizationForUser(user.id, organizationPublicId);
    if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    try {
      await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Access denied:")) {
        return NextResponse.json({ error: "You do not have permission to export master data." }, { status: 403 });
      }
      throw error;
    }

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Workbook data exceeds the permitted size." }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Workbook request must contain valid JSON." }, { status: 400 });
    }
    if (!isWorkbookRequest(body)) {
      return NextResponse.json({ error: "Workbook request data is invalid." }, { status: 400 });
    }

    const bytes = await createMasterRecordsTemplateWorkbook({
      records: body.includeRecords ? body.records : [],
      fields: body.fields,
      lookupOptions: body.lookupOptions,
      childRecords: body.includeRecords ? body.childRecords : [],
      moduleLabel: body.moduleLabel.slice(0, 120),
    });
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${moduleKey}-master.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    console.error("Master workbook generation failed.");
    return NextResponse.json({ error: "Unable to generate the master workbook." }, { status: 500 });
  }
}
