import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getMasterValuesForOrganization } from "@/lib/master-data/master-data-constants";
import { getMasterDefinition } from "@/lib/master-data/master-data-registry";
import { getOrganizationForUser, requireOrganizationPermission } from "@/lib/services/organizations/organization-service";

function formatFieldValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "object" && item !== null
      ? String((item as Record<string, unknown>).color ?? (item as Record<string, unknown>).variant ?? "Variant")
      : String(item)).join(", ") || "—";
  }
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default async function MasterDataRecordDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string; moduleKey: string; recordCode: string }>;
}) {
  const { workspaceId, organizationId, moduleKey, recordCode } = await params;

  if (moduleKey !== "article" || !recordCode.trim()) {
    notFound();
  }

  const user = await requireSessionUser();

  if (!user.workspace_id) {
    redirect("/");
  }

  if (user.workspace_id !== workspaceId) {
    notFound();
  }

  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    notFound();
  }

  await requireOrganizationPermission(user.id, organization.id, "MANAGE_MASTER_DATA");

  const definition = getMasterDefinition("article");
  const isValueId = /^[\da-f-]{36}$/i.test(recordCode);
  const records = await getMasterValuesForOrganization(organization.id, "article", true, {
    limit: 1,
    includeDummyData: true,
    ...(isValueId ? { search: recordCode, exactSearch: true } : { articleCode: recordCode }),
  });
  const normalizedRecordCode = recordCode.trim().toLocaleLowerCase();
  const record = records.find((item) => (
    item.value_id === recordCode ||
    (item.code && item.code.toLocaleLowerCase() === normalizedRecordCode)
  ));

  if (!definition || !record) {
    notFound();
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/article`}
          className="inline-flex rounded-lg text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
        >
          Back to Articles
        </Link>

        <div>
          <p className="erp-eyebrow">Article</p>
          <h1 className="mt-2 text-2xl font-bold text-[var(--erp-text)]">{record.label}</h1>
          {record.code ? <p className="mt-1 text-sm text-slate-600">{record.code}</p> : null}
        </div>

        <Card>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {definition.fields.map((field) => (
              <div key={field.key} className="min-w-0 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
                <dt className="text-xs font-semibold text-slate-600">{field.label}</dt>
                <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{formatFieldValue(record.fields[field.key])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </Section>
    </Page>
  );
}
