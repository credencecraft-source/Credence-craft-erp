import Link from "next/link";
import { ArrowLeft, Settings2 } from "lucide-react";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const priceListTypes = ["Qty Based", "Location Based", "Hierarchy Based", "Role Based"];

export default function PriceListSettingsPage({
  workspaceId,
  organizationId,
}: {
  workspaceId: string;
  organizationId: string;
}) {
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/price-list`;

  return (
    <Page>
      <Section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--erp-muted)]">Master Data / Price List</p>
            <h1 className="text-2xl font-semibold text-[var(--erp-text)]">Price List Settings</h1>
            <p className="text-sm text-[var(--erp-muted)]">
              Review the price list types available when creating Price List records.
            </p>
          </div>
          <Link
            href={reportPath}
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] px-3 text-sm font-medium text-[var(--erp-text)] transition hover:bg-[var(--erp-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Price List
          </Link>
        </div>

        <Card className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
              <Settings2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-[var(--erp-text)]">Available price list types</h2>
              <p className="text-sm text-[var(--erp-muted)]">
                These are the current options for the Price List Type field.
              </p>
            </div>
          </div>

          <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {priceListTypes.map((type) => (
              <li
                key={type}
                className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-4 py-3 text-sm font-medium text-[var(--erp-text)]"
              >
                {type}
              </li>
            ))}
          </ul>

          <p className="border-t border-[var(--erp-border)] pt-4 text-sm text-[var(--erp-muted)]">
            These options are currently maintained by the application and cannot be changed here.
          </p>
        </Card>
      </Section>
    </Page>
  );
}
