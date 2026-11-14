"use client";

import Link from "next/link";

import FinanceTransactionsReportPage from "../../_page-content/finance-transactions-report-page";
import Button from "@/components/ui/Button";

export default function SalesInvoicePage({
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
      title="Sales Invoices"
      documentType="SALES_INVOICE"
      storageKey={`credence-craft-finance-sales-invoices-${organizationId}`}
      headerActions={
        <Link href={`${base}/sales-invoice/new`}>
          <Button>New Sales Invoice</Button>
        </Link>
      }
    />
  );
}
