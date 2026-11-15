import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { requireFinanceOrganizationAccess } from "@/lib/services/finance/finance-api-access";

export default async function FinanceManagementPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const user = await requireSessionUser();
  await requireFinanceOrganizationAccess(user.id, organizationId);
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-[var(--erp-brand)]">Finance</p>
          <h1 className="mt-1 text-2xl font-semibold">Finance Management</h1>
          <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Manage finance transactions and accounting synchronization.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link href={`${base}/transactions`} className="block">
            <Card className="h-full">
              <p className="text-sm font-semibold text-[var(--erp-brand)]">Transactions</p>
              <h2 className="mt-2 text-lg font-semibold">Central Finance</h2>
              <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Sales and purchase documents, adjustments, and logistics references.</p>
              <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">Open -&gt;</span>
            </Card>
          </Link>
          <Link href={`${base}/procurement-bills`} className="block">
            <Card className="h-full">
              <p className="text-sm font-semibold text-[var(--erp-brand)]">Procurement</p>
              <h2 className="mt-2 text-lg font-semibold">Vendor Bills</h2>
              <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Match supplier invoices to approved Purchase Orders and accepted GRNs.</p>
              <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">Open -&gt;</span>
            </Card>
          </Link>
          <Link href={`${base}/sync-queue`} className="block">
            <Card className="h-full">
              <p className="text-sm font-semibold text-[var(--erp-brand)]">Provider operations</p>
              <h2 className="mt-2 text-lg font-semibold">Sync Queue</h2>
              <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Review pending and failed Tally or Zoho Books dispatches.</p>
              <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">Open -&gt;</span>
            </Card>
          </Link>
          <Link href={`${base}/integration-settings`} className="block">
            <Card className="h-full">
              <p className="text-sm font-semibold text-[var(--erp-brand)]">Administration</p>
              <h2 className="mt-2 text-lg font-semibold">Integration Settings</h2>
              <p className="mt-2 text-sm text-[var(--erp-text-muted)]">Configure encrypted provider credentials and ledger mappings.</p>
              <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">Open -&gt;</span>
            </Card>
          </Link>
        </div>
      </Section>
    </Page>
  );
}
