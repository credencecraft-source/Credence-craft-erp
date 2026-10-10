import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getVersionDetails } from "@/lib/services/platform/version-service";
import {
  getVersionTransactionRestrictions,
  upsertVersionTransactionRestrictions,
} from "@/lib/services/platform/version-transaction-restriction-service";

type TableMetadata = { modelName: string; tableName: string; idField: string };

async function getDatabaseTableMetadata(): Promise<TableMetadata[]> {
  const schemaDir = path.join(process.cwd(), "prisma", "schema");
  const schemaFiles = (await readdir(schemaDir)).filter((file) => file.endsWith(".prisma")).sort();
  const tables: TableMetadata[] = [];

  for (const file of schemaFiles) {
    const contents = await readFile(path.join(schemaDir, file), "utf8");
    const modelBlocks = [...contents.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)];
    for (const match of modelBlocks) {
      const modelName = match[1];
      const modelBody = match[2];
      const tableName = modelBody.match(/@@map\(\s*"([^"]+)"\s*\)/)?.[1] ?? modelName;
      const idField = modelBody.match(/(^|\n)\s*([A-Za-z0-9_]+)\s+[^\n]*@id(?:\s|$)/m)?.[2] ?? "id";
      tables.push({ modelName, tableName, idField });
    }
  }

  return tables.sort((left, right) => left.tableName.localeCompare(right.tableName));
}

export default async function VersionTransactionBasedRestrictionPage({
  params,
  searchParams,
}: {
  params: Promise<{ versionId: string }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const { versionId } = await params;
  const query = (await searchParams) ?? {};
  const version = await getVersionDetails(versionId);
  if (!version) redirect(`/platform/versions?error=Version%20not%20found`);
  const selectedVersion = version;

  const databaseTables = await getDatabaseTableMetadata();
  const restrictions = await getVersionTransactionRestrictions(selectedVersion.id);
  const segments = Array.from(
    new Map(
      version.businessTypes.flatMap((entry) => entry.segments.map((assignment) => [assignment.segment.id, assignment.segment] as const)),
    ).values(),
  ).sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
  const restrictionByCell = new Map(
    restrictions.map((restriction) => [`${restriction.form_key}:${restriction.segment_id}`, restriction.monthly_entry_limit]),
  );

  async function saveLimitsAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    const formKey = String(formData.get("formKey") || "").trim();
    try {
      await upsertVersionTransactionRestrictions({
        versionId: selectedVersion.id,
        formKey,
        restrictions: segments.map((segment) => {
          const rawLimit = String(formData.get(`limit:${segment.id}`) || "").trim();
          return { segmentId: segment.id, monthlyEntryLimit: rawLimit === "" ? null : Number(rawLimit) };
        }),
      });
    } catch (error) {
      redirect(`/platform/versions/${selectedVersion.id}/transaction-based?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save transaction limits.")}`);
    }
    redirect(`/platform/versions/${selectedVersion.id}/transaction-based?success=Transaction%20limits%20saved.`);
  }

  return (
    <Page className="max-w-7xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">{version.version_name} / Application level</p>
            <h1 className="text-2xl font-bold text-slate-900">Transaction-based restrictions</h1>
            <p className="text-sm text-slate-600">Set the monthly record limit for each transaction form and segment. Blank means unlimited.</p>
          </div>
          <Link href={`/platform/versions/${version.id}`} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to version</Link>
        </div>

        {query.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
        {query.success && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{query.success}</p>}

        <Card className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3 py-3">Form / table</th>
                  <th className="whitespace-nowrap px-3 py-3">Model</th>
                  <th className="whitespace-nowrap px-3 py-3">Primary key</th>
                  {segments.map((segment) => <th key={segment.id} className="min-w-[170px] whitespace-nowrap px-3 py-3">{segment.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {databaseTables.map((table) => (
                  <tr key={table.tableName}>
                    <td className="px-3 py-3 font-semibold text-slate-900">{table.tableName}</td>
                    <td className="px-3 py-3 text-slate-700">{table.modelName}</td>
                    <td className="px-3 py-3 text-slate-600">{table.idField}</td>
                    {segments.map((segment) => (
                      <td key={segment.id} className="px-3 py-3">
                        <form action={saveLimitsAction} className="flex min-w-[155px] items-center gap-2">
                          <input type="hidden" name="formKey" value={table.tableName} />
                          <Input name={`limit:${segment.id}`} type="number" min="0" step="1" defaultValue={restrictionByCell.get(`${table.tableName}:${segment.id}`) ?? ""} placeholder="Unlimited" aria-label={`${table.tableName} limit for ${segment.name}`} className="w-28 rounded-md border-slate-200 px-2 py-1.5 text-xs" />
                          <Button type="submit" size="sm" className="bg-violet-600 hover:bg-violet-700">Save</Button>
                        </form>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      </Section>
    </Page>
  );
}