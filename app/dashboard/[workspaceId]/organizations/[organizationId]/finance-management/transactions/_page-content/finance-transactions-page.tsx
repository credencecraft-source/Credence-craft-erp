"use client";

import FinanceTransactionsReportPage from "./finance-transactions-report-page";

export default function FinanceTransactionsPage({
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
      title="Finance Transactions"
      storageKey={`credence-craft-finance-transactions-${organizationId}`}
      showAll
    />
  );
}
