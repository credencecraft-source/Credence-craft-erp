import { notFound } from "next/navigation";

import MasterDataEditorPage from "../../../../settings/master-data/[moduleKey]/master-data-editor-page";

export default async function MasterDataCreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await params;
  if (resolvedParams.moduleKey === "article") notFound();

  return (
    <MasterDataEditorPage
      params={Promise.resolve(resolvedParams)}
      searchParams={searchParams.then((query) => ({
        error: typeof query.error === "string" ? query.error : undefined,
      }))}
      formMode="create"
    />
  );
}
