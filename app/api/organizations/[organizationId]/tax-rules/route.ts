import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationTaxProfile, setOrganizationTaxProfile } from "@/lib/services/organizations/organization-tax-profile-service";

export async function GET(_request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const profile = await getOrganizationTaxProfile(organizationId, user.id);
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load tax rules." }, { status: 403 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ organizationId: string }> }) {
  try {
    const user = await requireSessionUser();
    const { organizationId } = await context.params;
    const body = await request.json();

    const profile = await setOrganizationTaxProfile(organizationId, user.id, {
      country: typeof body.country === "string" ? body.country : "IN",
      taxRegime: typeof body.taxRegime === "string" ? body.taxRegime : "GST",
      gstin: typeof body.gstin === "string" ? body.gstin : null,
      state: typeof body.state === "string" ? body.state : null,
      cgstRate: body.cgstRate == null ? null : Number(body.cgstRate),
      sgstRate: body.sgstRate == null ? null : Number(body.sgstRate),
      igstRate: body.igstRate == null ? null : Number(body.igstRate),
      vatRate: body.vatRate == null ? null : Number(body.vatRate),
      salesTaxRate: body.salesTaxRate == null ? null : Number(body.salesTaxRate),
      isDefault: body.isDefault !== false,
    });

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save tax rules." }, { status: 400 });
  }
}
