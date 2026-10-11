import { redirect } from "next/navigation";

export default async function LegacyAdminOrganizationMasterSetupPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  redirect(
    `/dashboard/${workspaceId}/organizations/${organizationId}/admin/migration/direct`,
  );
}
