import PageSetupTemplateFormPage from "../_page-content/page-setup-template-form-page";
import { requirePageSetupTemplatePageAccess } from "@/lib/services/design-development/page-setup-template-page-access";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  await requirePageSetupTemplatePageAccess(workspaceId, organizationId, "MANAGE_MASTER_DATA");
  return (
    <PageSetupTemplateFormPage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
