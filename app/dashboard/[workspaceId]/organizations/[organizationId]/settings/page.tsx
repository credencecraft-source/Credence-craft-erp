import { redirect } from "next/navigation";

export default async function SettingsRedirectPage({
  params,
}: {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
}) {
  const { workspaceId, organizationId } = await params;

  redirect(
    `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan`
  );
}