import BarcodeQrCodeTemplatesPage from "./_page-content/barcode-qr-code-templates-page";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireOrganizationContext } from "@/lib/services/organizations/organization-service";

export default async function Page({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  if (!user.workspace_id || user.workspace_id !== workspaceId) {
    redirect(user.workspace_id ? `/dashboard/${user.workspace_id}/home` : "/");
  }
  await requireOrganizationContext(user.id, organizationId, ["OWNER", "ADMIN", "MERCHANDISING"]);
  const createHref = `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates/create`;

  return (
    <BarcodeQrCodeTemplatesPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      createHref={createHref}
      canManage
    />
  );
}
