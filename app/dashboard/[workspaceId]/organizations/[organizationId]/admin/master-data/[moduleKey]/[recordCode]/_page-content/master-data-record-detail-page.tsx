import ArticleEditorPage from "../../../article/_page-content/article-editor-page";
import SizeGroupRecordDetailPage from "./size-group-record-detail-page";

export default async function MasterDataRecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string; recordCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await params;
  if (resolvedParams.moduleKey === "size-group") {
    return <SizeGroupRecordDetailPage params={Promise.resolve(resolvedParams)} searchParams={searchParams} />;
  }
  return <ArticleEditorPage params={Promise.resolve(resolvedParams)} searchParams={searchParams} />;
}
