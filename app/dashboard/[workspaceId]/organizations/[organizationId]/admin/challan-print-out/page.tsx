import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { listOrganizationPrintTemplates } from "@/lib/services/distribution/organization-print-template-service";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import ChallanPrintTemplateReportPage from "./_page-content/challan-print-template-report-page";

type SearchParams = Promise<{
  documentType?: string;
  saved?: string;
}>;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: SearchParams;
}) {
  const { workspaceId, organizationId } = await params;
  const search = await searchParams;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  await requireOrganizationContext(user.id, organizationId);
  try {
    await requireOrganizationPermission(user.id, organizationId, "ORGANIZATION_SETTINGS");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Access denied:")) {
      redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/access-blocked?message=${encodeURIComponent("Organization settings permission is required to manage print templates.")}`);
    }
    throw error;
  }
  const templates = await listOrganizationPrintTemplates(user.id, organizationId);
  const initialDocumentType = search.documentType === "QUOTATION"
    ? "QUOTATION"
    : search.documentType === "POS_INVOICE"
      ? "POS_INVOICE"
      : "SALES_ORDER";

  return (
    <ChallanPrintTemplateReportPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      initialTemplates={templates}
      initialDocumentType={initialDocumentType}
      confirmationName={search.saved}
    />
  );
}
