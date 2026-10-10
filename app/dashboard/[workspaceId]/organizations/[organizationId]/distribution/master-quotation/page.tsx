import { redirect } from "next/navigation";

export default async function LegacyMasterQuotationPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  redirect(`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/distribution/sales-order`);
}
