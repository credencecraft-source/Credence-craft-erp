import Link from "next/link";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { getVersionDetails } from "@/lib/services/platform/version-service";

type TableField = { name: string; type: string; attributes: string };
type TableMetadata = { modelName: string; tableName: string; idField: string; purpose: string; fields: TableField[] };

function toUrlSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toSegmentUrlSegment(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function getTableMetadata(tableName: string) {
  const schemaDir = path.join(process.cwd(), "prisma", "schema");
  const schemaFiles = (await readdir(schemaDir)).filter((file) => file.endsWith(".prisma")).sort();

  for (const file of schemaFiles) {
    const contents = await readFile(path.join(schemaDir, file), "utf8");
    const modelBlocks = [...contents.matchAll(/model\s+([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)];

    for (const match of modelBlocks) {
      const modelName = match[1];
      const modelBody = match[2];
      const mappedTableName = modelBody.match(/@@map\(\s*"([^"]+)"\s*\)/)?.[1] ?? modelName;
      if (mappedTableName !== tableName) continue;

      const fields = modelBody
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("//") && !line.startsWith("@@") && !line.startsWith("@"))
        .map((line) => line.match(/^([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+(?:\[\])?\??)(.*)$/))
        .filter((field): field is RegExpMatchArray => Boolean(field))
        .map((field) => ({ name: field[1], type: field[2], attributes: field[3].trim() }));

      return {
        modelName,
        tableName: mappedTableName,
        idField: fields.find((field) => field.attributes.includes("@id"))?.name ?? "id",
        purpose: `Business data table used in the ERP workflow for the ${modelName} model.`,
        fields,
      } satisfies TableMetadata;
    }
  }

  return null;
}

export default async function TransactionBasedRestrictionFieldsPage({
  params,
}: {
  params: Promise<{
    versionId: string;
    versionName: string;
    businessTypeName: string;
    segmentName: string;
    tableName: string;
  }>;
}) {
  const { versionId, versionName, businessTypeName, segmentName, tableName } = await params;
  const version = await getVersionDetails(versionId);
  const entry = version?.businessTypes.find((item) => toUrlSegment(item.businessType.name) === businessTypeName);
  const assignment = entry?.segments.find((item) => toSegmentUrlSegment(item.segment.name) === segmentName);
  const table = await getTableMetadata(tableName);

  if (!version || !entry || !assignment || !table) redirect(`/platform/versions/${versionId}`);

  const formPath = `/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}/${toSegmentUrlSegment(assignment.segment.name)}/transactionbased-restriction/${table.tableName}`;
  const canonicalPath = `${formPath}/fields`;
  if (
    versionName !== toUrlSegment(version.version_name) ||
    businessTypeName !== toUrlSegment(entry.businessType.name) ||
    segmentName !== toSegmentUrlSegment(assignment.segment.name) ||
    tableName !== table.tableName
  ) {
    redirect(canonicalPath);
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">{version.version_name} / {entry.businessType.name} / {assignment.segment.name.toUpperCase()}</p>
            <h1 className="text-2xl font-bold text-slate-900">{table.tableName} fields</h1>
            <p className="text-sm text-slate-600">{table.modelName} field definitions and database attributes.</p>
          </div>
          <Link href={formPath} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to form restrictions</Link>
        </div>

        <Card className="p-6">
          <div className="grid gap-4 border-b border-slate-100 pb-5 sm:grid-cols-3">
            <div><p className="text-xs uppercase tracking-wider text-slate-500">Model</p><p className="mt-1 font-semibold text-slate-900">{table.modelName}</p></div>
            <div><p className="text-xs uppercase tracking-wider text-slate-500">Primary key</p><p className="mt-1 font-semibold text-slate-900">{table.idField}</p></div>
            <div><p className="text-xs uppercase tracking-wider text-slate-500">Purpose</p><p className="mt-1 text-sm text-slate-700">{table.purpose}</p></div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <Table>
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-3 py-3">Field</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Definition</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {table.fields.map((field) => (
                  <tr key={field.name}>
                    <td className="px-3 py-3 font-semibold text-slate-900">{field.name}</td>
                    <td className="px-3 py-3 text-slate-700">{field.type}</td>
                    <td className="px-3 py-3 text-slate-600">{field.attributes || "-"}</td>
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
