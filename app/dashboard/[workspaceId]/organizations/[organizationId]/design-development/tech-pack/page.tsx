import { redirect } from "next/navigation";

export default async function TechPackPage({
	params,
}: {
	params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
	const { workspaceId, organizationId } = await params;
	redirect(
		`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/tech-pack/gold-seals`,
	);
}
