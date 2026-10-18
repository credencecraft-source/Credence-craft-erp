import ArticleEditorPage from "../../../article/_page-content/article-editor-page";
import MasterDataEditorPage from "../../../../../settings/master-data/[moduleKey]/master-data-editor-page";
import SizeGroupRecordDetailPage from "./size-group-record-detail-page";
import { getMasterRecordDetailMode } from "@/lib/master-data/master-record-detail-mode";

export default async function MasterDataRecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string; recordCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [resolvedParams, query] = await Promise.all([params, searchParams]);
  const formMode = getMasterRecordDetailMode(query.mode);
  if (resolvedParams.moduleKey === "size-group") {
    return <SizeGroupRecordDetailPage
      params={Promise.resolve(resolvedParams)}
      searchParams={Promise.resolve(query)}
      readOnly={formMode === "view"}
    />;
  }
  if (resolvedParams.moduleKey === "article") {
    return <ArticleEditorPage params={Promise.resolve(resolvedParams)} searchParams={Promise.resolve(query)} />;
  }
  return (
    <MasterDataEditorPage
      params={Promise.resolve(resolvedParams)}
      searchParams={Promise.resolve({
        error: typeof query.error === "string" ? query.error : undefined,
        saved: typeof query.saved === "string" ? query.saved : undefined,
      })}
      formMode={formMode}
      recordCode={resolvedParams.recordCode}
    />
  );
}
