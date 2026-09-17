import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/database/prisma-client";
import { requireOrganizationAccess } from "@/lib/services/organizations/organization-service";

export type OrganizationTaxProfileInput = {
  country?: string | null;
  taxRegime?: string | null;
  gstin?: string | null;
  state?: string | null;
  cgstRate?: number | null;
  sgstRate?: number | null;
  igstRate?: number | null;
  vatRate?: number | null;
  salesTaxRate?: number | null;
  isDefault?: boolean;
};

function isMissingTableError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message || "";
  return message.includes("does not exist") || message.includes("P2021") || message.includes("table") && message.includes("public");
}

export async function getOrganizationTaxProfile(organizationId: string, workspaceUserId: string) {
  await requireOrganizationAccess(workspaceUserId, organizationId);

  try {
    const profile = await prisma.organizationTaxProfile.findFirst({
      where: { organization_id: organizationId, is_active: true, is_default: true },
      orderBy: { updated_at: "desc" },
    });

    if (!profile) {
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }
    throw error;
  }
}

export async function setOrganizationTaxProfile(organizationId: string, workspaceUserId: string, input: OrganizationTaxProfileInput) {
  await requireOrganizationAccess(workspaceUserId, organizationId, ["OWNER", "ADMIN", "FINANCE"]);

  const country = String(input.country || "IN").trim().toUpperCase();
  const taxRegime = String(input.taxRegime || "GST").trim().toUpperCase();
  const validRegimes = ["GST", "VAT", "SALES_TAX", "NONE"];
  if (!validRegimes.includes(taxRegime)) {
    throw new Error("Select a valid tax regime.");
  }

  try {
    const profile = await prisma.$transaction(async (transaction) => {
      if (input.isDefault !== false) {
        await transaction.organizationTaxProfile.updateMany({
          where: { organization_id: organizationId, is_active: true },
          data: { is_default: false },
        });
      }

      const existing = await transaction.organizationTaxProfile.findFirst({
        where: { organization_id: organizationId, country, tax_regime: taxRegime, is_active: true },
      });

      if (existing) {
        return transaction.organizationTaxProfile.update({
          where: { id: existing.id },
          data: {
            gstin: input.gstin ?? existing.gstin,
            state: input.state ?? existing.state,
            cgst_rate: input.cgstRate == null ? existing.cgst_rate : input.cgstRate,
            sgst_rate: input.sgstRate == null ? existing.sgst_rate : input.sgstRate,
            igst_rate: input.igstRate == null ? existing.igst_rate : input.igstRate,
            vat_rate: input.vatRate == null ? existing.vat_rate : input.vatRate,
            sales_tax_rate: input.salesTaxRate == null ? existing.sales_tax_rate : input.salesTaxRate,
            is_default: input.isDefault !== false,
            is_active: true,
          },
        });
      }

      return transaction.organizationTaxProfile.create({
        data: {
          id: randomUUID(),
          organization_id: organizationId,
          country,
          tax_regime: taxRegime,
          gstin: input.gstin ?? null,
          state: input.state ?? null,
          cgst_rate: input.cgstRate ?? null,
          sgst_rate: input.sgstRate ?? null,
          igst_rate: input.igstRate ?? null,
          vat_rate: input.vatRate ?? null,
          sales_tax_rate: input.salesTaxRate ?? null,
          is_default: input.isDefault !== false,
          is_active: true,
        },
      });
    });

    return {
      id: profile.id,
      country: profile.country,
      taxRegime: profile.tax_regime,
      gstin: profile.gstin,
      state: profile.state,
      cgstRate: profile.cgst_rate ? Number(profile.cgst_rate) : null,
      sgstRate: profile.sgst_rate ? Number(profile.sgst_rate) : null,
      igstRate: profile.igst_rate ? Number(profile.igst_rate) : null,
      vatRate: profile.vat_rate ? Number(profile.vat_rate) : null,
      salesTaxRate: profile.sales_tax_rate ? Number(profile.sales_tax_rate) : null,
      isDefault: profile.is_default,
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      throw new Error("Tax rule table is not available yet. Run the Prisma migration to create organization tax profiles.");
    }
    throw error;
  }
}
