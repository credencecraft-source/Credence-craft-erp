import { redirect } from "next/navigation";

export default async function OnlineStoreRedirectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/online/online-store/manage`);
}
