import type { OrganizationPrintDocumentType } from "@prisma/client";
import {
  parseOrganizationPrintTemplateDesign,
  type OrganizationPrintTemplateDesign,
} from "./organization-print-template-contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function fetchDefaultOrganizationPrintTemplateDesign(
  workspaceId: string,
  organizationId: string,
  documentType: OrganizationPrintDocumentType,
): Promise<OrganizationPrintTemplateDesign | null> {
  const query = new URLSearchParams({ workspaceId, organizationId, defaultFor: documentType });
  const response = await fetch(`/api/organizations/print-templates?${query}`, { cache: "no-store" });
  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new Error("The print-template service returned an invalid response.");
  }
  if (!response.ok) {
    const message = isRecord(responseBody) && typeof responseBody.error === "string"
      ? responseBody.error
      : "Unable to load the default print template.";
    throw new Error(message);
  }
  if (!isRecord(responseBody) || !("designConfig" in responseBody)) {
    throw new Error("The print-template service returned an incomplete response.");
  }
  return responseBody.designConfig === null
    ? null
    : parseOrganizationPrintTemplateDesign(responseBody.designConfig);
}
