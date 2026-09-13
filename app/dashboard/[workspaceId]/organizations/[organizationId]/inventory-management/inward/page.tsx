import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/purchase-order`);
}