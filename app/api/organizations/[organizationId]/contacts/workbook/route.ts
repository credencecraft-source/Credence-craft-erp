import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { createContactWorkbook } from "@/lib/master-data/contact-records-workbook-generator";
import type { ContactWorkbookRecord } from "@/lib/master-data/contact-records-workbook-parser";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_CONTACTS = 5_000;
const MAX_RELATED_ROWS = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContactRecord(value: unknown): value is ContactWorkbookRecord {
  if (!isRecord(value)) return false;
  return typeof value.code === "string"
    && typeof value.legal_name === "string"
    && Array.isArray(value.roles)
    && Array.isArray(value.tax_registrations)
    && Array.isArray(value.addresses)
    && Array.isArray(value.bank_accounts);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ organizationId: string }> },
) {
  const { organizationId: organizationPublicId } = await context.params;
  try {
    const user = await getSessionUser();
    if (!user?.workspace_id) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const organization = await getOrganizationForUser(user.id, organizationPublicId);
    if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
    try {
      await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Access denied:")) {
        return NextResponse.json({ error: "You do not have permission to export contacts." }, { status: 403 });
      }
      throw error;
    }

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Contact workbook data exceeds the permitted size." }, { status: 413 });
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json({ error: "Workbook request must contain valid JSON." }, { status: 400 });
    }
    if (!isRecord(body) || !Array.isArray(body.contacts) || body.contacts.length > MAX_CONTACTS
      || !body.contacts.every(isContactRecord)) {
      return NextResponse.json({ error: "Contact workbook data is invalid." }, { status: 400 });
    }
    const relatedRows = body.contacts.reduce((total, contact) =>
      total + contact.tax_registrations.length + contact.addresses.length + contact.bank_accounts.length,
    0);
    if (relatedRows > MAX_RELATED_ROWS) {
      return NextResponse.json({ error: "Contact workbook contains too many related records." }, { status: 413 });
    }

    const roles = await prisma.contactRoleDefinition.findMany({
      where: { is_active: true },
      select: { code: true },
      orderBy: { code: "asc" },
    });
    const bytes = await createContactWorkbook(body.contacts, roles.map((role) => role.code));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="unified-contact-master.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch {
    console.error("Contact workbook generation failed.");
    return NextResponse.json({ error: "Unable to generate the contact workbook." }, { status: 500 });
  }
}
