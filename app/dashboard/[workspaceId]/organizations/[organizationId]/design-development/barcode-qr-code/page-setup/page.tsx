import PageSetupTemplatesPage from "./_page-content/page-setup-templates-page";
import {
  canManagePageSetupTemplates,
  requirePageSetupTemplatePageAccess,
} from "@/lib/services/design-development/page-setup-template-page-access";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const { user, organization } = await requirePageSetupTemplatePageAccess(
    workspaceId,
    organizationId,
    "VIEW_REPORTS",
  );
  const canManage = await canManagePageSetupTemplates(user.id, organization.organizationId);

  return (
    <PageSetupTemplatesPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      canManage={canManage}
    />
  );
}
