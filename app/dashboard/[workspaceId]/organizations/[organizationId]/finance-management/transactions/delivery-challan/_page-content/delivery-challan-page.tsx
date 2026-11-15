"use client";

import FinanceTransactionsReportPage from "../../_page-content/finance-transactions-report-page";

export default function DeliveryChallanPage({
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
      title="Delivery Challans"
      documentType="DELIVERY_CHALLAN"
      storageKey={`credence-craft-finance-delivery-challans-${organizationId}`}
    />
  );
}
