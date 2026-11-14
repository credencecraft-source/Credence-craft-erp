"use client";

import FinanceTransactionsReportPage from "../../_page-content/finance-transactions-report-page";

export default function DebitNotePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  return (
    <FinanceTransactionsReportPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      title="Debit Notes"
      documentType="DEBIT_NOTE"
      storageKey={`credence-craft-finance-debit-notes-${organizationId}`}
    />
  );
}
