import CreditNotePage from "./_page-content/credit-note-page";

export default async function CreditNoteRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  return (
    <CreditNotePage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
