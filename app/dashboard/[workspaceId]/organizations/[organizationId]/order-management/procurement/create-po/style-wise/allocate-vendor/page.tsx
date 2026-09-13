import { redirect } from "next/navigation";

export default async function AllocateVendorPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement/create-po/style-wise`);
}