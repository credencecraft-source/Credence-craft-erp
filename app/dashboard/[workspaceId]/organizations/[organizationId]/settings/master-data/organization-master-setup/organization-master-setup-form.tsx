"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";

type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  readOnly?: boolean;
  lookupModuleKey?: string;
  multiple?: boolean;
};
type Definition = {
  key: string;
  label: string;
  fields: Field[];
  labelField?: string;
};
type LookupOption = { id: string; label: string };
type Stage = {
  definitions: Definition[];
  existing: Record<string, string[]>;
  lookupOptions: Record<string, LookupOption[]>;
};
type SetupRecord = {
  moduleKey: string;
  label: string;
  fields: Record<string, string | number | boolean | null | string[]>;
};

const DEFAULT_SETUP_RECORDS: SetupRecord[] = [
  ...["Black", "White", "Red", "Blue", "Green", "Yellow", "Orange", "Pink", "Purple", "Brown", "Grey", "Navy Blue"].map((label) => ({ moduleKey: "color", label, fields: {} })),
  ...["S", "M", "L", "XL", "XXL", "XXXL", "XXXXL", "38", "39", "40", "42", "44", "46", "48"].map((label) => ({ moduleKey: "size", label, fields: { Size: label } })),
  { moduleKey: "order-volume", label: "Small", fields: { Order_Volume: "Small", From: 0, To: 100 } },
  { moduleKey: "order-volume", label: "Medium", fields: { Order_Volume: "Medium", From: 100, To: 500 } },
  { moduleKey: "order-volume", label: "Large", fields: { Order_Volume: "Large", From: 500, To: null } },
  { moduleKey: "currency-type", label: "INR", fields: { Currency_Type: "INR" } },
  { moduleKey: "currency-type", label: "USD", fields: { Currency_Type: "USD" } },
  { moduleKey: "product-master", label: "Finished Goods", fields: { Product_Master_name: "Finished Goods" } },
  ...["CUTTING", "PARTS", "ASSEMBLY", "EMBROIDERY", "KAKA BUTTONING", "IRONING", "PACKING", "WASHING"].map((label) => ({ moduleKey: "process-master", label, fields: { Process_Name: label } })),
  { moduleKey: "raw-material-type", label: "ITEM", fields: { Raw_Material_Type: "ITEM" } },
  { moduleKey: "raw-material-type", label: "SERVICE", fields: { Raw_Material_Type: "SERVICE" } },
];

function emptyRecord(definition: Definition): SetupRecord {
  return { moduleKey: definition.key, label: "", fields: {} };
}

function initialRecords(
  definitions: Definition[],
  existing: Record<string, string[]>,
) {
  return definitions.flatMap((definition) => {
    if (
      definition.key === "size" ||
      definition.key === "color" ||
      definition.key === "entity" ||
      definition.key === "pre-order-checklist" ||
      definition.key === "merchandiser" ||
      definition.key === "currency-type" ||
      definition.key === "product-master" ||
      definition.key === "process-master" ||
      definition.key === "raw-material-type"
    ) return [];

    const existingLabels = new Set(
      (existing[definition.key] ?? []).map((label) => label.trim().toLowerCase()),
    );
    const defaults = DEFAULT_SETUP_RECORDS.filter(
      (record) =>
        record.moduleKey === definition.key &&
        !existingLabels.has(record.label.toLowerCase()),
    );
    return defaults.length > 0
      ? defaults.map((record) => ({ ...record, fields: { ...record.fields } }))
      : [emptyRecord(definition)];
  });
}

function SubmitButton({
  activeStage,
}: {
  activeStage: "independent" | "related" | "third";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending
        ? "Saving..."
        : activeStage === "third"
          ? "Save and Complete"
          : "Save and Create Master"}
    </Button>
  );
}

