import PageSetupTemplateDetailPage from "../_page-content/page-setup-template-detail-page";
import {
  canManagePageSetupTemplates,
  requirePageSetupTemplatePageAccess,
} from "@/lib/services/design-development/page-setup-template-page-access";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; templateId: string }>;
}) {
  const { workspaceId, organizationId, templateId } = await params;
  const { user, organization } = await requirePageSetupTemplatePageAccess(
    workspaceId,
    organizationId,
    "VIEW_REPORTS",
  );
  const canManage = await canManagePageSetupTemplates(user.id, organization.organizationId);
  return (
    <PageSetupTemplateDetailPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      templateId={templateId}
      canManage={canManage}
    />
  );
}
