"use client";

import Link from "next/link";

import FinanceTransactionsReportPage from "../../_page-content/finance-transactions-report-page";
import Button from "@/components/ui/Button";

export default function PurchaseInvoicePage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management/transactions`;
  return (
    <FinanceTransactionsReportPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      title="Purchase Invoices"
      documentType="PURCHASE_BILL"
      storageKey={`credence-craft-finance-purchase-invoices-${organizationId}`}
      headerActions={
        <Link href={`${base}/purchase-invoice/new`}>
          <Button>New Purchase Bill</Button>
        </Link>
      }
    />
  );
}
