import Link from "next/link";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { getVersionDetails } from "@/lib/services/platform/version-service";
import { getSegmentFormRestriction, upsertSegmentFormRestriction } from "@/lib/services/platform/segment-form-restriction-service";

type TableField = { name: string; type: string; attributes: string };
type TableMetadata = {
  modelName: string;
  tableName: string;
  idField: string;
  purpose: string;
  fields: TableField[];
};

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

      const idField = fields.find((field) => field.attributes.includes("@id"))?.name ?? "id";
      return {
        modelName,
        tableName: mappedTableName,
        idField,
        purpose: `Business data table used in the ERP workflow for the ${modelName} model.`,
        fields,
      } satisfies TableMetadata;
    }
  }

  return null;
}

export default async function TransactionBasedRestrictionTablePage({
  params,
  searchParams,
}: {
  params: Promise<{
    versionId: string;
    versionName: string;
    businessTypeName: string;
    segmentName: string;
    tableName: string;
  }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}) {
  const { versionId, versionName, businessTypeName, segmentName, tableName } = await params;
  const query = (await searchParams) ?? {};
  const version = await getVersionDetails(versionId);
  const entry = version?.businessTypes.find((item) => toUrlSegment(item.businessType.name) === businessTypeName);
  const assignment = entry?.segments.find((item) => toSegmentUrlSegment(item.segment.name) === segmentName);
  const table = await getTableMetadata(tableName);

  if (!version || !entry || !assignment || !table) redirect(`/platform/versions/${versionId}`);

  const selectedAssignment = assignment;
  const selectedTable = table;

  const canonicalPath = `/platform/versions/${version.id}/${toUrlSegment(version.version_name)}/${toUrlSegment(entry.businessType.name)}/${toSegmentUrlSegment(assignment.segment.name)}/transactionbased-restriction`;
  if (
    versionName !== toUrlSegment(version.version_name) ||
    businessTypeName !== toUrlSegment(entry.businessType.name) ||
    segmentName !== toSegmentUrlSegment(assignment.segment.name) ||
    tableName !== table.tableName
  ) {
    redirect(`${canonicalPath}/${table.tableName}`);
  }

  const formRestriction = await getSegmentFormRestriction(selectedAssignment.id, selectedTable.tableName);
  const savedFieldSumLimits: Record<string, number> = {};
  if (formRestriction && typeof formRestriction.field_sum_limits === "object" && formRestriction.field_sum_limits !== null && !Array.isArray(formRestriction.field_sum_limits)) {
    for (const [field, value] of Object.entries(formRestriction.field_sum_limits)) {
      if (typeof value === "number" && Number.isFinite(value)) savedFieldSumLimits[field] = value;
    }
  }

  async function saveFormRestrictionAction(formData: FormData) {
    "use server";
    await requirePlatformSessionAdmin();
    try {
      await upsertSegmentFormRestriction(selectedAssignment.id, {
        formKey: selectedTable.tableName,
        monthlyQtyLimit: formRestriction?.monthly_qty_limit ?? null,
        monthlyEntryLimit: formRestriction?.monthly_entry_limit ?? null,
        restrictedFields: formData.getAll("restrictedFields").map(String),
        fieldSumLimits: Object.fromEntries(
          selectedTable.fields.map((field) => {
            const rawValue = String(formData.get(`fieldSumLimit:${field.name}`) ?? "").trim();
            return [field.name, rawValue === "" ? null : Number(rawValue)];
          }),
        ),
      });
    } catch (error) {
      redirect(`${canonicalPath}/${selectedTable.tableName}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save form restriction.")}`);
    }
    redirect(`${canonicalPath}/${selectedTable.tableName}?success=Form%20restriction%20saved.`);
  }

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">{version.version_name} / {entry.businessType.name} / {assignment.segment.name.toUpperCase()}</p>
            <h1 className="text-2xl font-bold text-slate-900">{table.tableName}</h1>
            <p className="text-sm text-slate-600">{table.modelName} form-level fields and database definition.</p>
          </div>
          <Link href={canonicalPath} className="text-sm font-semibold text-slate-600 hover:text-slate-900">Back to transaction restrictions</Link>
        </div>

        {query.error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}
        {query.success && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{query.success}</p>}

        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Form fields</h2>
          <p className="mt-1 text-sm text-slate-500">Select restricted fields at record level.</p>
          <form action={saveFormRestrictionAction} className="mt-5 space-y-5">
            <div className="overflow-x-auto">
              <Table>
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-3">#</th>
                    <th className="px-3 py-3">Field name</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Definition</th>
                    <th className="px-3 py-3">Sum limit</th>
                    <th className="px-3 py-3 text-center">Restrict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {table.fields.map((field, index) => (
                    <tr key={field.name}>
                      <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{field.name}</td>
                      <td className="px-3 py-2 text-slate-700">{field.type}</td>
                      <td className="px-3 py-2 text-slate-600">{field.attributes || "-"}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          name={`fieldSumLimit:${field.name}`}
                          defaultValue={savedFieldSumLimits[field.name] ?? ""}
                          placeholder="-"
                          aria-label={`Sum limit for ${field.name}`}
                          className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-800"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          name="restrictedFields"
                          value={field.name}
                          defaultChecked={formRestriction?.restricted_fields.includes(field.name)}
                          aria-label={`Restrict ${field.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800">Save restrictions</button>
          </form>
        </Card>
      </Section>
    </Page>
  );
}