import Link from "next/link";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default function FinanceTransactionCreateBoundary({
  workspaceId,
  organizationId,
  title,
  description,
  sourceHref,
  sourceActionLabel,
}: {
  workspaceId: string;
  organizationId: string;
  title: string;
  description: string;
  sourceHref?: string;
  sourceActionLabel?: string;
}) {
  const reportHref = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management/transactions`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <header>
          <p className="text-sm font-semibold text-[var(--erp-brand)]">Finance</p>
          <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        </header>
        <Card className="space-y-4">
          <p className="text-sm text-[var(--erp-text-muted)]">{description}</p>
          <div className="flex flex-wrap gap-3">
            {sourceHref && sourceActionLabel && (
              <Link href={sourceHref}>
                <Button>{sourceActionLabel}</Button>
              </Link>
            )}
            <Link href={reportHref}>
              <Button variant="outline">Back to finance transactions</Button>
            </Link>
          </div>
        </Card>
      </Section>
    </Page>
  );
}