function MultiLookupField({
  field,
  options,
  value,
  onChange,
}: {
  field: Field;
  options: LookupOption[];
  value: string | number | boolean | null | string[] | undefined;
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value)
    ? value.map(String)
    : value
      ? [String(value)]
      : [];
  const toggle = (optionId: string) =>
    onChange(
      selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId],
    );
  const labels = selected.map(
    (id) => options.find((option) => option.id === id)?.label ?? id,
  );

  return (
    <div className="min-w-0 md:basis-0 md:flex-1">
      <p className="mb-1 text-xs font-semibold text-slate-600">
        {field.label}
        {field.required ? " *" : ""}
      </p>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] px-2 py-1.5">
        {labels.length > 0 ? (
          labels.map((label) => (
            <span
              key={label}
              className="rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800"
            >
              {label}
            </span>
          ))
        ) : (
          <span className="px-1 text-xs text-slate-400">
            No {field.label.toLowerCase()} selected
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          className="ml-auto shrink-0 px-2 py-1 text-xs"
          onClick={() => setOpen(true)}
        >
          {selected.length > 0 ? "Change" : `Select ${field.label}`}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={`${field.label} selection`}
        size="md"
      >
        <div className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Select {field.label}
            </h2>
            <p className="text-sm text-slate-500">Choose one or more values.</p>
          </div>
          <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
            {options.map((option) => (
              <Checkbox
                key={option.id}
                label={option.label}
                checked={selected.includes(option.id)}
                onChange={() => toggle(option.id)}
              />
            ))}
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function OrganizationMasterSetupForm({
  action,
  workspaceId,
  organizationId,
  stage,
  activeStage,
}: {
  action: (formData: FormData) => void | Promise<void>;
  workspaceId: string;
  organizationId: string;
  stage: Stage;
  activeStage: "independent" | "related" | "third";
}) {
  const [records, setRecords] = useState<SetupRecord[]>(() =>
    initialRecords(stage.definitions, stage.existing),
  );
  const [bulkInputs, setBulkInputs] = useState<Record<string, string>>({
    color: "",
    "currency-type": "",
    entity: "",
    merchandiser: "",
    "process-master": "",
    "product-master": "",
    "pre-order-checklist": "",
    "raw-material-type": "",
    size: "",
  });
  const updateRecord = (index: number, update: Partial<SetupRecord>) =>
    setRecords((current) =>
      current.map((record, recordIndex) =>
        recordIndex === index ? { ...record, ...update } : record,
      ),
    );
  const updateField = (
    index: number,
    field: Field,
    value: string | boolean | string[],
  ) =>
    setRecords((current) =>
      current.map((record, recordIndex) =>
        recordIndex === index
          ? { ...record, fields: { ...record.fields, [field.key]: value } }
          : record,
      ),
    );
  const removeRecord = (index: number) =>
    setRecords((current) =>
      current.filter((_, recordIndex) => recordIndex !== index),
    );
  const addRecord = (definition: Definition) =>
    setRecords((current) => [...current, emptyRecord(definition)]);

  return (
    <form action={action} className="space-y-6">
      <input
        type="hidden"
        name="setup"
        value={JSON.stringify({
          stage: activeStage,
          records: [
            ...records,
            ...(activeStage === "independent"
              ? ["color", "currency-type", "entity", "merchandiser", "pre-order-checklist", "product-master", "process-master", "raw-material-type", "size"].flatMap((moduleKey) =>
                  (bulkInputs[moduleKey] ?? "")
                    .split(",")
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .map((value) => ({
                      moduleKey,
                      label: value,
                      fields: moduleKey === "size" ? { Size: value } : {},
                    })),
                )
              : []),
          ].filter((record) => record.label.trim()),
        })}
      />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-2 md:grid-cols-3" aria-label="Onboarding steps">
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/organization-master-setup`}
          aria-current={activeStage === "independent" ? "step" : undefined}
          className={`rounded-lg border px-4 py-3 transition-colors hover:border-emerald-400 ${activeStage === "independent" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Step 1
          </p>
          <p className="font-bold text-slate-900">Onboarding</p>
          <p className="text-xs text-slate-600">Independent masters</p>
        </Link>
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/organization-master-setup?step=related`}
          aria-current={activeStage === "related" ? "step" : undefined}
          className={`rounded-lg border px-4 py-3 transition-colors hover:border-emerald-400 ${activeStage === "related" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Step 2
          </p>
          <p className="font-bold text-slate-900">Related Masters</p>
          <p className="text-xs text-slate-600">Masters using lookups</p>
        </Link>
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/master-data/organization-master-setup?step=third`}
          aria-current={activeStage === "third" ? "step" : undefined}
          className={`rounded-lg border px-4 py-3 transition-colors hover:border-emerald-400 ${activeStage === "third" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Step 3
          </p>
          <p className="font-bold text-slate-900">Production Masters</p>
          <p className="text-xs text-slate-600">Operation and material setup</p>
        </Link>
      </div>
      {stage.definitions.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            No master types are available for this step.
          </p>
        </Card>
      ) : (
        stage.definitions.map((definition) => {
          const labelField = definition.labelField ?? definition.fields[0]?.key;
          const editableFields = definition.fields
            .filter((field) => field.key !== labelField && !field.readOnly)
            .sort((left, right) => {
              if (activeStage === "independent") return 0;
              return (
                Number(right.type === "lookup") - Number(left.type === "lookup")
              );
            });
          const removeButton = (recordIndex: number) => (
            <Button
              className="h-9 min-h-9 w-9 shrink-0 self-end p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => removeRecord(recordIndex)}
              aria-label={`Remove ${definition.label} entry`}
              title="Remove entry"
            >
              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
            </Button>
          );
          return (
            <Card key={definition.key} className="space-y-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {definition.label}
                </h2>
                <p className="text-xs text-slate-500">
                  Existing records:{" "}
                  {stage.existing[definition.key]?.length ?? 0}
                </p>
              </div>
              {(stage.existing[definition.key] ?? []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {stage.existing[definition.key].map((label) => (
                    <span
                      key={label}
                      className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No records created yet.
                </p>
              )}
              {records.map((record, index) =>
                record.moduleKey === definition.key ? (
                  <div
                    key={`${definition.key}-${index}`}
                    className="overflow-x-auto rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-2"
                  >
                    <div
                      className="grid min-w-0 gap-2 items-end"
                      style={{
                        gridTemplateColumns:
                          activeStage === "independent"
                            ? `minmax(12rem, 1.2fr) repeat(${editableFields.length}, minmax(7rem, 1fr))`
                            : `repeat(${editableFields.length}, minmax(8rem, 1fr)) minmax(12rem, 1.1fr)`,
                      }}
                    >
                      {activeStage === "independent" ? (
                        <div className="flex min-w-0 items-end gap-1">
                          <div className="min-w-0 flex-1">
                            <Input
                              className="min-w-0 text-xs"
                              label={`${definition.label} name`}
                              aria-label={`${definition.label} name`}
                              value={record.label}
                              onChange={(event) =>
                                updateRecord(index, { label: event.target.value })
                              }
                              placeholder={`${definition.label} name`}
                            />
                          </div>
                          {removeButton(index)}
                        </div>
                      ) : null}
                      {editableFields.map((field) =>
                        field.type === "lookup" &&
                        field.lookupModuleKey &&
                        field.multiple ? (
                          <MultiLookupField
                            key={field.key}
                            field={field}
                            options={
                              stage.lookupOptions[field.lookupModuleKey] ?? []
                            }
                            value={record.fields[field.key]}
                            onChange={(values) =>
                              updateField(index, field, values)
                            }
                          />
                        ) : field.type === "lookup" && field.lookupModuleKey ? (
                          <Select
                            className="min-w-0 text-xs"
                            key={field.key}
                            label={field.label}
                            aria-label={field.label}
                            value={String(record.fields[field.key] ?? "")}
                            onChange={(event) =>
                              updateField(index, field, event.target.value)
                            }
                          >
                            <option value="">Select {field.label}</option>
                            {(
                              stage.lookupOptions[field.lookupModuleKey] ?? []
                            ).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        ) : field.type === "checkbox" ? (
                          <div className="min-w-0" key={field.key}>
                            <Checkbox
                              aria-label={field.label}
                              label={`${field.label}${field.required ? " *" : ""}`}
                              checked={
                                record.fields[field.key] === true ||
                                record.fields[field.key] === "true"
                              }
                              onChange={(event) =>
                                updateField(index, field, event.target.checked)
                              }
                            />
                          </div>
                        ) : (
                          <Input
                            className="min-w-0 text-xs"
                            key={field.key}
                            label={field.label}
                            aria-label={field.label}
                            type={
                              field.type === "number" ||
                              field.type === "percentage" ||
                              field.type === "decimal"
                                ? "number"
                                : field.type === "date"
                                  ? "date"
                                  : "text"
                            }
                            value={String(record.fields[field.key] ?? "")}
                            onChange={(event) =>
                              updateField(index, field, event.target.value)
                            }
                            placeholder={`${field.label}${field.required ? " *" : ""}`}
                          />
                        ),
                      )}
                      {activeStage !== "independent" ? (
                        <div className="flex min-w-0 items-end gap-1">
                          <div className="min-w-0 flex-1">
                            <Input
                              className="min-w-0 text-xs"
                              label={`${definition.label} name`}
                              aria-label={`${definition.label} name`}
                              value={record.label}
                              onChange={(event) =>
                                updateRecord(index, { label: event.target.value })
                              }
                              placeholder={`${definition.label} name`}
                            />
                          </div>
                          {removeButton(index)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null,
              )}
              {definition.key === "size" ||
              definition.key === "color" ||
              definition.key === "entity" ||
              definition.key === "pre-order-checklist" ||
              definition.key === "merchandiser" ||
              definition.key === "currency-type" ||
              definition.key === "product-master" ||
              definition.key === "process-master" ||
              definition.key === "raw-material-type" ? (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <Input
                      className="min-w-0 text-xs"
                      label={`${definition.key === "entity" ? "Entities" : `${definition.label}s`} separated by commas`}
                      aria-label={`${definition.key === "entity" ? "Entities" : `${definition.label}s`} separated by commas`}
                      value={bulkInputs[definition.key] ?? ""}
                      onChange={(event) =>
                        setBulkInputs((current) => ({
                          ...current,
                          [definition.key]: event.target.value,
                        }))
                      }
                      placeholder={
                        definition.key === "size"
                          ? "S, M, L, XL"
                          : definition.key === "color"
                            ? "Black, White, Red"
                            : definition.key === "entity"
                              ? "Company A, Company B"
                              : definition.key === "pre-order-checklist"
                                ? "Checklist 1, Checklist 2"
                                : definition.key === "currency-type"
                                  ? "INR, USD, EUR"
                                  : definition.key === "product-master"
                                    ? "Finished Goods, Accessories"
                                    : definition.key === "process-master"
                                      ? "Cutting, Sewing, Packing"
                                      : definition.key === "raw-material-type"
                                        ? "Item, Service, Accessory"
                                        : "Alice, Bob, Charlie"
                      }
                    />
                  </div>
                  <Button
                    className="ml-auto shrink-0"
                    type="submit"
                    variant="secondary"
                  >
                    Create {definition.label} Master
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addRecord(definition)}
                >
                  Add {definition.label}
                </Button>
              )}
            </Card>
          );
        })
      )}
      <div className="flex justify-end">
        <SubmitButton activeStage={activeStage} />
      </div>
    </form>
  );
}
