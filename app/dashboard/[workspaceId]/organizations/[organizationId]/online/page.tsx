import { redirect } from "next/navigation";

export default async function OnlineModulePage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/online/online-store/manage`);
}
