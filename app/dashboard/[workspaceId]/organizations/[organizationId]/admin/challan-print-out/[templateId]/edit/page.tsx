import { notFound, redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationPrintTemplate } from "@/lib/services/distribution/organization-print-template-service";
import {
  requireOrganizationContext,
  requireOrganizationPermission,
} from "@/lib/services/organizations/organization-service";
import ChallanPrintTemplateFormPage from "../../_page-content/challan-print-template-form-page";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; templateId: string }>;
}) {
  const { workspaceId, organizationId, templateId } = await params;
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
  const template = await getOrganizationPrintTemplate(user.id, organizationId, templateId);
  if (!template) notFound();

  return (
    <ChallanPrintTemplateFormPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      initialDocumentType={template.documentType}
      template={template}
    />
  );
}
