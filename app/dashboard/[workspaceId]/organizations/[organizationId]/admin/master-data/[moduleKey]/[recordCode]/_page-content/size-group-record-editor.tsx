"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Select from "@/components/ui/Select";
import type { updateMasterValueAction } from "@/app/dashboard/[workspaceId]/organizations/[organizationId]/settings/master-data/[moduleKey]/master-data-editor-page";

type SizeGroupRecord = {
  id: string;
  valueId: string;
  label: string;
  brand: string;
  measurementChart: string;
  sizes: string[];
};

type LookupOption = { label: string };

type SizeGroupRecordEditorProps = {
  workspaceId: string;
  organizationId: string;
  record: SizeGroupRecord;
  brandOptions: LookupOption[];
  measurementChartOptions: LookupOption[];
  sizeOptions: LookupOption[];
  updateAction: typeof updateMasterValueAction;
  error?: string;
  saved?: string;
  readOnly: boolean;
};

export default function SizeGroupRecordEditor({
  workspaceId,
  organizationId,
  record,
  brandOptions,
  measurementChartOptions,
  sizeOptions,
  updateAction,
  error,
  saved,
  readOnly,
}: SizeGroupRecordEditorProps) {
  const router = useRouter();
  const [sizes, setSizes] = useState(record.sizes.length > 0 ? record.sizes : [""]);
  const recordPath = `/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/size-group/${encodeURIComponent(record.id)}`;

  if (readOnly) {
    return (
      <Page as="div">
        <Section className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Link
                href={`/dashboard/${workspaceId}/organizations/${organizationId}/admin/master-data/size-group`}
                className="text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline"
              >
                Back to Size Groups
              </Link>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--erp-brand)]">Master Data</p>
              <h1 className="mt-1 break-words text-2xl font-bold text-[var(--erp-text)]">{record.label}</h1>
            </div>
            <Button type="button" onClick={() => router.push(`${recordPath}?mode=edit`)}>Edit</Button>
          </div>
          {error ? (
            <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
              {error}
            </p>
          ) : null}
          {saved === "update" ? (
            <p role="status" className="rounded-lg border border-[var(--erp-success)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-success)]">
              Size Group updated successfully.
            </p>
          ) : null}
          <Card className="space-y-5 p-6">
            <h2 className="text-base font-semibold text-[var(--erp-text)]">Size Group details</h2>
            <dl className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-xs font-medium text-[var(--erp-muted)]">Brand</dt>
                <dd className="break-words text-sm text-[var(--erp-text)]">{record.brand || "—"}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs font-medium text-[var(--erp-muted)]">Measurement Chart</dt>
                <dd className="break-words text-sm text-[var(--erp-text)]">{record.measurementChart || "—"}</dd>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <dt className="text-xs font-medium text-[var(--erp-muted)]">Sizes</dt>
                <dd className="break-words text-sm text-[var(--erp-text)]">{record.sizes.join(", ") || "—"}</dd>
              </div>
            </dl>
          </Card>
        </Section>
      </Page>
    );
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={recordPath} className="text-sm font-semibold text-[var(--erp-brand)] underline-offset-4 hover:underline">
              Back to Size Group details
            </Link>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[var(--erp-brand)]">Master Data</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--erp-text)]">Edit Size Group</h1>
            <p className="mt-1 text-sm text-slate-600">{record.label}</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => router.push(recordPath)}>Cancel edit</Button>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
            {error}
          </p>
        ) : null}
        {saved === "update" ? (
          <p role="status" className="rounded-lg border border-[var(--erp-success)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-success)]">
            Size Group updated successfully.
          </p>
        ) : null}

        <Card className="p-6">
          <form action={updateAction} className="space-y-6">
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <input type="hidden" name="organizationId" value={organizationId} />
            <input type="hidden" name="moduleKey" value="size-group" />
            <input type="hidden" name="valueId" value={record.valueId} />
            <input type="hidden" name="returnToSizeGroupDetail" value="true" />

            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Brand"
                name="field_Brand1"
                required
                value={record.brand}
                onChange={() => undefined}
                options={[
                  { value: "", label: "Select Brand" },
                  ...brandOptions.map(({ label }) => ({ value: label, label })),
                ]}
              />
              <Input
                label="Size Group"
                name="field_Size_Group"
                required
                defaultValue={record.label}
              />
              <Select
                label="Measurement Chart"
                name="field_Measurement_Chart1"
                value={record.measurementChart}
                onChange={() => undefined}
                options={[
                  { value: "", label: "Select Measurement Chart" },
                  ...measurementChartOptions.map(({ label }) => ({ value: label, label })),
                ]}
              />
            </div>

            <fieldset className="min-w-0 space-y-4 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--erp-border)] pb-3">
                <legend className="text-sm font-semibold text-[var(--erp-text)]">Sizes *</legend>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setSizes((current) => [...current, ""])}
                >
                  Add size
                </Button>
              </div>
              <div className="space-y-3">
                {sizes.map((selectedSize, index) => {
                  const otherSelections = new Set(sizes.filter((_, rowIndex) => rowIndex !== index && Boolean(_)));
                  const availableOptions = sizeOptions.filter((option) =>
                    option.label === selectedSize || !otherSelections.has(option.label));
                  return (
                    <div key={`size-${index}`} className="grid min-w-0 items-end gap-3 rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
                      <div className="space-y-1">
                        <span className="block text-xs font-semibold text-slate-600">Sl No</span>
                        <span className="flex h-10 items-center justify-center rounded-lg border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-sm font-semibold tabular-nums text-slate-600">
                          {index + 1}
                        </span>
                      </div>
                      <Select
                        label="Size"
                        value={selectedSize}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSizes((current) => current.map((size, rowIndex) => rowIndex === index ? value : size));
                        }}
                        options={[
                          { value: "", label: "Select Size" },
                          ...availableOptions.map(({ label }) => ({ value: label, label })),
                        ]}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          aria-label={`Move ${selectedSize || `size ${index + 1}`} up`}
                          disabled={index === 0}
                          onClick={() => setSizes((current) => {
                            if (index === 0) return current;
                            const next = [...current];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            return next;
                          })}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          aria-label={`Move ${selectedSize || `size ${index + 1}`} down`}
                          disabled={index === sizes.length - 1}
                          onClick={() => setSizes((current) => {
                            if (index >= current.length - 1) return current;
                            const next = [...current];
                            [next[index], next[index + 1]] = [next[index + 1], next[index]];
                            return next;
                          })}
                        >
                          Move down
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setSizes((current) => {
                            const remaining = current.filter((_, rowIndex) => rowIndex !== index);
                            return remaining.length > 0 ? remaining : [""];
                          })}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {sizes.filter(Boolean).map((size, index) => (
                <input key={`${size}-${index}`} type="hidden" name="field_Size" value={size} />
              ))}
              <p className="text-xs text-slate-500">Add at least one size. Each size can be selected only once.</p>
            </fieldset>

            <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--erp-border)] pt-4">
              <Button type="button" variant="secondary" onClick={() => router.push(recordPath)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </div>
          </form>
        </Card>
      </Section>
    </Page>
  );
}
