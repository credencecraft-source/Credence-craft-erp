import { redirect } from "next/navigation";

export default async function PosPurchaseAliasRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  redirect(
    `/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/pos/purchase-bill`,
  );
}
