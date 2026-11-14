import Link from "next/link";
import { notFound } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requireSessionUser } from "@/lib/auth/session-manager";
import FinanceTransactionSyncActions from "./finance-transaction-sync-actions";
import {
  getCentralFinanceTransaction,
} from "@/lib/services/finance/central-finance-query-service";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";

function currency(value: string, currencyCode: string) {
  const [whole, fraction = "00"] = value.split(".");
  const groupedWhole = new Intl.NumberFormat("en-IN").format(BigInt(whole));
  const currencySymbol = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode,
  }).formatToParts(0).find((part) => part.type === "currency")?.value ?? currencyCode;
  return `${currencySymbol}${groupedWhole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function sourceHref(
  workspaceId: string,
  organizationId: string,
  sourceType: string,
  sourceId: string,
  sourceDocumentNumber: string,
) {
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos`;
  if (sourceType === "POS_SALES_INVOICE") {
    return `${base}/invoice/${encodeURIComponent(sourceDocumentNumber)}`;
  }
  if (sourceType === "POS_PURCHASE_BILL") {
    return `${base}/purchase-bill/${encodeURIComponent(sourceId)}`;
  }
  if (sourceType === "POS_SALES_RETURN") {
    return `${base}/sales-return/records/${encodeURIComponent(sourceDocumentNumber)}`;
  }
  return null;
}

export default async function CentralFinanceTransactionDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; transactionId: string }>;
}) {
  const { workspaceId, organizationId: publicOrganizationId, transactionId } = await params;
  const user = await requireSessionUser();
  const organization = await requireFinanceOrganizationAccess(user.id, publicOrganizationId);
  const transaction = await getCentralFinanceTransaction(organization.id, transactionId);
  if (!transaction) notFound();

  const upstreamHref = sourceHref(
    workspaceId,
    publicOrganizationId,
    transaction.sourceType,
    transaction.sourceId,
    transaction.sourceDocumentNumber,
  );
  const reportHref = `/dashboard/${workspaceId}/organizations/${publicOrganizationId}/finance-management/transactions`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--erp-brand)]">Finance transaction</p>
            <h1 className="mt-1 text-2xl font-semibold">{transaction.documentNumber}</h1>
            <p className="mt-2 text-sm text-[var(--erp-text-muted)]">
              {transaction.documentType.replaceAll("_", " ")} · {transaction.documentDate}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge>{transaction.status}</Badge>
            <Link href={reportHref}>
              <Button variant="outline">Back to report</Button>
            </Link>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <p className="text-sm text-[var(--erp-text-muted)]">Party</p>
            <p className="mt-2 font-semibold">{transaction.partyName}</p>
          </Card>
          <Card>
            <p className="text-sm text-[var(--erp-text-muted)]">Source</p>
            <p className="mt-2 font-semibold">{transaction.sourceModule.replaceAll("_", " ")}</p>
            <p className="mt-1 text-xs text-[var(--erp-text-muted)]">{transaction.sourceType.replaceAll("_", " ")}</p>
          </Card>
          <Card>
            <p className="text-sm text-[var(--erp-text-muted)]">Taxable amount</p>
            <p className="mt-2 font-semibold">{currency(transaction.taxableAmount, transaction.currencyCode)}</p>
          </Card>
          <Card>
            <p className="text-sm text-[var(--erp-text-muted)]">Document total</p>
            <p className="mt-2 font-semibold">{currency(transaction.totalAmount, transaction.currencyCode)}</p>
          </Card>
        </div>

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Source and synchronization</h2>
            <Badge>{transaction.syncStatus.replaceAll("_", " ")}</Badge>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-[var(--erp-text-muted)]">Source document</dt>
              <dd className="mt-1 font-medium">{transaction.sourceDocumentNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--erp-text-muted)]">Provider</dt>
              <dd className="mt-1 font-medium">{transaction.externalProvider.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--erp-text-muted)]">Entity</dt>
              <dd className="mt-1 font-medium">{transaction.entityName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--erp-text-muted)]">Posted</dt>
              <dd className="mt-1 font-medium">{transaction.postedAt ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--erp-text-muted)]">Sub-source</dt>
              <dd className="mt-1 font-medium">{transaction.subSource.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--erp-text-muted)]">Created by</dt>
              <dd className="mt-1 font-medium">{transaction.createdByEmail ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--erp-text-muted)]">Created</dt>
              <dd className="mt-1 font-medium">{transaction.createdAt}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--erp-text-muted)]">Place of supply</dt>
              <dd className="mt-1 font-medium">{transaction.placeOfSupplyStateCode ?? "—"}</dd>
            </div>
          </dl>
          {upstreamHref && (
            <Link className="inline-flex text-sm font-medium text-[var(--erp-brand)] underline" href={upstreamHref}>
              Open source record
            </Link>
          )}
          {transaction.syncError && (
            <p role="status" className="text-sm text-[var(--erp-danger)]">
              {transaction.syncError.code}: {transaction.syncError.message}
            </p>
          )}
          {transaction.syncStatus === "FAILED" && transaction.externalProvider !== "NONE" && (
            <FinanceTransactionSyncActions
              organizationId={publicOrganizationId}
              transactionId={transaction.id}
            />
          )}
        </Card>

        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Financial lines</h2>
          {transaction.lines.length > 0 ? (
            <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Description</th>
                  <th scope="col">HSN</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Rate</th>
                  <th scope="col">Taxable</th>
                  <th scope="col">CGST</th>
                  <th scope="col">SGST</th>
                  <th scope="col">IGST</th>
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {transaction.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.lineNumber}</td>
                    <td>{line.description}</td>
                    <td>{line.hsnCode ?? "—"}</td>
                    <td>{line.quantity}</td>
                    <td>{currency(line.unitRate, transaction.currencyCode)}</td>
                    <td>{currency(line.taxableAmount, transaction.currencyCode)}</td>
                    <td>{currency(line.cgstAmount, transaction.currencyCode)}</td>
                    <td>{currency(line.sgstAmount, transaction.currencyCode)}</td>
                    <td>{currency(line.igstAmount, transaction.currencyCode)}</td>
                    <td>{currency(line.totalAmount, transaction.currencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            </div>
          ) : (
            <p className="text-sm text-[var(--erp-text-muted)]">No financial lines are available.</p>
          )}
          <dl className="ml-auto grid max-w-md grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt>Subtotal</dt><dd className="text-right">{currency(transaction.subtotal, transaction.currencyCode)}</dd>
            <dt>CGST</dt><dd className="text-right">{currency(transaction.cgstAmount, transaction.currencyCode)}</dd>
            <dt>SGST</dt><dd className="text-right">{currency(transaction.sgstAmount, transaction.currencyCode)}</dd>
            <dt>IGST</dt><dd className="text-right">{currency(transaction.igstAmount, transaction.currencyCode)}</dd>
            <dt className="font-semibold">Total tax</dt><dd className="text-right font-semibold">{currency(transaction.totalTaxAmount, transaction.currencyCode)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{currency(transaction.totalAmount, transaction.currencyCode)}</dd>
          </dl>
        </Card>
      </Section>
    </Page>
  );
}
