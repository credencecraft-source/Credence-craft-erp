import { redirect } from "next/navigation";

export default async function LegacyMasterQuotationDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; masterQuotationId: string }>;
}) {
  const { workspaceId, organizationId, masterQuotationId } = await params;
  redirect(`/dashboard/${encodeURIComponent(workspaceId)}/organizations/${encodeURIComponent(organizationId)}/advance-booking/sales-order/${encodeURIComponent(masterQuotationId)}`);
}
