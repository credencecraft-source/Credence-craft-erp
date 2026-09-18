import MasterDataEditorPage from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/settings/master-data/[moduleKey]/master-data-editor-page";

export default function DesignDevelopmentGoldSealsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  return MasterDataEditorPage({
    params: params.then(({ workspaceId, organizationId }) => ({
      workspaceId,
      organizationId,
      moduleKey: "gold-seal",
    })),
    searchParams,
  });
}
