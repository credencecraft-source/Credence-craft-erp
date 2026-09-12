import { redirect } from "next/navigation";

export default async function LegacyClientDetailsPage({
	params,
}: {
	params: Promise<{ organizationId: string }>;
}) {
	const { organizationId } = await params;
	redirect(`/platform/organisations/${organizationId}`);
}