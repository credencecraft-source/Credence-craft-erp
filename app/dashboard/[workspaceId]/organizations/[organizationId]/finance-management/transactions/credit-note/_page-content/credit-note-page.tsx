"use client";

import FinanceTransactionsReportPage from "../../_page-content/finance-transactions-report-page";

export default function CreditNotePage({
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
      title="Credit Notes"
      documentType="CREDIT_NOTE"
      storageKey={`credence-craft-finance-credit-notes-${organizationId}`}
    />
  );
}
