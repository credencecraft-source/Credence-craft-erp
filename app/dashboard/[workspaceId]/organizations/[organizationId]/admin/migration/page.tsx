import Link from "next/link";
import { ArrowRight, FileSpreadsheet, ListChecks } from "lucide-react";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function MigrationPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const migrationPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/migration`;

  return (
    <Page as="div">
      <Section>
        <div>
          <h1 className="text-2xl font-semibold text-[var(--erp-text)]">Migration</h1>
          <p className="mt-2 text-sm text-[var(--erp-muted)]">
            Choose how you want to set up your organization masters.
          </p>
        </div>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <Link
            href={`${migrationPath}/excel`}
            className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
          >
            <Card className="flex h-full min-h-48 flex-col justify-between gap-6 transition group-hover:border-[var(--erp-brand)]">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                  <FileSpreadsheet className="h-5 w-5" aria-hidden="true" />
                </span>
                <ArrowRight className="h-5 w-5 text-[var(--erp-muted)] transition group-hover:text-[var(--erp-brand)]" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--erp-text)]">Via Excel</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">
                  Download templates, fill in your masters across three stages, and upload each workbook to import.
                </p>
              </div>
            </Card>
          </Link>
          <Link
            href={`${migrationPath}/direct`}
            className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
          >
            <Card className="flex h-full min-h-48 flex-col justify-between gap-6 transition group-hover:border-[var(--erp-brand)]">
              <div className="flex items-start justify-between gap-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                  <ListChecks className="h-5 w-5" aria-hidden="true" />
                </span>
                <ArrowRight className="h-5 w-5 text-[var(--erp-muted)] transition group-hover:text-[var(--erp-brand)]" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--erp-text)]">Direct</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">
                  Continue with the existing step-by-step master setup and enter values directly.
                </p>
              </div>
            </Card>
          </Link>
        </div>
      </Section>
    </Page>
  );
}
