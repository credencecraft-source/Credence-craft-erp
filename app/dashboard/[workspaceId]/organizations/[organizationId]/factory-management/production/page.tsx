import { redirect } from "next/navigation";

export default async function ProductionLegacyPage({
	params,
}: {
	params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
	const { workspaceId, organizationId } = await params;
	redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor`);
}
