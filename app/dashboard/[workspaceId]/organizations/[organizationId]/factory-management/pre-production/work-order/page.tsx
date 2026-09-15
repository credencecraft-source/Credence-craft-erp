import { redirect } from "next/navigation";

export default async function WorkOrderLegacyPage({
	params,
}: {
	params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
	const { workspaceId, organizationId } = await params;
	redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard`);
}
