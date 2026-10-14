import ArticleEditorPage from "../_page-content/article-editor-page";

export default function CreateArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ArticleEditorPage params={params} searchParams={searchParams} />;
}
