import DebitNotePage from "./_page-content/debit-note-page";

export default async function DebitNoteRoute({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;

  return (
    <DebitNotePage
      workspaceId={workspaceId}
      organizationId={organizationId}
    />
  );
}
