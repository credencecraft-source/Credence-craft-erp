import ArticleEditorPage from "../../../article/_page-content/article-editor-page";

export default function MasterDataRecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string; recordCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ArticleEditorPage params={params} searchParams={searchParams} />;
}
